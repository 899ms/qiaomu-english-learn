const ESCAPED_NEWLINE_PATTERN = /\\r\\n|\\n|\\r/g
const INLINE_TRANSLATION_SEPARATOR_PATTERN = /[;；,，、。.!?！？]/
const PART_OF_SPEECH_PREFIX_PATTERN = /^(?:abbr|adj|adv|art|aux|conj|det|int|interj|modal|num|pl|prep|pron|vi|vt|[anv])\.\s*/i

export function normalizeEscapedNewlines(text: string): string {
  return text.replace(ESCAPED_NEWLINE_PATTERN, "\n")
}

export function normalizeEscapedNewlinesForSingleLineText(text: string): string {
  return normalizeEscapedNewlines(text)
    .split("\n")
    .map(line => line.trim())
    .find(Boolean) ?? ""
}

export function normalizeEscapedNewlinesForInlineText(text: string): string {
  const firstLine = normalizeEscapedNewlinesForSingleLineText(text)
  const withoutPartOfSpeech = firstLine.replace(PART_OF_SPEECH_PREFIX_PATTERN, "").trim()

  return (withoutPartOfSpeech.split(INLINE_TRANSLATION_SEPARATOR_PATTERN)[0] ?? withoutPartOfSpeech).trim()
}
