import { describe, expect, it } from "vitest"
import { classifyLearningWord, isLearningLevelAtLeast } from "../classifier"
import { normalizeLearningWord, tokenizeLearningWords } from "../normalize"

describe("word learning classifier", () => {
  it("normalizes simple inflections before lookup", () => {
    expect(normalizeLearningWord("abandoned")).toBe("abandon")
    expect(classifyLearningWord("abandoned", "cet4")?.word).toBe("abandon")
  })

  it("applies the configured minimum level", () => {
    expect(classifyLearningWord("abstract", "cet4")?.word).toBe("abstract")
    expect(classifyLearningWord("abstract", "cet6")).toBeNull()
    expect(classifyLearningWord("aesthetic", "cet4")?.word).toBe("aesthetic")
  })

  it("orders levels from CET4 to GRE", () => {
    expect(isLearningLevelAtLeast("cet6", "cet4")).toBe(true)
    expect(isLearningLevelAtLeast("cet4", "cet6")).toBe(false)
    expect(isLearningLevelAtLeast("gre", "ielts")).toBe(true)
  })

  it("tokenizes text with source ranges", () => {
    expect(tokenizeLearningWords("A profound, evidence-based hypothesis.")).toEqual([
      { raw: "profound", normalized: "profound", start: 2, end: 10 },
      { raw: "evidence-based", normalized: "evidence-based", start: 12, end: 26 },
      { raw: "hypothesis", normalized: "hypothesis", start: 27, end: 37 },
    ])
  })
})
