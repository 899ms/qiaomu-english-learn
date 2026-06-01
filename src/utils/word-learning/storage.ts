import type { WordLearningLevel } from "@/types/config/word-learning"
import { storage } from "#imports"
import { WORD_LEARNING_LEVELS } from "@/types/config/word-learning"
import { WORD_LEARNING_KNOWN_WORDS_STORAGE_KEY, WORD_LEARNING_RECORDS_STORAGE_KEY } from "@/utils/constants/word-learning"
import {
  normalizeEscapedNewlines,
  normalizeEscapedNewlinesForInlineText,
  normalizeEscapedNewlinesForSingleLineText,
} from "@/utils/text"
import { classifyLearningWord, lookupLearningWord } from "./classifier"
import { normalizeLearningWord, tokenizeLearningWords } from "./normalize"

export type { WordLearningReviewSummary } from "./review-summary"
export { getWordLearningReviewSummary, summarizeWordLearningReviews } from "./review-summary"

export const WORD_LEARNING_SOURCES = [
  "page",
  "selection",
  "subtitles",
  "tts",
  "manual",
] as const

export type WordLearningSource = typeof WORD_LEARNING_SOURCES[number]
export type WordLearningStatus = "learning" | "known" | "hidden"
export type WordLearningReviewRating = "again" | "hard" | "good" | "easy"

export interface WordLearningContext {
  text: string
  source: WordLearningSource
  capturedAt: number
}

export interface WordLearningReviewState {
  dueAt: number
  intervalDays: number
  ease: number
  stabilityDays?: number
  difficulty?: number
  consecutiveCorrect: number
  lapseCount: number
  reviewCount: number
  lastReviewedAt?: number
}

export interface WordLearningRecord {
  word: string
  status: WordLearningStatus
  seenCount: number
  firstSeenAt: number
  lastSeenAt: number
  level?: WordLearningLevel
  translation?: string
  shortTranslation?: string
  phonetic?: string
  knownAt?: number
  hiddenAt?: number
  savedAt?: number
  review?: WordLearningReviewState
  contexts?: WordLearningContext[]
  sources: Partial<Record<WordLearningSource, number>>
}

export interface RecordLearningTextEncounterOptions {
  minimumLevel: WordLearningLevel
  hideKnownWords?: boolean
}

export interface SaveLearningTextWordsOptions {
  minimumLevel: WordLearningLevel
  translationText?: string | null
}

interface WordLearningRecordMetadata {
  level?: WordLearningLevel
  translation?: string
  shortTranslation?: string
  phonetic?: string
}

const MIN_REVIEW_EASE = 1.3
const MAX_REVIEW_EASE = 3.2
const DEFAULT_REVIEW_EASE = 2.5
const MIN_REVIEW_STABILITY_DAYS = 0.1
const MAX_REVIEW_STABILITY_DAYS = 3650
const DEFAULT_REVIEW_STABILITY_DAYS = 0.5
const TARGET_REVIEW_RETENTION = 0.9
const MAX_CONTEXTS_PER_RECORD = 5
const MAX_CONTEXT_TEXT_LENGTH = 280
const MAX_TRANSLATION_TEXT_LENGTH = 120
const MAX_SHORT_TRANSLATION_TEXT_LENGTH = 24
const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function addDays(timestamp: number, days: number): number {
  return timestamp + days * DAY_MS
}

function getReviewStabilityDays(review: WordLearningReviewState): number {
  if (typeof review.stabilityDays === "number" && Number.isFinite(review.stabilityDays)) {
    return clamp(review.stabilityDays, MIN_REVIEW_STABILITY_DAYS, MAX_REVIEW_STABILITY_DAYS)
  }

  if (review.intervalDays > 0) {
    return clamp(review.intervalDays, MIN_REVIEW_STABILITY_DAYS, MAX_REVIEW_STABILITY_DAYS)
  }

  return DEFAULT_REVIEW_STABILITY_DAYS
}

function getReviewDifficulty(review: WordLearningReviewState): number {
  if (typeof review.difficulty === "number" && Number.isFinite(review.difficulty)) {
    return clamp(review.difficulty, 0, 1)
  }

  return clamp((MAX_REVIEW_EASE - review.ease) / (MAX_REVIEW_EASE - MIN_REVIEW_EASE), 0, 1)
}

