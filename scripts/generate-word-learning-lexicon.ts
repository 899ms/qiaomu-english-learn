import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import process from "node:process"

type Level = "cet4" | "cet6" | "postgraduate" | "ielts" | "toefl" | "gre"

interface Options {
  cetPath?: string
  ecdictPath: string
  outPath: string
}

interface EcdictEntry {
  word: string
  phonetic: string
  translation: string
  tag: string
}

interface GeneratedEntry extends EcdictEntry {
  level: Level
}

const WORD_RE = /^[a-z][a-z-]*[a-z]$/i
const LEVEL_BY_TAG: Record<string, Level> = {
  cet4: "cet4",
  cet6: "cet6",
  ky: "postgraduate",
  ielts: "ielts",
  toefl: "toefl",
  gre: "gre",
}

const LEVEL_RANK: Record<Level, number> = {
  cet4: 1,
  cet6: 2,
  postgraduate: 3,
  ielts: 4,
  toefl: 5,
  gre: 6,
}
const POS_PREFIXES = new Set([
  "a",
  "abbr",
  "ad",
  "adj",
  "adv",
  "art",
  "aux",
  "conj",
  "int",
  "n",
  "num",
  "pl",
  "prep",
  "pron",
  "v",
  "vi",
  "vt",
])

function parseArgs(argv: string[]): Options {
  const args = new Map<string, string>()
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv
  for (let index = 0; index < normalizedArgv.length; index += 2) {
    const key = normalizedArgv[index]
    const value = normalizedArgv[index + 1]
    if (!key?.startsWith("--") || !value) {
      throw new Error(`Invalid argument near "${key ?? ""}". Expected --key value.`)
    }
    args.set(key.slice(2), value)
  }

  const cetPath = args.get("cet")
  const ecdictPath = args.get("ecdict")
  const outPath = args.get("out")

  if (!ecdictPath || !outPath) {
    throw new Error("Usage: pnpm generate:word-learning-lexicon -- --ecdict <ecdict.csv> --out <generated-lexicon.ts> [--cet <word-list.txt>]")
  }

  return {
    cetPath: cetPath ? resolve(cetPath) : undefined,
    ecdictPath: resolve(ecdictPath),
    outPath: resolve(outPath),
  }
}

function expandOptionalLetters(word: string): string[] {
  if (!word.includes("("))
    return [word]

  return [
    word.replace(/\([^)]*\)/g, ""),
    word.replace(/[()]/g, ""),
  ]
}

function expandSlashVariants(word: string): string[] {
  const [base, variant] = word.split("/")
  if (!base || !variant)
    return [word]

  if (!variant.startsWith("-")) {
    return [base, variant]
  }

  const suffix = variant.slice(1)
  if (!suffix)
    return [base]

  if (suffix === "yse" && base.endsWith("yze")) {
    return [base, `${base.slice(0, -2)}se`]
  }

  return [base, `${base.slice(0, -suffix.length)}${suffix}`]
}

function parseCetWords(input: string): Set<string> {
  const words = new Set<string>()

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim().toLowerCase()
    if (!line || line.includes(" "))
      continue

    for (const slashVariant of expandSlashVariants(line)) {
      for (const word of expandOptionalLetters(slashVariant)) {
        if (WORD_RE.test(word)) {
          words.add(word)
        }
      }
    }
  }

  return words
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false

  for (let index = 0; index < input.length; index++) {
    const char = input[index]
    const next = input[index + 1]

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\""
        index++
      }
      else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === "," && !inQuotes) {
      row.push(cell)
      cell = ""
      continue
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n")
        index++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      continue
    }

    cell += char
  }

  if (cell || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows
}

function parseEcdict(input: string): Map<string, EcdictEntry> {
  const [header = [], ...rows] = parseCsvRows(input)
  const wordIndex = header.indexOf("word")
  const phoneticIndex = header.indexOf("phonetic")
  const translationIndex = header.indexOf("translation")
  const tagIndex = header.indexOf("tag")

  if (wordIndex < 0 || phoneticIndex < 0 || translationIndex < 0 || tagIndex < 0) {
    throw new Error("ECDICT CSV must contain word, phonetic, translation, and tag columns.")
  }

  return new Map(
    rows
      .map((row): EcdictEntry | null => {
        const word = row[wordIndex]?.trim().toLowerCase()
        const translation = row[translationIndex]?.trim()
        if (!word || !translation || !WORD_RE.test(word))
          return null

        return {
          word,
          phonetic: row[phoneticIndex]?.trim() ?? "",
          translation: cleanTranslation(translation),
          tag: row[tagIndex]?.trim() ?? "",
        }
      })
      .filter((entry): entry is EcdictEntry => entry !== null)
      .map(entry => [entry.word, entry]),
  )
}

