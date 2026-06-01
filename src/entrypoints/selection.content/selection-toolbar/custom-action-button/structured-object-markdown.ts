import type { SelectionToolbarCustomActionOutputField } from "@/types/config/selection-toolbar"
import { normalizeEscapedNewlines } from "@/utils/text"

function formatMarkdownValue(value: unknown, type?: SelectionToolbarCustomActionOutputField["type"]): string {
  if (value === null || value === undefined)
    return ""

  if (type === "number") {
    if (typeof value === "number" && Number.isFinite(value))
      return String(value)

    const parsed = Number(value)
    return Number.isFinite(parsed) ? String(parsed) : String(value)
  }

  if (typeof value === "string")
    return normalizeEscapedNewlines(value).trim()

  if (typeof value === "number" || typeof value === "boolean")
    return String(value)

  return [
    "```json",
    JSON.stringify(value, null, 2),
    "```",
  ].join("\n")
}

export function formatStructuredObjectAsMarkdown(
  outputSchema: SelectionToolbarCustomActionOutputField[],
  value: Record<string, unknown> | null,
): string | undefined {
  if (!value)
    return undefined

  const usedFieldNames = new Set<string>()
  const sections: string[] = []

  for (const field of outputSchema) {
    const fieldValue = value[field.name]
    if (fieldValue === undefined)
      continue

    usedFieldNames.add(field.name)
    const formattedValue = formatMarkdownValue(fieldValue, field.type)
    sections.push([
      `## ${field.name}`,
      "",
      formattedValue || "—",
    ].join("\n"))
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    if (usedFieldNames.has(key) || fieldValue === undefined)
      continue

    const formattedValue = formatMarkdownValue(fieldValue)
    sections.push([
      `## ${key}`,
      "",
      formattedValue || "—",
    ].join("\n"))
  }

  const markdown = sections.join("\n\n").trim()
  return markdown || undefined
}