function estimateReviewRetrievability(
  review: WordLearningReviewState,
  anchorAt: number,
  now = Date.now(),
): number {
  const elapsedDays = Math.max(0, (now - anchorAt) / DAY_MS)
  const stabilityDays = getReviewStabilityDays(review)

  return clamp(TARGET_REVIEW_RETENTION ** (elapsedDays / stabilityDays), 0, 1)
}

function createInitialReviewState(now = Date.now()): WordLearningReviewState {
  return {
    dueAt: now,
    intervalDays: 0,
    ease: DEFAULT_REVIEW_EASE,
    stabilityDays: DEFAULT_REVIEW_STABILITY_DAYS,
    difficulty: 0.35,
    consecutiveCorrect: 0,
    lapseCount: 0,
    reviewCount: 0,
  }
}

function compactContextText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function normalizeTranslationText(text: string | null | undefined, maxLength = MAX_TRANSLATION_TEXT_LENGTH): string | undefined {
  const normalized = normalizeEscapedNewlines(text ?? "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (!normalized)
    return undefined

  if (normalized.length <= maxLength)
    return normalized

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

function getShortTranslationText(text: string | null | undefined): string | undefined {
  const compacted = normalizeEscapedNewlinesForInlineText(text ?? "")
  if (!compacted)
    return undefined

  const firstSegment = compacted.split(/[;；,，。.!?！？]/)[0]?.trim()
  const shortText = firstSegment || compacted

  return shortText.length <= MAX_SHORT_TRANSLATION_TEXT_LENGTH
    ? shortText
    : `${shortText.slice(0, MAX_SHORT_TRANSLATION_TEXT_LENGTH - 3).trimEnd()}...`
}

function normalizeWordLearningLevel(value: unknown): WordLearningLevel | undefined {
  return WORD_LEARNING_LEVELS.includes(value as WordLearningLevel)
    ? value as WordLearningLevel
    : undefined
}

function getLexiconMetadata(rawWord: string): WordLearningRecordMetadata | null {
  const entry = lookupLearningWord(rawWord)
  if (!entry)
    return null

  return {
    level: entry.level,
    translation: entry.translation,
    shortTranslation: entry.shortTranslation,
    ...(entry.phonetic ? { phonetic: entry.phonetic } : {}),
  }
}

function getExplicitTranslationMetadata(translationText: string | null | undefined): WordLearningRecordMetadata | null {
  const translation = normalizeTranslationText(translationText)
  if (!translation)
    return null

  return {
    translation,
    shortTranslation: getShortTranslationText(translation) ?? translation,
  }
}

function getSingleWordTranslationMetadata(
  text: string | null | undefined,
  word: string,
  translationText: string | null | undefined,
): WordLearningRecordMetadata | null {
  const tokens = tokenizeLearningWords(text ?? "")
  if (tokens.length !== 1 || tokens[0]?.normalized !== word)
    return null

  return getExplicitTranslationMetadata(translationText)
}

function applyRecordMetadata(
  record: WordLearningRecord,
  metadata: WordLearningRecordMetadata | null | undefined,
): WordLearningRecord {
  if (!metadata)
    return record

  return {
    ...record,
    ...(metadata.level ? { level: metadata.level } : {}),
    ...(metadata.translation ? { translation: metadata.translation } : {}),
    ...(metadata.shortTranslation ? { shortTranslation: metadata.shortTranslation } : {}),
    ...(metadata.phonetic ? { phonetic: metadata.phonetic } : {}),
  }
}

function findContextEnd(text: string, fromIndex: number): number {
  const boundaryIndexes = [".", "?", "!", "\n", "。", "？", "！"]
    .map(boundary => text.indexOf(boundary, fromIndex))
    .filter(index => index >= 0)

  if (boundaryIndexes.length === 0)
    return text.length

  const boundaryIndex = Math.min(...boundaryIndexes)
  return text[boundaryIndex] === "\n" ? boundaryIndex : boundaryIndex + 1
}

function findContextStart(text: string, fromIndex: number): number {
  const boundaryIndexes = [".", "?", "!", "\n", "。", "？", "！"]
    .map(boundary => text.lastIndexOf(boundary, Math.max(0, fromIndex - 1)))

  return Math.max(...boundaryIndexes) + 1
}

function truncateContextAroundWord(text: string, wordStart: number, wordEnd: number): string {
  const compacted = compactContextText(text)
  if (compacted.length <= MAX_CONTEXT_TEXT_LENGTH)
    return compacted

  const halfWindow = Math.floor((MAX_CONTEXT_TEXT_LENGTH - (wordEnd - wordStart)) / 2)
  const start = Math.max(0, wordStart - halfWindow)
  const end = Math.min(text.length, wordEnd + halfWindow)
  const prefix = start > 0 ? "..." : ""
  const suffix = end < text.length ? "..." : ""

  return compactContextText(`${prefix}${text.slice(start, end)}${suffix}`)
}

function createContextTextForToken(text: string, token: ReturnType<typeof tokenizeLearningWords>[number]): string | null {
  const contextStart = findContextStart(text, token.start)
  const contextEnd = findContextEnd(text, token.end)
  const sentence = text.slice(contextStart, contextEnd)
  const context = truncateContextAroundWord(sentence, token.start - contextStart, token.end - contextStart)

  return context.length > token.raw.length ? context : null
}

function getLearningContextByWord(text: string, minimumLevel: WordLearningLevel): Map<string, string> {
  const contexts = new Map<string, string>()

  for (const token of tokenizeLearningWords(text)) {
    const entry = classifyLearningWord(token.normalized, minimumLevel)
    if (!entry || contexts.has(entry.word))
      continue

    const context = createContextTextForToken(text, token)
    if (context) {
      contexts.set(entry.word, context)
    }
  }

  return contexts
}

function normalizeContext(value: unknown): WordLearningContext | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null

  const context = value as Partial<WordLearningContext>
  const text = typeof context.text === "string" ? compactContextText(context.text) : ""
  if (!text || !WORD_LEARNING_SOURCES.includes(context.source as WordLearningSource))
    return null

  return {
    text: text.length > MAX_CONTEXT_TEXT_LENGTH
      ? `${text.slice(0, MAX_CONTEXT_TEXT_LENGTH - 3).trimEnd()}...`
      : text,
    source: context.source as WordLearningSource,
    capturedAt: typeof context.capturedAt === "number" && Number.isFinite(context.capturedAt)
      ? context.capturedAt
      : Date.now(),
  }
}

function normalizeContexts(value: unknown): WordLearningContext[] {
  if (!Array.isArray(value))
    return []

  const seen = new Set<string>()
  return value
    .map(normalizeContext)
    .filter((context): context is WordLearningContext => context !== null)
    .filter((context) => {
      const key = `${context.source}:${context.text}`
      if (seen.has(key))
        return false

      seen.add(key)
      return true
    })
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, MAX_CONTEXTS_PER_RECORD)
}