function cleanTranslation(translation: string): string {
  return translation
    .split(/\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("[网络]"))
    .join("\n")
}

function getShortTranslation(translation: string): string {
  const firstMeaning = translation
    .split(/\n/)
    .map(line => line.trim())
    .find(line => /[\u4E00-\u9FFF]/.test(line)) ?? translation
  const posPrefixMatch = firstMeaning.match(/^([a-z]+)\.\s*/i)
  const withoutPosPrefix = posPrefixMatch && POS_PREFIXES.has(posPrefixMatch[1]!.toLowerCase())
    ? firstMeaning.slice(posPrefixMatch[0].length)
    : firstMeaning

  return withoutPosPrefix
    .replace(/^\[[^\]]+\]\s*/, "")
    .split(/[，,；;]/)[0]
    .trim()
    .slice(0, 12)
}

function resolveTaggedLevel(tag: string): Level | null {
  const levels = tag
    .split(/\s+/)
    .map(tag => LEVEL_BY_TAG[tag])
    .filter((level): level is Level => Boolean(level))
    .sort((a, b) => LEVEL_RANK[a] - LEVEL_RANK[b])

  return levels[0] ?? null
}

function createGeneratedEntries(
  ecdict: Map<string, EcdictEntry>,
  officialCetWords: Set<string>,
): GeneratedEntry[] {
  const entries = new Map<string, GeneratedEntry>()

  for (const entry of ecdict.values()) {
    const taggedLevel = resolveTaggedLevel(entry.tag)
    const officialLevel: Level | null = officialCetWords.has(entry.word) ? "cet4" : null
    const level = [taggedLevel, officialLevel]
      .filter((candidate): candidate is Level => candidate !== null)
      .sort((a, b) => LEVEL_RANK[a] - LEVEL_RANK[b])[0]

    if (level) {
      entries.set(entry.word, {
        ...entry,
        level,
      })
    }
  }

  return [...entries.values()]
    .sort((a, b) => a.word.localeCompare(b.word))
}

function buildOutput(entries: GeneratedEntry[]): string {
  const generatedRows = entries.map(entry => [
    entry.word,
    entry.level,
    entry.translation,
    getShortTranslation(entry.translation),
    ...(entry.phonetic ? [`/${entry.phonetic}/`] : []),
  ])

  return `/* eslint-disable style/comma-dangle */
import type { WordLearningLevel } from "@/types/config/word-learning"

export type GeneratedWordLearningLexiconRow = [
  word: string,
  level: WordLearningLevel,
  translation: string,
  shortTranslation: string,
  phonetic?: string,
]

// Generated by scripts/generate-word-learning-lexicon.ts.
// Sources:
// - https://github.com/JavaProgrammerLB/cet-word-list (MIT)
// - https://github.com/skywind3000/ECDICT (MIT)
// Do not edit by hand; regenerate with pnpm generate:word-learning-lexicon.
export const GENERATED_WORD_LEARNING_LEXICON_ROWS: GeneratedWordLearningLexiconRow[] = ${JSON.stringify(generatedRows, null, 2)}
`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const [cetInput, ecdictInput] = await Promise.all([
    options.cetPath ? readFile(options.cetPath, "utf8") : "",
    readFile(options.ecdictPath, "utf8"),
  ])
  const cetWords = options.cetPath ? parseCetWords(cetInput) : new Set<string>()
  const ecdict = parseEcdict(ecdictInput)
  const entries = createGeneratedEntries(ecdict, cetWords)

  await mkdir(dirname(options.outPath), { recursive: true })
  await writeFile(options.outPath, buildOutput(entries))
  console.log(`Generated ${entries.length} word learning entries at ${options.outPath}`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
