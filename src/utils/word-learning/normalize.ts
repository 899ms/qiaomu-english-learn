const WORD_RE = /[a-z]+(?:['-][a-z]+)*/gi

const NORMALIZATION_OVERRIDES = new Map<string, string>([
  ["criteria", "criteria"],
  ["criterion", "criteria"],
  ["phenomena", "phenomenon"],
  ["hypotheses", "hypothesis"],
])

export interface WordToken {
  raw: string
  normalized: string
  start: number
  end: number
}

export function normalizeLearningWord(rawWord: string): string {
  const word = rawWord
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, "")
    .replace(/[’']/g, "'")

  if (word.length <= 3) {
    return word
  }

  const override = NORMALIZATION_OVERRIDES.get(word)
  if (override) {
    return override
  }

  if (word.includes("-")) {
    return word
  }

  const simpleSuffixRules: Array<[RegExp, string]> = [
    [/ies$/, "y"],
    [/ied$/, "y"],
    [/ves$/, "f"],
    [/ing$/, ""],
    [/ed$/, ""],
  ]

  for (const [suffix, replacement] of simpleSuffixRules) {
    if (suffix.test(word)) {
      const candidate = word.replace(suffix, replacement)
      if (candidate.length >= 4) {
        return candidate
      }
    }
  }

  if (!/(?:ss|is|us)$/.test(word)) {
    if (word.endsWith("es") && word.length > 5) {
      return word.slice(0, -2)
    }

    if (word.endsWith("s") && word.length > 4) {
      return word.slice(0, -1)
    }
  }

  return word
}

export function tokenizeLearningWords(text: string): WordToken[] {
  const tokens: WordToken[] = []

  for (const match of text.matchAll(WORD_RE)) {
    const raw = match[0]
    const start = match.index
    if (start === undefined)
      continue

    const normalized = normalizeLearningWord(raw)
    if (!normalized || normalized.length < 4)
      continue

    tokens.push({
      raw,
      normalized,
      start,
      end: start + raw.length,
    })
  }

  return tokens
}