function addContextToRecord(
  record: WordLearningRecord,
  source: WordLearningSource,
  contextText: string | null | undefined,
  now: number,
): WordLearningContext[] | undefined {
  const context = normalizeContext({
    text: contextText,
    source,
    capturedAt: now,
  })
  if (!context)
    return record.contexts

  return [
    context,
    ...(record.contexts ?? []).filter(existing =>
      existing.source !== context.source || existing.text !== context.text,
    ),
  ].slice(0, MAX_CONTEXTS_PER_RECORD)
}

function normalizeReviewState(value: unknown, fallbackDueAt: number): WordLearningReviewState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null

  const review = value as Partial<WordLearningReviewState>
  const intervalDays = typeof review.intervalDays === "number" && Number.isFinite(review.intervalDays)
    ? Math.max(0, review.intervalDays)
    : 0
  const ease = typeof review.ease === "number" && Number.isFinite(review.ease)
    ? clamp(review.ease, MIN_REVIEW_EASE, MAX_REVIEW_EASE)
    : DEFAULT_REVIEW_EASE

  return {
    dueAt: typeof review.dueAt === "number" && Number.isFinite(review.dueAt)
      ? review.dueAt
      : fallbackDueAt,
    intervalDays,
    ease,
    stabilityDays: typeof review.stabilityDays === "number" && Number.isFinite(review.stabilityDays)
      ? clamp(review.stabilityDays, MIN_REVIEW_STABILITY_DAYS, MAX_REVIEW_STABILITY_DAYS)
      : intervalDays > 0
        ? clamp(intervalDays, MIN_REVIEW_STABILITY_DAYS, MAX_REVIEW_STABILITY_DAYS)
        : DEFAULT_REVIEW_STABILITY_DAYS,
    difficulty: typeof review.difficulty === "number" && Number.isFinite(review.difficulty)
      ? clamp(review.difficulty, 0, 1)
      : clamp((MAX_REVIEW_EASE - ease) / (MAX_REVIEW_EASE - MIN_REVIEW_EASE), 0, 1),
    consecutiveCorrect: typeof review.consecutiveCorrect === "number" && Number.isFinite(review.consecutiveCorrect)
      ? Math.max(0, Math.floor(review.consecutiveCorrect))
      : 0,
    lapseCount: typeof review.lapseCount === "number" && Number.isFinite(review.lapseCount)
      ? Math.max(0, Math.floor(review.lapseCount))
      : 0,
    reviewCount: typeof review.reviewCount === "number" && Number.isFinite(review.reviewCount)
      ? Math.max(0, Math.floor(review.reviewCount))
      : 0,
    ...(typeof review.lastReviewedAt === "number" && Number.isFinite(review.lastReviewedAt)
      ? { lastReviewedAt: review.lastReviewedAt }
      : {}),
  }
}

