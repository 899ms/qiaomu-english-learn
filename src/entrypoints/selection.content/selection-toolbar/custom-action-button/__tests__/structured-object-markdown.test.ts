import { describe, expect, it } from "vitest"
import { formatStructuredObjectAsMarkdown } from "../structured-object-markdown"

describe("formatStructuredObjectAsMarkdown", () => {
  it("serializes custom action fields as markdown sections", () => {
    const markdown = formatStructuredObjectAsMarkdown(
      [
        {
          id: "summary",
          name: "Summary",
          type: "string",
          description: "",
          speaking: false,
        },
        {
          id: "score",
          name: "Score",
          type: "number",
          description: "",
          speaking: false,
        },
      ],
      {
        Summary: "A compact answer.",
        Score: 9,
      },
    )

    expect(markdown).toBe([
      "## Summary",
      "",
      "A compact answer.",
      "",
      "## Score",
      "",
      "9",
    ].join("\n"))
  })

  it("includes extra object fields as fenced json", () => {
    const markdown = formatStructuredObjectAsMarkdown(
      [],
      {
        Details: {
          level: "cet6",
        },
      },
    )

    expect(markdown).toBe([
      "## Details",
      "",
      "```json",
      "{",
      "  \"level\": \"cet6\"",
      "}",
      "```",
    ].join("\n"))
  })

  it("normalizes escaped newlines in string fields", () => {
    const markdown = formatStructuredObjectAsMarkdown(
      [
        {
          id: "definition",
          name: "Definition",
          type: "string",
          description: "",
          speaking: false,
        },
      ],
      {
        Definition: "第一行\\n第二行",
      },
    )

    expect(markdown).toBe([
      "## Definition",
      "",
      "第一行",
      "第二行",
    ].join("\n"))
  })
})
