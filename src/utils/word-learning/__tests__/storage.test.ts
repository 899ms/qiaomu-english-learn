import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import { WORD_LEARNING_KNOWN_WORDS_STORAGE_KEY, WORD_LEARNING_RECORDS_STORAGE_KEY } from "@/utils/constants/word-learning"
import {
  enrichSavedLearningTextWords,
  estimateLearningWordRetrievability,
  getDueLearningRecords,
  getKnownLearningWords,
  getSaveableLearningWordsFromText,
  getSuppressedLearningWords,
  getWordLearningRecords,
  getWordLearningReviewSummary,
  markLearningWordHidden,
  markLearningWordKnown,
  markLearningWordLearning,
  recordLearningTextEncounter,
  recordLearningWordEncounter,
  reviewLearningWord,
  saveLearningTextWords,
  saveLearningWord,
  setWordLearningRecords,
  unsaveLearningWord,
} from "../storage"

const { storageValues } = vi.hoisted(() => ({
  storageValues: new Map<string, unknown>(),
}))

vi.mock("#imports", () => ({
  storage: {
    getItem: vi.fn(async (key: string) => storageValues.get(key)),
    setItem: vi.fn(async (key: string, value: unknown) => {
      storageValues.set(key, value)
    }),
  },
}))

describe.sequential("word learning storage", () => {
  beforeEach(async () => {
    vi.useRealTimers()
    storageValues.clear()
    await storage.setItem(`local:${WORD_LEARNING_RECORDS_STORAGE_KEY}`, {})
    await storage.setItem(`local:${WORD_LEARNING_KNOWN_WORDS_STORAGE_KEY}`, [])
  })

  afterEach(async () => {
    vi.useRealTimers()
    storageValues.clear()
    await storage.setItem(`local:${WORD_LEARNING_RECORDS_STORAGE_KEY}`, {})
    await storage.setItem(`local:${WORD_LEARNING_KNOWN_WORDS_STORAGE_KEY}`, [])
  })

  it("records encounters with source counters", async () => {
    await recordLearningWordEncounter("Hypothesis", "page")
    await recordLearningWordEncounter("hypotheses", "selection")

    const records = await getWordLearningRecords()
    expect(records.hypothesis).toMatchObject({
      word: "hypothesis",
      status: "learning",
      seenCount: 2,
      sources: {
        page: 1,
        selection: 1,
      },
    })
  })

  it("marks known words while keeping legacy known storage in sync", async () => {
    await recordLearningWordEncounter("profound", "subtitles")
    await markLearningWordKnown("profound")

    const knownWords = await getKnownLearningWords()
    expect([...knownWords]).toEqual(["profound"])
    await expect(getWordLearningRecords()).resolves.toMatchObject({
      profound: {
        word: "profound",
        status: "known",
        seenCount: 1,
        sources: {
          subtitles: 1,
        },
      },
    })
  })

  it("can hide words and move them back to review", async () => {
    await recordLearningWordEncounter("abnormal", "page")
    await markLearningWordHidden("abnormal")

    expect(await getSuppressedLearningWords()).toContain("abnormal")
    expect(await getKnownLearningWords()).not.toContain("abnormal")
    await expect(getWordLearningRecords()).resolves.toMatchObject({
      abnormal: {
        status: "hidden",
        seenCount: 1,
      },
    })

    await markLearningWordKnown("abnormal")
    expect(await getKnownLearningWords()).toContain("abnormal")

    await markLearningWordLearning("abnormal")
    expect(await getSuppressedLearningWords()).not.toContain("abnormal")
    await expect(getWordLearningRecords()).resolves.toMatchObject({
      abnormal: {
        status: "learning",
        seenCount: 1,
      },
    })
  })

  it("saves words into a due review queue and schedules the next review", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1700000000000)

      await recordLearningWordEncounter("Abstract", "page")
      await saveLearningWord("abstract")

      await expect(getWordLearningRecords()).resolves.toMatchObject({
        abstract: {
          status: "learning",
          savedAt: 1700000000000,
          review: {
            dueAt: 1700000000000,
            intervalDays: 0,
            reviewCount: 0,
          },
        },
      })
      expect((await getDueLearningRecords()).map(record => record.word)).toEqual(["abstract"])

      vi.setSystemTime(1700000005000)
      await reviewLearningWord("abstract", "good")

      await expect(getWordLearningRecords()).resolves.toMatchObject({
        abstract: {
          savedAt: 1700000000000,
          review: {
            dueAt: 1700086405000,
            intervalDays: 1,
            stabilityDays: 1,
            consecutiveCorrect: 1,
            reviewCount: 1,
            lastReviewedAt: 1700000005000,
          },
        },
      })
      expect((await getDueLearningRecords()).map(record => record.word)).toEqual([])

      vi.setSystemTime(1700086405000)
      expect((await getDueLearningRecords()).map(record => record.word)).toEqual(["abstract"])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("summarizes the saved and due review queue for quick entry points", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1700000000000)

      await saveLearningWord("abstract")
      await saveLearningWord("perception")
      await reviewLearningWord("perception", "good")

      const summary = await getWordLearningReviewSummary(1700000000000)

      expect(summary).toMatchObject({
        savedCount: 2,
        dueCount: 1,
        learningCount: 2,
        knownCount: 0,
        hiddenCount: 0,
        nextDueAt: 1700086400000,
        dueWords: ["abstract"],
      })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("estimates retrievability from the forgetting curve and excludes known words from due reviews", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1700000000000)

      await saveLearningWord("abstract")
      await reviewLearningWord("abstract", "good")

      vi.setSystemTime(1700043200000)
      const records = await getWordLearningRecords()
      const halfDayRetrievability = estimateLearningWordRetrievability(records.abstract!, Date.now())
      expect(halfDayRetrievability).toBeGreaterThan(0.9)
      expect(halfDayRetrievability).toBeLessThan(1)

      await markLearningWordKnown("abstract")
      vi.setSystemTime(1700086400000)
      expect(estimateLearningWordRetrievability(records.abstract!, Date.now())).toBeLessThan(halfDayRetrievability!)
      expect((await getDueLearningRecords()).map(record => record.word)).toEqual([])
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("can remove saved review state without losing encounter history", async () => {
    await recordLearningWordEncounter("resilience", "selection")
    await saveLearningWord("resilience")
    await unsaveLearningWord("resilience")

    await expect(getWordLearningRecords()).resolves.toMatchObject({
      resilience: {
        word: "resilience",
        status: "learning",
        seenCount: 1,
        sources: {
          selection: 1,
        },
      },
    })
    const records = await getWordLearningRecords()
    expect(records.resilience?.savedAt).toBeUndefined()
    expect(records.resilience?.review).toBeUndefined()
  })

  it("extracts saveable words from selected text with a single-word fallback", () => {
    expect(getSaveableLearningWordsFromText(
      "The criteria let us acquire and integrate knowledge.",
      { minimumLevel: "cet4" },
    )).toEqual(["criteria", "acquire", "integrate", "knowledge"])

    expect(getSaveableLearningWordsFromText("hello", { minimumLevel: "gre" })).toEqual(["hello"])
    expect(getSaveableLearningWordsFromText("hello world", { minimumLevel: "gre" })).toEqual([])
  })

  it("saves selected text words into the review deck with selection source counters", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1700000010000)

      const savedRecords = await saveLearningTextWords(
        "Interpretation can constrain perception.",
        "selection",
        { minimumLevel: "cet4" },
      )

      expect(savedRecords.map(record => record.word)).toEqual(["interpretation", "constrain", "perception"])
      await expect(getWordLearningRecords()).resolves.toMatchObject({
        interpretation: {
          savedAt: 1700000010000,
          seenCount: 1,
          contexts: [
            {
              text: "Interpretation can constrain perception.",
              source: "selection",
              capturedAt: 1700000010000,
            },
          ],
          sources: {
            selection: 1,
          },
          review: {
            dueAt: 1700000010000,
          },
        },
      })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("stores selected single-word translation metadata for custom saved words", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1700000015000)

      const savedRecords = await saveLearningTextWords(
        "codexify",
        "selection",
        {
          minimumLevel: "gre",
          translationText: "交给 Codex 处理。\\n自动完成繁琐任务。",
        },
      )

      expect(savedRecords.map(record => record.word)).toEqual(["codexify"])
      await expect(getWordLearningRecords()).resolves.toMatchObject({
        codexify: {
          word: "codexify",
          savedAt: 1700000015000,
          translation: "交给 Codex 处理。\n自动完成繁琐任务。",
          shortTranslation: "交给 Codex 处理",
        },
      })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("can enrich an already saved custom word with delayed translation metadata", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(1700000016000)

      await saveLearningTextWords("noeticspark", "selection", {
        minimumLevel: "gre",
      })
      await expect(getWordLearningRecords()).resolves.toMatchObject({
        noeticspark: {
          savedAt: 1700000016000,
          seenCount: 1,
          sources: {
            selection: 1,
          },
        },
      })

      const enrichedRecords = await enrichSavedLearningTextWords("noeticspark", {
        minimumLevel: "gre",
        translationText: "顿悟；突然明白",
      })

      expect(enrichedRecords).toHaveLength(1)
      await expect(getWordLearningRecords()).resolves.toMatchObject({
        noeticspark: {
          savedAt: 1700000016000,
          seenCount: 1,
          sources: {
            selection: 1,
          },
          translation: "顿悟；突然明白",
          shortTranslation: "顿悟",
        },
      })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("records eligible words from text while respecting known-word hiding", async () => {
    await markLearningWordKnown("criteria")

    const records = await recordLearningTextEncounter(
      "The criteria let us acquire, integrate, and abandon noise.",
      "selection",
      {
        minimumLevel: "cet4",
        hideKnownWords: true,
      },
    )

    expect(records.map(record => record.word)).toEqual(["acquire", "integrate", "abandon", "noise"])
    await expect(getWordLearningRecords()).resolves.toMatchObject({
      criteria: {
        status: "known",
        seenCount: 0,
      },
      acquire: {
        seenCount: 1,
        contexts: [
          {
            text: "The criteria let us acquire, integrate, and abandon noise.",
            source: "selection",
          },
        ],
        sources: {
          selection: 1,
        },
      },
      integrate: {
        seenCount: 1,
        sources: {
          selection: 1,
        },
      },
      abandon: {
        seenCount: 1,
        sources: {
          selection: 1,
        },
      },
      noise: {
        seenCount: 1,
        sources: {
          selection: 1,
        },
      },
    })
  })

  it("deduplicates repeated reading contexts and keeps the newest examples first", async () => {
    storageValues.clear()
    await setWordLearningRecords({})
    vi.useFakeTimers()
    try {
      const firstContext = "Researchers abandon obsolete assumptions during revision."
      const secondContext = "Researchers later abandon fragile assumptions during revision."

      vi.setSystemTime(1700000020000)
      await recordLearningTextEncounter(firstContext, "page", {
        minimumLevel: "cet4",
        hideKnownWords: false,
      })

      vi.setSystemTime(1700000021000)
      await recordLearningTextEncounter(firstContext, "page", {
        minimumLevel: "cet4",
        hideKnownWords: false,
      })

      vi.setSystemTime(1700000022000)
      await recordLearningTextEncounter(secondContext, "page", {
        minimumLevel: "cet4",
        hideKnownWords: false,
      })

      const records = await getWordLearningRecords()
      expect(records.abandon).toMatchObject({
        seenCount: 3,
        contexts: [
          {
            text: secondContext,
            source: "page",
            capturedAt: 1700000022000,
          },
          {
            text: firstContext,
            source: "page",
            capturedAt: 1700000021000,
          },
        ],
      })
    }
    finally {
      vi.useRealTimers()
    }
  })
})