function scheduleNextReview(
  current: WordLearningReviewState | undefined,
  rating: WordLearningReviewRating,
  now = Date.now(),
): WordLearningReviewState {
  const review = current ?? createInitialReviewState(now)
  const nextReviewCount = review.reviewCount + 1
  const previousStabilityDays = getReviewStabilityDays(review)
  const previousDifficulty = getReviewDifficulty(review)
  const anchorAt = review.lastReviewedAt ?? now
  const retrievability = estimateReviewRetrievability(review, anchorAt, now)
  const difficulty = clamp(
    previousDifficulty + (rating === "again" ? 0.12 : rating === "hard" ? 0.06 : rating === "easy" ? -0.07 : -0.02),
    0,
    1,
  )

  if (rating === "again") {
    const stabilityDays = clamp(
      previousStabilityDays * 0.45 * (1 + difficulty * 0.2),
      MIN_REVIEW_STABILITY_DAYS,
      MAX_REVIEW_STABILITY_DAYS,
    )

    return {
      dueAt: now + 10 * MINUTE_MS,
      intervalDays: 0,
      ease: clamp(review.ease - 0.2, MIN_REVIEW_EASE, MAX_REVIEW_EASE),
      stabilityDays,
      difficulty,
      consecutiveCorrect: 0,
      lapseCount: review.lapseCount + 1,
      reviewCount: nextReviewCount,
      lastReviewedAt: now,
    }
  }

  const easeAdjustment = rating === "hard" ? -0.15 : rating === "easy" ? 0.15 : 0
  const ease = clamp(review.ease + easeAdjustment, MIN_REVIEW_EASE, MAX_REVIEW_EASE)
  const previousInterval = Math.max(0, review.intervalDays)
  const stabilityDays = (() => {
    if (previousInterval <= 0) {
      if (rating === "easy")
        return 4
      return 1
    }

    const recallBoost = 1 + (1 - retrievability) * 0.6
    const difficultyPenalty = 1 - difficulty * 0.25
    const multiplier = rating === "hard"
      ? 1.2
      : rating === "easy"
        ? ease + 0.55
        : ease

    return clamp(
      previousStabilityDays * multiplier * recallBoost * difficultyPenalty,
      MIN_REVIEW_STABILITY_DAYS,
      MAX_REVIEW_STABILITY_DAYS,
    )
  })()
  const intervalDays = rating === "hard"
    ? Math.max(1, Math.ceil(stabilityDays * 0.75))
    : Math.max(1, Math.ceil(stabilityDays))

  return {
    dueAt: addDays(now, intervalDays),
    intervalDays,
    ease,
    stabilityDays,
    difficulty,
    consecutiveCorrect: review.consecutiveCorrect + 1,
    lapseCount: review.lapseCount,
    reviewCount: nextReviewCount,
    lastReviewedAt: now,
  }
}

