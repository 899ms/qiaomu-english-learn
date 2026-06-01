/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { WordLearningPageAnnotator } from "../page-annotator"

const { wordLearningStorageMock } = vi.hoisted(() => ({
  wordLearningStorageMock: {
    records: {} as Record<string, unknown>,
    getWordLearningRecords: vi.fn(async () => wordLearningStorageMock.records),
    markLearningWordHidden: vi.fn(async (word: string) => ({ word })),
    markLearningWordKnown: vi.fn(async (word: string) => ({ word })),
    recordLearningTextEncounter: vi.fn(async () => []),
    saveLearningWord: vi.fn(async (word: string) => ({ word })),
  },
}))

vi.mock("../storage", () => ({
  getWordLearningRecords: wordLearningStorageMock.getWordLearningRecords,
  markLearningWordHidden: wordLearningStorageMock.markLearningWordHidden,
  markLearningWordKnown: wordLearningStorageMock.markLearningWordKnown,
  recordLearningTextEncounter: wordLearningStorageMock.recordLearningTextEncounter,
  saveLearningWord: wordLearningStorageMock.saveLearningWord,
}))

function mockWordLearningRecords(records: unknown): void {
  wordLearningStorageMock.records = records as Record<string, unknown>
}

describe("word learning page annotator", () => {
  beforeEach(() => {
    mockWordLearningRecords({})
    document.body.innerHTML = ""
  })

  afterEach(() => {
    document.body.innerHTML = ""
    vi.clearAllMocks()
  })

  it("adds lightweight word learning annotations without page translation", async () => {
    document.body.innerHTML = "<main><p>A profound hypothesis can constrain interpretation.</p></main>"

    const annotator = new WordLearningPageAnnotator(DEFAULT_CONFIG)
    await annotator.start()

    const tokens = document.querySelectorAll(".qel-word-learning-token")
    expect(tokens.length).toBeGreaterThanOrEqual(3)
    expect(tokens[0]?.getAttribute("data-qel-short-translation")).toBe("深刻")
    expect(document.body.textContent).toContain("A profound hypothesis can constrain interpretation.")

    annotator.stop()
    expect(document.querySelector(".qel-word-learning-token")).toBeNull()
    expect(document.body.textContent).toContain("A profound hypothesis can constrain interpretation.")
  })

  it("batches page encounter recording during a scan", async () => {
    document.body.innerHTML = `
      <main>
        <p>A profound hypothesis can constrain interpretation.</p>
        <p>Another profound hypothesis can shape interpretation.</p>
      </main>
    `

    const annotator = new WordLearningPageAnnotator(DEFAULT_CONFIG)
    await annotator.start()

    expect(document.querySelectorAll(".qel-word-learning-token").length).toBeGreaterThan(0)
    expect(wordLearningStorageMock.recordLearningTextEncounter).toHaveBeenCalledTimes(1)

    annotator.stop()
  })

  it("does not re-record page encounters during an internal refresh", async () => {
    document.body.innerHTML = "<main><p>A profound hypothesis can constrain interpretation.</p></main>"

    const annotator = new WordLearningPageAnnotator(DEFAULT_CONFIG)
    await annotator.start()
    await annotator.refreshWordState()

    expect(wordLearningStorageMock.recordLearningTextEncounter).toHaveBeenCalledTimes(1)
    expect(document.querySelector(".qel-word-learning-token")).toBeTruthy()

    annotator.stop()
  })

  it("opens the word popover when clicking the token text", async () => {
    document.body.innerHTML = "<main><p>A profound hypothesis can constrain interpretation.</p></main>"

    const annotator = new WordLearningPageAnnotator(DEFAULT_CONFIG)
    await annotator.start()

    document.querySelector<HTMLElement>(".qel-word-learning-source")?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }))

    expect(document.querySelector(".qel-word-learning-popover")).toBeTruthy()

    annotator.stop()
  })

  it("keeps an open popover when records only change encounter counters", async () => {
    document.body.innerHTML = "<main><p>A profound hypothesis can constrain interpretation.</p></main>"

    const annotator = new WordLearningPageAnnotator(DEFAULT_CONFIG)
    await annotator.start()

    document.querySelector<HTMLElement>(".qel-word-learning-source")?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }))

    const popover = document.querySelector(".qel-word-learning-popover")
    expect(popover).toBeTruthy()

    mockWordLearningRecords({
      profound: {
        word: "profound",
        status: "learning",
        seenCount: 12,
        firstSeenAt: 1,
        lastSeenAt: 2,
        sources: { page: 12 },
      },
    })
    await annotator.refreshWordState()

    expect(document.querySelector(".qel-word-learning-popover")).toBe(popover)
    expect(document.querySelector(".qel-word-learning-token")).toBeTruthy()

    annotator.stop()
  })

  it("scans newly added page subtrees without reprocessing the whole document", async () => {
    vi.useFakeTimers()
    try {
      document.body.innerHTML = "<main><p>A profound idea can stay readable.</p></main>"

      const annotator = new WordLearningPageAnnotator(DEFAULT_CONFIG)
      await annotator.start()
      await vi.advanceTimersByTimeAsync(0)
      wordLearningStorageMock.recordLearningTextEncounter.mockClear()

      const section = document.createElement("section")
      section.innerHTML = "<p>A hypothesis can constrain interpretation.</p>"
      document.querySelector("main")?.appendChild(section)

      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(300)

      expect(document.querySelector(".qel-word-learning-token[data-qel-word='hypothesis']")).toBeTruthy()
      expect(wordLearningStorageMock.recordLearningTextEncounter).toHaveBeenCalledTimes(1)

      annotator.stop()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("caps automatic page annotations per scan", async () => {
    document.body.innerHTML = `<main>${
      Array.from({ length: 300 }).fill("<p>A hypothesis can shape interpretation.</p>").join("")
    }</main>`

    const annotator = new WordLearningPageAnnotator(DEFAULT_CONFIG)
    await annotator.start()

    expect(document.querySelectorAll(".qel-word-learning-token").length).toBeLessThanOrEqual(240)

    annotator.stop()
  })

  it("removes page annotations immediately after marking a popover word as known", async () => {
    vi.useFakeTimers()
    try {
      document.body.innerHTML = "<main><p>A preview can keep another preview readable.</p></main>"

      const annotator = new WordLearningPageAnnotator(DEFAULT_CONFIG)
      await annotator.start()

      const getPreviewTokens = () =>
        document.querySelectorAll<HTMLElement>(".qel-word-learning-token[data-qel-word='preview']")

      expect(getPreviewTokens()).toHaveLength(2)

      getPreviewTokens()[0]?.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }))

      const knownButton = [...document.querySelectorAll<HTMLButtonElement>(".qel-word-learning-popover-actions button")]
        .find(button => button.textContent === "已掌握")
      expect(knownButton).toBeTruthy()

      knownButton?.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }))

      expect(getPreviewTokens()).toHaveLength(0)
      expect(document.querySelector(".qel-word-learning-popover")).toBeNull()
      expect(document.body.textContent).toContain("A preview can keep another preview readable.")
      expect(wordLearningStorageMock.markLearningWordKnown).toHaveBeenCalledWith("preview")

      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(300)

      expect(getPreviewTokens()).toHaveLength(0)

      annotator.stop()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("shows immediate review feedback when saving a popover word", async () => {
    document.body.innerHTML = "<main><p>A hypothesis can shape a careful interpretation.</p></main>"

    const annotator = new WordLearningPageAnnotator(DEFAULT_CONFIG)
    await annotator.start()

    const token = document.querySelector<HTMLElement>(".qel-word-learning-token[data-qel-word='hypothesis']")
    expect(token).toBeTruthy()
    expect(token?.dataset.qelSaved).toBe("false")

    token?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }))

    const saveButton = [...document.querySelectorAll<HTMLButtonElement>(".qel-word-learning-popover-actions button")]
      .find(button => button.textContent === "加入复习")
    expect(saveButton).toBeTruthy()

    saveButton?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }))

    expect(saveButton?.textContent).toBe("加入中")

    await vi.waitFor(() => {
      expect(wordLearningStorageMock.saveLearningWord).toHaveBeenCalledWith("hypothesis")
      expect(saveButton?.textContent).toBe("已加入复习")
      expect(saveButton?.disabled).toBe(true)
      expect(token?.dataset.qelSaved).toBe("true")
    })

    annotator.stop()
  })

  it("shows saved page words as already added to review", async () => {
    mockWordLearningRecords({
      hypothesis: {
        word: "hypothesis",
        status: "learning",
        seenCount: 1,
        firstSeenAt: 1,
        lastSeenAt: 1,
        savedAt: 1,
        sources: {},
      },
    })
    document.body.innerHTML = "<main><p>A hypothesis can stay in review.</p></main>"

    const annotator = new WordLearningPageAnnotator(DEFAULT_CONFIG)
    await annotator.start()

    const token = document.querySelector<HTMLElement>(".qel-word-learning-token[data-qel-word='hypothesis']")
    expect(token?.dataset.qelSaved).toBe("true")

    token?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }))

    const saveButton = [...document.querySelectorAll<HTMLButtonElement>(".qel-word-learning-popover-actions button")]
      .find(button => button.textContent === "已加入复习")
    expect(saveButton).toBeTruthy()
    expect(saveButton?.disabled).toBe(true)

    annotator.stop()
  })

  it("does not annotate when learning mode is disabled", async () => {
    document.body.innerHTML = "<main><p>A profound hypothesis.</p></main>"

    const annotator = new WordLearningPageAnnotator({
      ...DEFAULT_CONFIG,
      wordLearning: {
        ...DEFAULT_CONFIG.wordLearning,
        enabled: false,
      },
    })
    await annotator.start()

    expect(document.querySelector(".qel-word-learning-token")).toBeNull()
  })

  it("annotates saved words even when they are below the current level threshold", async () => {
    mockWordLearningRecords({
      profound: {
        word: "profound",
        status: "learning",
        seenCount: 0,
        firstSeenAt: 1,
        lastSeenAt: 1,
        savedAt: 1,
        sources: {},
      },
    })
    document.body.innerHTML = "<main><p>A profound idea can stay readable.</p></main>"

    const annotator = new WordLearningPageAnnotator({
      ...DEFAULT_CONFIG,
      wordLearning: {
        ...DEFAULT_CONFIG.wordLearning,
        minimumLevel: "gre",
      },
    })
    await annotator.start()

    const token = document.querySelector<HTMLElement>(".qel-word-learning-token")
    expect(token?.dataset.qelWord).toBe("profound")
    expect(token?.dataset.qelShortTranslation).toBe("深刻")

    annotator.stop()
  })

  it("uses saved translation metadata for custom single-word saves", async () => {
    mockWordLearningRecords({
      codexify: {
        word: "codexify",
        status: "learning",
        seenCount: 0,
        firstSeenAt: 1,
        lastSeenAt: 1,
        savedAt: 1,
        translation: "交给 Codex 处理\\n作为动词使用",
        shortTranslation: "交给 Codex\\n作为动词",
        sources: {},
      },
    })
    document.body.innerHTML = "<main><p>We codexify tedious tasks.</p></main>"

    const annotator = new WordLearningPageAnnotator({
      ...DEFAULT_CONFIG,
      wordLearning: {
        ...DEFAULT_CONFIG.wordLearning,
        minimumLevel: "gre",
      },
    })
    await annotator.start()

    const token = document.querySelector<HTMLElement>(".qel-word-learning-token")
    expect(token?.dataset.qelWord).toBe("codexify")
    expect(token?.dataset.qelTranslation).toBe("交给 Codex 处理\n作为动词使用")
    expect(token?.dataset.qelShortTranslation).toBe("交给 Codex")

    annotator.stop()
  })
})
