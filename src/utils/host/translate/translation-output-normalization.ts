import type { ProviderConfig } from "@/types/config/provider"
import { decodeHTML } from "entities"
import { normalizeEscapedNewlines } from "@/utils/text"

export function normalizeTranslationOutput(providerConfig: Pick<ProviderConfig, "provider">, text: string): string {
  const normalizedText = providerConfig.provider === "google-translate"
    ? decodeHTML(text)
    : text

  return normalizeEscapedNewlines(normalizedText)
}