function applyEncounter(
  records: Record<string, WordLearningRecord>,
  rawWord: string,
  source: WordLearningSource,
  now = Date.now(),
  contextText?: string,
): WordLearningRecord | null {
  const word = normalizeLearningWord(rawWord)
  if (!word)
    return null

  const current = records[word]
  const next: WordLearningRecord = applyRecordMetadata({
    ...(current ?? {
      word,
      status: "learning",
      seenCount: 0,
      firstSeenAt: now,
      sources: {},
    }),
    word,
    seenCount: (current?.seenCount ?? 0) + 1,
    lastSeenAt: now,
    sources: {
      ...(current?.sources ?? {}),
      [source]: (current?.sources[source] ?? 0) + 1,
    },
  }, getLexiconMetadata(word))
  const contexts = addContextToRecord(next, source, contextText, now)
  if (contexts && contexts.length > 0) {
    next.contexts = contexts
  }

  records[word] = next
  return next
}

function createEmptyRecord(word: string, now = Date.now()): WordLearningRecord {
  return {
    word,
    status: "learning",
    seenCount: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    sources: {},
  }
}

function applyStatus(
  records: Record<string, WordLearningRecord>,
  rawWord: string,
  status: WordLearningStatus,
  now = Date.now(),
): WordLearningRecord | null {
  const word = normalizeLearningWord(rawWord)
  if (!word)
    return null

  const current = records[word] ?? createEmptyRecord(word, now)
  const next: WordLearningRecord = {
    word,
    status,
    seenCount: current.seenCount,
    firstSeenAt: current.firstSeenAt,
    lastSeenAt: now,
    ...(current.level ? { level: current.level } : {}),
    ...(current.translation ? { translation: current.translation } : {}),
    ...(current.shortTranslation ? { shortTranslation: current.shortTranslation } : {}),
    ...(current.phonetic ? { phonetic: current.phonetic } : {}),
    ...(typeof current.savedAt === "number" ? { savedAt: current.savedAt } : {}),
    ...(current.review ? { review: current.review } : {}),
    ...(current.contexts && current.contexts.length > 0 ? { contexts: current.contexts } : {}),
    sources: { ...current.sources },
  }

  if (status === "known") {
    next.knownAt = current.knownAt ?? now
  }

  if (status === "hidden") {
    next.hiddenAt = current.hiddenAt ?? now
  }

  records[word] = next
  return next
}

function applySavedState(
  records: Record<string, WordLearningRecord>,
  rawWord: string,
  saved: boolean,
  now = Date.now(),
  metadata?: WordLearningRecordMetadata | null,
): WordLearningRecord | null {
  const word = normalizeLearningWord(rawWord)
  if (!word)
    return null

  const current = records[word] ?? createEmptyRecord(word, now)
  const next: WordLearningRecord = applyRecordMetadata({
    ...current,
    word,
    status: saved && current.status === "hidden" ? "learning" : current.status,
    lastSeenAt: now,
  }, saved ? metadata ?? getLexiconMetadata(word) : null)

  if (next.status !== "hidden") {
    delete next.hiddenAt
  }

  if (saved) {
    next.savedAt = current.savedAt ?? now
    next.review = current.review ?? createInitialReviewState(now)
  }
  else {
    delete next.savedAt
    delete next.review
  }

  records[word] = next
  return next
}

function applyReviewRating(
  records: Record<string, WordLearningRecord>,
  rawWord: string,
  rating: WordLearningReviewRating,
  now = Date.now(),
): WordLearningRecord | null {
  const word = normalizeLearningWord(rawWord)
  if (!word)
    return null

  const current = records[word] ?? createEmptyRecord(word, now)
  const next: WordLearningRecord = applyRecordMetadata({
    ...current,
    word,
    status: current.status === "hidden" ? "learning" : current.status,
    lastSeenAt: now,
    savedAt: current.savedAt ?? now,
    review: scheduleNextReview(current.review, rating, now),
  }, getLexiconMetadata(word))

  if (next.status !== "hidden") {
    delete next.hiddenAt
  }

  records[word] = next
  return next
}

async function syncLegacyKnownWords(records: Record<string, WordLearningRecord>): Promise<void> {
  await storage.setItem(
    `local:${WORD_LEARNING_KNOWN_WORDS_STORAGE_KEY}`,
    Object.values(records)
      .filter(record => record.status === "known")
      .map(record => record.word)
      .sort(),
  )
}

function normalizeKnownWords(words: unknown): string[] {
  if (!Array.isArray(words))
    return []

  return [...new Set(
    words
      .filter((word): word is string => typeof word === "string")
      .map(normalizeLearningWord)
      .filter(Boolean),
  )].sort()
}

