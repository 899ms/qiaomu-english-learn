import { describe, expect, it } from "vitest"
import { classifyLearningWord } from "../classifier"
import { WORD_LEARNING_LEXICON } from "../lexicon"

describe("word learning lexicon", () => {
  it("uses a generated CET/ECDICT lexicon instead of only the seed words", () => {
    expect(WORD_LEARNING_LEXICON.length).toBeGreaterThan(10000)
    expect(classifyLearningWord("abbreviation", "cet4")?.word).toBe("abbreviation")
    expect(classifyLearningWord("abandonment", "toefl")?.word).toBe("abandonment")
    expect(classifyLearningWord("abandonment", "gre")).toBeNull()
  })

  it("keeps curated seed entries as overrides for cleaner reading glosses", () => {
    expect(classifyLearningWord("abstract", "cet4")).toMatchObject({
      word: "abstract",
      translation: "抽象的；摘要",
      shortTranslation: "抽象",
    })

    expect(classifyLearningWord("epiphany", "toefl")).toMatchObject({
      word: "epiphany",
      translation: "顿悟；豁然开朗；突然明白",
      shortTranslation: "顿悟",
    })
  })

  it("normalizes escaped newlines from generated dictionary rows", () => {
    expect(classifyLearningWord("obtuse", "gre")).toMatchObject({
      word: "obtuse",
      translation: "a. 钝的, 不锋利的, 愚钝的\n[医] 钝形的, 迟钝的(智力)",
      shortTranslation: "钝的",
    })

    expect(classifyLearningWord("what", "cet4")).toMatchObject({
      word: "what",
      translation: "pron. 什么\ninterj. 怎么, 多么\na. 什么的\nadv. 到什么程度",
      shortTranslation: "什么",
    })
  })
})
