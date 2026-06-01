import { describe, expect, it } from "vitest"
import {
  normalizeEscapedNewlines,
  normalizeEscapedNewlinesForInlineText,
  normalizeEscapedNewlinesForSingleLineText,
} from "../text"

describe("text normalization", () => {
  it("turns escaped newline sequences into real line breaks", () => {
    expect(normalizeEscapedNewlines("alpha\\nbeta\\r\\ngamma\\rdelta")).toBe("alpha\nbeta\ngamma\ndelta")
  })

  it("can normalize escaped newlines for inline labels", () => {
    expect(normalizeEscapedNewlinesForInlineText("alpha \\n beta")).toBe("alpha")
  })

  it("can keep the first clean line without cutting punctuation", () => {
    expect(normalizeEscapedNewlinesForSingleLineText("/əˈbæn.dən/\\nextra")).toBe("/əˈbæn.dən/")
  })

  it("keeps only the most likely dictionary gloss for inline labels", () => {
    expect(normalizeEscapedNewlinesForInlineText("pron. 什么\\ninterj. 怎么, 多么")).toBe("什么")
    expect(normalizeEscapedNewlinesForInlineText("interj. 怎么, 多么")).toBe("怎么")
    expect(normalizeEscapedNewlinesForInlineText("决定；决心")).toBe("决定")
  })
})