function normalizeRecord(value: unknown): WordLearningRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null

  const record = value as Partial<WordLearningRecord>
  if (typeof record.word !== "string")
    return null

  const word = normalizeLearningWord(record.word)
  if (!word)
    return null

  const now = Date.now()
  const status: WordLearningStatus = record.status === "known" || record.status === "hidden"
    ? record.status
    : "learning"
  const sources = typeof record.sources === "object" && record.sources !== null && !Array.isArray(record.sources)
    ? Object.fromEntries(
      Object.entries(record.sources)
        .filter(([source, count]) =>
          WORD_LEARNING_SOURCES.includes(source as WordLearningSource)
          && typeof count === "number"
          && Number.isFinite(count)
          && count > 0,
        ),
    ) as Partial<Record<WordLearningSource, number>>
    : {}

  const savedAt = typeof record.savedAt === "number" && Number.isFinite(record.savedAt)
    ? record.savedAt
    : undefined
  const review = typeof savedAt === "number"
    ? normalizeReviewState(record.review, savedAt) ?? createInitialReviewState(savedAt)
    : undefined
  const contexts = normalizeContexts(record.contexts)
  const level = normalizeWordLearningLevel(record.level)
  const translation = normalizeTranslationText(record.translation)
  const shortTranslation = getShortTranslationText(record.shortTranslation)
  const phonetic = normalizeEscapedNewlinesForSingleLineText(record.phonetic ?? "").slice(0, 64) || undefined

  return {
    word,
    status,
    seenCount: typeof record.seenCount === "number" && Number.isFinite(record.seenCount)
      ? Math.max(0, Math.floor(record.seenCount))
      : 0,
    firstSeenAt: typeof record.firstSeenAt === "number" && Number.isFinite(record.firstSeenAt)
      ? record.firstSeenAt
      : now,
    lastSeenAt: typeof record.lastSeenAt === "number" && Number.isFinite(record.lastSeenAt)
      ? record.lastSeenAt
      : now,
    ...(level ? { level } : {}),
    ...(translation ? { translation } : {}),
    ...(shortTranslation ? { shortTranslation } : {}),
    ...(phonetic ? { phonetic } : {}),
    ...(typeof record.knownAt === "number" && Number.isFinite(record.knownAt) ? { knownAt: record.knownAt } : {}),
    ...(typeof record.hiddenAt === "number" && Number.isFinite(record.hiddenAt) ? { hiddenAt: record.hiddenAt } : {}),
    ...(typeof savedAt === "number" ? { savedAt } : {}),
    ...(review ? { review } : {}),
    ...(contexts.length > 0 ? { contexts } : {}),
    sources,
  }
}

function normalizeRecords(records: unknown): Record<string, WordLearningRecord> {
  if (typeof records !== "object" || records === null || Array.isArray(records))
    return {}

  return Object.fromEntries(
    Object.values(records)
      .map(normalizeRecord)
      .filter((record): record is WordLearningRecord => record !== null)
      .map(record => [record.word, record]),
  )
}

async function getLegacyKnownWords(): Promise<Set<string>> {
  const knownWords = await storage.getItem<string[]>(`local:${WORD_LEARNING_KNOWN_WORDS_STORAGE_KEY}`)
  return new Set(normalizeKnownWords(knownWords))
}

export async function getWordLearningRecords(): Promise<Record<string, WordLearningRecord>> {
  const [storedRecords, legacyKnownWords] = await Promise.all([
    storage.getItem<Record<string, WordLearningRecord>>(`local:${WORD_LEARNING_RECORDS_STORAGE_KEY}`),
    getLegacyKnownWords(),
  ])
  const records = normalizeRecords(storedRecords)
  const now = Date.now()

  for (const word of legacyKnownWords) {
    records[word] ??= {
      word,
      status: "known",
      seenCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      knownAt: now,
      sources: {},
    }
  }

  return records
}

export async function setWordLearningRecords(records: Record<string, WordLearningRecord>): Promise<void> {
  await storage.setItem(
    `local:${WORD_LEARNING_RECORDS_STORAGE_KEY}`,
    normalizeRecords(records),
  )
}

export async function getKnownLearningWords(): Promise<Set<string>> {
  const records = await getWordLearningRecords()
  return new Set(
    Object.values(records)
      .filter(record => record.status === "known")
      .map(record => record.word),
  )
}

