import type { Config } from "@/types/config/config"
import { getLocalConfig } from "@/utils/config/storage"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { removeOrShowNodeTranslation } from "@/utils/host/translate/node-manipulation"
import { sendMessage } from "@/utils/message"
import { registerNodeTranslationTriggerListeners } from "./node-translation-trigger"

const NODE_TRANSLATION_CONFIG_CACHE_TTL_MS = 1000

/**
 * Registers node translation triggers based on the current config.
 * Returns a teardown function to remove all listeners.
 *
 * Config is cached briefly so ordinary key/mouse events don't hit extension
 * storage on every page interaction, while still picking up settings changes.
 */
export function registerNodeTranslationTriggers(initialConfig: Config | null = null): () => void {
  const ac = new AbortController()
  const { signal } = ac
  let cachedConfig = initialConfig ?? null
  let lastConfigReadAt = cachedConfig ? performance.now() : 0

  const getCurrentConfig = async (): Promise<Config | null> => {
    const now = performance.now()
    if (cachedConfig && now - lastConfigReadAt < NODE_TRANSLATION_CONFIG_CACHE_TTL_MS)
      return cachedConfig

    const config = await getLocalConfig()
    if (signal.aborted)
      return null

    cachedConfig = config ?? DEFAULT_CONFIG
    lastConfigReadAt = now
    return cachedConfig
  }

  let hasRequestedIframeInjection = false

  const requestIframeInjectionAfterSuccessfulTopFrameNodeTranslation = () => {
    if (hasRequestedIframeInjection || window !== window.top || signal.aborted)
      return

    hasRequestedIframeInjection = true
    void sendMessage("injectCurrentIframesAfterTopFrameNodeTranslation", undefined)
      .catch(() => undefined)
  }

  const translateNode = async (point: Parameters<typeof removeOrShowNodeTranslation>[0], config: Config) => {
    const didTranslate = await removeOrShowNodeTranslation(point, config)
    if (didTranslate) {
      requestIframeInjectionAfterSuccessfulTopFrameNodeTranslation()
    }
  }

  const teardownTriggerListeners = registerNodeTranslationTriggerListeners({
    getConfig: getCurrentConfig,
    onTrigger: (point, config) => {
      void translateNode(point, config)
    },
  })

  // Teardown: abort all listeners + cancel pending timers
  return () => {
    ac.abort()
    teardownTriggerListeners()
  }
}
