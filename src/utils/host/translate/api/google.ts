import { env } from "@/env"
import { attachRequestErrorMeta } from "@/utils/request/retry-policy"
import { googleTranslateLegacySingle } from "./google-legacy"

const GOOGLE_TRANSLATE_HTML_URL = "https://translate-pa.googleapis.com/v1/translateHtml"
const GOOGLE_TRANSLATE_HTML_CLIENT = "wt_lib"

export async function googleTranslate(
  sourceText: string,
  fromLang: string,
  toLang: string,
): Promise<string> {
  const apiKey = env.WXT_GOOGLE_TRANSLATE_HTML_PUBLIC_KEY

  if (!apiKey) {
    return googleTranslateLegacySingle(sourceText, fromLang, toLang)
  }

  const resp = await fetch(
    GOOGLE_TRANSLATE_HTML_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json+protobuf",
        "X-Goog-API-Key": apiKey,
      },
      body: JSON.stringify([
        [[sourceText], fromLang, toLang],
        GOOGLE_TRANSLATE_HTML_CLIENT,
      ]),
    },
  ).catch((error) => {
    throw attachRequestErrorMeta(
      new Error(`Network error during translation: ${error.message}`),
      { kind: "network", isRetryable: true },
    )
  })

  if (!resp.ok) {
    const errorText = await resp
      .text()
      .catch(() => "Unable to read error response")
    throw attachRequestErrorMeta(
      new Error(`Translation request failed: ${resp.status} ${resp.statusText}${
        errorText ? ` - ${errorText}` : ""
      }`),
      {
        statusCode: resp.status,
        responseHeaders: resp.headers,
      },
    )
  }

  try {
    const result = await resp.json()

    if (!Array.isArray(result) || !Array.isArray(result[0]) || typeof result[0][0] !== "string") {
      throw new TypeError("Unexpected response format from translation API")
    }

    return result[0][0]
  }
  catch (error) {
    throw new Error(
      `Failed to parse translation response: ${(error as Error).message}`,
    )
  }
}