export async function getSuppressedLearningWords(): Promise<Set<string>> {
  const records = await getWordLearningRecords()
  return new Set(
    Object.values(records)
      .filter(record => record.status === "known" || record.status === "hidden")
      .map(record => record.word),
  )
}

export function isLearningWordDue(record: WordLearningRecord, now = Date.now()): boolean {
  return typeof record.savedAt === "number"
    && record.status === "learning"
    && (record.review?.dueAt ?? record.savedAt) <= now
}

function getRecordReviewDueAt(record: WordLearningRecord): number | null {
  if (typeof record.savedAt !== "number")
    return null

  return record.review?.dueAt ?? record.savedAt
}

function sortDueLearningRecords(a: WordLearningRecord, b: WordLearningRecord, now: number): number {
  return (estimateLearningWordRetrievability(a, now) ?? 1) - (estimateLearningWordRetrievability(b, now) ?? 1)
    || (getRecordReviewDueAt(a) ?? 0) - (getRecordReviewDueAt(b) ?? 0)
    || a.word.localeCompare(b.word)
}

export function estimateLearningWordRetrievability(record: WordLearningRecord, now = Date.now()): number | null {
  if (typeof record.savedAt !== "number")
    return null

  const review = record.review ?? createInitialReviewState(record.savedAt)
  const anchorAt = review.lastReviewedAt ?? record.savedAt

  return estimateReviewRetrievability(review, anchorAt, now)
}

export async function getSavedLearningRecords(): Promise<WordLearningRecord[]> {
  const records = await getWordLearningRecords()
  return Object.values(records)
    .filter(record => typeof record.savedAt === "number")
    .sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0) || a.word.localeCompare(b.word))
}

export async function getDueLearningRecords(now = Date.now()): Promise<WordLearningRecord[]> {
  const records = await getWordLearningRecords()
  return Object.values(records)
    .filter(record => isLearningWordDue(record, now))
    .sort((a, b) => sortDueLearningRecords(a, b, now))
}

export function getSaveableLearningWordsFromText(
  text: string | null | undefined,
  options: SaveLearningTextWordsOptions,
): string[] {
  const tokens = tokenizeLearningWords(text ?? "")
  const words = new Set<string>()

  for (const token of tokens) {
    const entry = classifyLearningWord(token.normalized, options.minimumLevel)
    if (entry) {
      words.add(entry.word)
    }
  }

  if (words.size === 0 && tokens.length === 1) {
    words.add(tokens[0]!.normalized)
  }

  return [...words]
}

export async function setKnownLearningWords(knownWords: Iterable<string>): Promise<void> {
  const now = Date.now()
  const records = await getWordLearningRecords()
  const normalizedKnownWords = normalizeKnownWords([...knownWords])
  const normalizedKnownWordSet = new Set(normalizedKnownWords)

  for (const record of Object.values(records)) {
    if (record.status === "known" && !normalizedKnownWordSet.has(record.word)) {
      applyStatus(records, record.word, "learning", now)
    }
  }

  for (const word of normalizedKnownWords) {
    applyStatus(records, word, "known", now)
  }

  await setWordLearningRecords(records)
  await syncLegacyKnownWords(records)
}

export async function addKnownLearningWord(rawWord: string): Promise<Set<string>> {
  await markLearningWordKnown(rawWord)
  return getKnownLearningWords()
}

export async function markLearningWordKnown(rawWord: string): Promise<WordLearningRecord> {
  const records = await getWordLearningRecords()
  const next = applyStatus(records, rawWord, "known")
  if (!next)
    throw new Error("Cannot mark an empty learning word as known.")

  await setWordLearningRecords(records)
  await syncLegacyKnownWords(records)

  return next
}

export async function markLearningWordHidden(rawWord: string): Promise<WordLearningRecord> {
  const records = await getWordLearningRecords()
  const next = applyStatus(records, rawWord, "hidden")
  if (!next)
    throw new Error("Cannot hide an empty learning word.")

  await setWordLearningRecords(records)
  await syncLegacyKnownWords(records)

  return next
}

export async function markLearningWordLearning(rawWord: string): Promise<WordLearningRecord> {
  const records = await getWordLearningRecords()
  const next = applyStatus(records, rawWord, "learning")
  if (!next)
    throw new Error("Cannot review an empty learning word.")

  await setWordLearningRecords(records)
  await syncLegacyKnownWords(records)

  return next
}

