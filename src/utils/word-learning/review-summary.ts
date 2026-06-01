import { storage } from "#imports"
import { WORD_LEARNING_KNOWN_WORDS_STORAGE_KEY, WORD_LEARNING_RECORDS_STORAGE_KEY } from "@/utils/constants/word-learning"

type SummaryRecordStatus = "learning" | "known" | "hidden"

interface SummaryReviewState {
  dueAt: number
  intervalDays?: number
  ease?: number
  stabilityDays?: number
  lastReviewedAt?: number
}

interface SummaryRecord {
  word: string
  status: SummaryRecordStatus
  savedAt?: number
  review?: SummaryReviewState
}

export interface WordLearningReviewSummary {
  savedCount: number
  dueCount: number
  learningCount: number
  knownCount: number
  hiddenCount: number
  nextDueAt: number | null
  dueWords: string[]
}

const MIN_REVIEW_STABILITY_DAYS = 0.1
const MAX_REVIEW_STABILITY_DAYS = 3650
const DEFAULT_REVIEW_STABILITY_DAYS = 0.5
const TARGET_REVIEW_RETENTION = 0.9
const DAY_MS = 24 * 60 * 60 * 1000

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeSummaryWord(value: unknown): string | null {
  if (typeof value !== "string")
    return null

  const word = value.trim().toLowerCase()
  return word || null
}

function normalizeSummaryStatus(value: unknown): SummaryRecordStatus {
  return value === "known" || value === "hidden" ? value : "learning"
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function normalizeSummaryReview(value: unknown, fallbackDueAt: number | undefined): SummaryReviewState | undefined {
  if (!isObject(value)) {
    return typeof fallbackDueAt === "number" ? { dueAt: fallbackDueAt } : undefined
  }

  const dueAt = normalizeFiniteNumber(value.dueAt) ?? fallbackDueAt
  if (typeof dueAt !== "number")
    return undefined

  return {
    dueAt,
    ...(normalizeFiniteNumber(value.intervalDays) !== undefined ? { intervalDays: normalizeFiniteNumber(value.intervalDays) } : {}),
    ...(normalizeFiniteNumber(value.ease) !== undefined ? { ease: normalizeFiniteNumber(value.ease) } : {}),
    ...(normalizeFiniteNumber(value.stabilityDays) !== undefined ? { stabilityDays: normalizeFiniteNumber(value.stabilityDays) } : {}),
    ...(normalizeFiniteNumber(value.lastReviewedAt) !== undefined ? { lastReviewedAt: normalizeFiniteNumber(value.lastReviewedAt) } : {}),
  }
}

function normalizeSummaryRecord(value: unknown): SummaryRecord | null {
  if (!isObject(value))
    return null

  const word = normalizeSummaryWord(value.word)
  if (!word)
    return null

  const savedAt = normalizeFiniteNumber(value.savedAt)
  const review = normalizeSummaryReview(value.review, savedAt)

  return {
    word,
    status: normalizeSummaryStatus(value.status),
    ...(typeof savedAt === "number" ? { savedAt } : {}),
    ...(review ? { review } : {}),
  }
}

function normalizeSummaryRecords(value: unknown): Map<string, SummaryRecord> {
  const records = new Map<string, SummaryRecord>()
  if (!isObject(value))
    return records

  for (const record of Object.values(value)) {
    const normalizedRecord = normalizeSummaryRecord(record)
    if (normalizedRecord)
      records.set(normalizedRecord.word, normalizedRecord)
  }

  return records
}

function normalizeKnownWords(value: unknown): string[] {
  if (!Array.isArray(value))
    return []

  return [...new Set(value.map(normalizeSummaryWord).filter((word): word is string => Boolean(word)))]
}

function getReviewDueAt(record: SummaryRecord): number | null {
  if (typeof record.savedAt !== "number")
    return null

  return record.review?.dueAt ?? record.savedAt
}

function isReviewDue(record: SummaryRecord, now: number): boolean {
  const dueAt = getReviewDueAt(record)
  return dueAt !== null
    && record.status === "learning"
    && dueAt <= now
}

function getReviewStabilityDays(review: SummaryReviewState): number {
  if (typeof review.stabilityDays === "number")
    return clamp(review.stabilityDays, MIN_REVIEW_STABILITY_DAYS, MAX_REVIEW_STABILITY_DAYS)

  if (typeof review.intervalDays === "number" && review.intervalDays > 0)
    return clamp(review.intervalDays, MIN_REVIEW_STABILITY_DAYS, MAX_REVIEW_STABILITY_DAYS)

  return DEFAULT_REVIEW_STABILITY_DAYS
}

function estimateReviewRetrievability(record: SummaryRecord, now: number): number | null {
  if (typeof record.savedAt !== "number")
    return null

  const review = record.review ?? { dueAt: record.savedAt }
  const anchorAt = review.lastReviewedAt ?? record.savedAt
  const elapsedDays = Math.max(0, (now - anchorAt) / DAY_MS)
  const stabilityDays = getReviewStabilityDays(review)

  return clamp(TARGET_REVIEW_RETENTION ** (elapsedDays / stabilityDays), 0, 1)
}

function sortDueRecords(a: SummaryRecord, b: SummaryRecord, now: number): number {
  return (estimateReviewRetrievability(a, now) ?? 1) - (estimateReviewRetrievability(b, now) ?? 1)
    || (getReviewDueAt(a) ?? 0) - (getReviewDueAt(b) ?? 0)
    || a.word.localeCompare(b.word)
}

export function summarizeWordLearningReviews(
  records: Iterable<SummaryRecord>,
  now = Date.now(),
): WordLearningReviewSummary {
  const summary: WordLearningReviewSummary = {
    savedCount: 0,
    dueCount: 0,
    learningCount: 0,
    knownCount: 0,
    hiddenCount: 0,
    nextDueAt: null,
    dueWords: [],
  }
  const dueRecords: SummaryRecord[] = []

  for (const record of records) {
    if (record.status === "learning")
      summary.learningCount += 1
    else if (record.status === "known")
      summary.knownCount += 1
    else if (record.status === "hidden")
      summary.hiddenCount += 1

    const dueAt = getReviewDueAt(record)
    if (dueAt === null)
      continue

    summary.savedCount += 1

    if (isReviewDue(record, now)) {
      dueRecords.push(record)
      continue
    }

    if (record.status === "learning" && dueAt > now) {
      summary.nextDueAt = summary.nextDueAt === null
        ? dueAt
        : Math.min(summary.nextDueAt, dueAt)
    }
  }

  dueRecords.sort((a, b) => sortDueRecords(a, b, now))
  summary.dueCount = dueRecords.length
  summary.dueWords = dueRecords.slice(0, 3).map(record => record.word)

  return summary
}

export async function getWordLearningReviewSummary(now = Date.now()): Promise<WordLearningReviewSummary> {
  const [storedRecords, legacyKnownWords] = await Promise.all([
    storage.getItem<Record<string, unknown>>(`local:${WORD_LEARNING_RECORDS_STORAGE_KEY}`),
    storage.getItem<unknown[]>(`local:${WORD_LEARNING_KNOWN_WORDS_STORAGE_KEY}`),
  ])
  const records = normalizeSummaryRecords(storedRecords)

  for (const word of normalizeKnownWords(legacyKnownWords)) {
    records.set(word, {
      word,
      status: "known",
    })
  }

  return summarizeWordLearningReviews(records.values(), now)
}