export async function saveLearningWord(rawWord: string): Promise<WordLearningRecord> {
  const records = await getWordLearningRecords()
  const next = applySavedState(records, rawWord, true)
  if (!next)
    throw new Error("Cannot save an empty learning word.")

  await setWordLearningRecords(records)
  await syncLegacyKnownWords(records)

  return next
}

export async function unsaveLearningWord(rawWord: string): Promise<WordLearningRecord> {
  const records = await getWordLearningRecords()
  const next = applySavedState(records, rawWord, false)
  if (!next)
    throw new Error("Cannot unsave an empty learning word.")

  await setWordLearningRecords(records)
  await syncLegacyKnownWords(records)

  return next
}

export async function reviewLearningWord(
  rawWord: string,
  rating: WordLearningReviewRating,
): Promise<WordLearningRecord> {
  const records = await getWordLearningRecords()
  const next = applyReviewRating(records, rawWord, rating)
  if (!next)
    throw new Error("Cannot review an empty learning word.")

  await setWordLearningRecords(records)
  await syncLegacyKnownWords(records)

  return next
}

export async function saveLearningTextWords(
  text: string | null | undefined,
  source: WordLearningSource,
  options: SaveLearningTextWordsOptions,
): Promise<WordLearningRecord[]> {
  const words = getSaveableLearningWordsFromText(text, options)
  if (words.length === 0)
    return []

  const records = await getWordLearningRecords()
  const now = Date.now()
  const nextRecords: WordLearningRecord[] = []
  const contexts = getLearningContextByWord(text ?? "", options.minimumLevel)

  for (const word of words) {
    const context = contexts.get(word)
    const metadata = getLexiconMetadata(word)
      ?? getSingleWordTranslationMetadata(text, word, options.translationText)
    applyEncounter(records, word, source, now, context)
    const next = applySavedState(records, word, true, now, metadata)
    if (next) {
      nextRecords.push(next)
    }
  }

  await setWordLearningRecords(records)
  await syncLegacyKnownWords(records)

  return nextRecords
}

export async function enrichSavedLearningTextWords(
  text: string | null | undefined,
  options: SaveLearningTextWordsOptions,
): Promise<WordLearningRecord[]> {
  if (!options.translationText)
    return []

  const words = getSaveableLearningWordsFromText(text, options)
  if (words.length === 0)
    return []

  const records = await getWordLearningRecords()
  const nextRecords: WordLearningRecord[] = []

  for (const word of words) {
    const current = records[word]
    if (!current || typeof current.savedAt !== "number")
      continue

    const metadata = getLexiconMetadata(word)
      ?? getSingleWordTranslationMetadata(text, word, options.translationText)
    if (!metadata)
      continue

    const next = applyRecordMetadata(current, metadata)
    records[word] = next
    nextRecords.push(next)
  }

  if (nextRecords.length > 0) {
    await setWordLearningRecords(records)
  }

  return nextRecords
}

export async function recordLearningWordEncounter(rawWord: string, source: WordLearningSource): Promise<WordLearningRecord> {
  const records = await getWordLearningRecords()
  const next = applyEncounter(records, rawWord, source)
  if (!next)
    throw new Error("Cannot record an empty learning word.")

  await setWordLearningRecords(records)
  return next
}

export async function recordLearningTextEncounter(
  text: string,
  source: WordLearningSource,
  options: RecordLearningTextEncounterOptions,
): Promise<WordLearningRecord[]> {
  const words = new Set(
    tokenizeLearningWords(text)
      .map((token) => {
        const entry = classifyLearningWord(token.normalized, options.minimumLevel)
        return entry?.word
      })
      .filter((word): word is string => Boolean(word)),
  )

  if (words.size === 0)
    return []

  const records = await getWordLearningRecords()
  const now = Date.now()
  const nextRecords: WordLearningRecord[] = []
  const contexts = getLearningContextByWord(text, options.minimumLevel)

  for (const word of words) {
    const current = records[word]
    if (options.hideKnownWords && (current?.status === "known" || current?.status === "hidden")) {
      continue
    }

    const next = applyEncounter(records, word, source, now, contexts.get(word))
    if (next) {
      nextRecords.push(next)
    }
  }

  if (nextRecords.length > 0) {
    await setWordLearningRecords(records)
  }

  return nextRecords
}
