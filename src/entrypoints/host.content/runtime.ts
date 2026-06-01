import type { ContentScriptContext } from "#imports"
import type { Config } from "@/types/config/config"
import { storage } from "#imports"
import { configSchema } from "@/types/config/config"
import { getLocalConfig } from "@/utils/config/storage"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { WORD_LEARNING_RECORDS_STORAGE_KEY } from "@/utils/constants/word-learning"
import { detectPageLanguageLightweight } from "@/utils/content/page-language"
import { ensurePresetStyles } from "@/utils/host/translate/ui/style-injector"
import { logger } from "@/utils/logger"
import { onMessage, sendMessage } from "@/utils/message"
import { clearEffectiveSiteControlUrl } from "@/utils/site-control"
import { areSamePageTranslationOrigin } from "@/utils/url"
import { WordLearningPageAnnotator } from "@/utils/word-learning/page-annotator"
import { setupUrlChangeListener } from "./listen"
import { mountHostToast } from "./mount-host-toast"
import { bindTranslationShortcutKey } from "./translation-control/bind-translation-shortcut"
import { registerNodeTranslationTriggers } from "./translation-control/node-translation"
import { PageTranslationManager } from "./translation-control/page-translation"

export async function bootstrapHostContent(ctx: ContentScriptContext, initialConfig: Config | null) {
  ensurePresetStyles(document)

  const cleanupUrlListener = setupUrlChangeListener()

  const removeHostToast = window === window.top ? mountHostToast() : () => {}

  const teardownNodeTranslation = registerNodeTranslationTriggers(initialConfig ?? DEFAULT_CONFIG)

  const preloadConfig = initialConfig?.translate.page.preload ?? DEFAULT_CONFIG.translate.page.preload
  const manager = new PageTranslationManager({
    root: null,
    rootMargin: `${preloadConfig.margin}px`,
    threshold: preloadConfig.threshold,
  })

  const cleanupPageTranslationTriggers = manager.registerPageTranslationTriggers()

  const cleanupTranslationShortcut = await bindTranslationShortcutKey(manager)

  const wordLearningAnnotator = new WordLearningPageAnnotator(initialConfig ?? DEFAULT_CONFIG)
  void wordLearningAnnotator.start()

  const cleanupWordLearningConfigWatcher = storage.watch<Config>(
    `local:${CONFIG_STORAGE_KEY}`,
    (newConfig) => {
      const parsedConfig = configSchema.safeParse(newConfig)
      if (parsedConfig.success) {
        wordLearningAnnotator.updateConfig(parsedConfig.data)
      }
    },
  )
  const cleanupWordLearningRecordsWatcher = storage.watch(
    `local:${WORD_LEARNING_RECORDS_STORAGE_KEY}`,
    () => {
      void wordLearningAnnotator.refreshWordState()
    },
  )

  const detectAndReportPageLanguage = async (url: string) => {
    const { detectedCodeOrUnd } = await detectPageLanguageLightweight()
    void sendMessage("reportDetectedPageLanguage", { url, detectedCodeOrUnd })
  }

  // For late-loading iframes: check if translation is already enabled for this tab
  let translationEnabled = false
  try {
    translationEnabled = await sendMessage("getEnablePageTranslationFromContentScript", undefined)
  }
  catch (error) {
    // Extension context may be invalidated during update, proceed without auto-start
    logger.error("Failed to check translation state:", error)
  }
  if (translationEnabled) {
    void manager.start()
  }

  const handleUrlChange = async (from: string, to: string) => {
    if (from !== to) {
      logger.info("URL changed from", from, "to", to)
      if (manager.isActive) {
        if (areSamePageTranslationOrigin(from, to)) {
          await manager.restart()
        }
        else {
          manager.stop()
        }
      }
      // Only the top frame should detect and set language to avoid race conditions from iframes
      if (window === window.top) {
        await detectAndReportPageLanguage(to)
      }

      const latestConfig = await getLocalConfig()
      wordLearningAnnotator.restartForPageChange(latestConfig ?? DEFAULT_CONFIG)
    }
  }

  const handleExtensionUrlChange = (e: any) => {
    const { from, to } = e.detail
    void handleUrlChange(from, to)
  }
  window.addEventListener("extension:URLChange", handleExtensionUrlChange)

  // Listen for translation state changes from background
  const cleanupTranslationStateListener = onMessage("askManagerToTogglePageTranslation", (msg) => {
    const { enabled, analyticsContext } = msg.data
    if (enabled === manager.isActive)
      return
    enabled ? void manager.start(window === window.top ? analyticsContext : undefined) : manager.stop()
  })

  const cleanupFrameTranslationStateListener = window === window.top
    ? () => {}
    : onMessage("notifyTranslationStateChanged", (msg) => {
        const { enabled } = msg.data
        if (enabled === manager.isActive)
          return
        enabled ? void manager.start() : manager.stop()
      })

  const cleanupDetectedLanguageRefreshListener = window === window.top
    ? onMessage("refreshDetectedPageLanguage", () => {
        void detectAndReportPageLanguage(window.location.href)
      })
    : () => {}

  ctx.onInvalidated(() => {
    removeHostToast()
    cleanupUrlListener()
    teardownNodeTranslation()
    cleanupPageTranslationTriggers()
    cleanupTranslationShortcut()
    wordLearningAnnotator.stop()
    cleanupWordLearningConfigWatcher()
    cleanupWordLearningRecordsWatcher()
    cleanupTranslationStateListener()
    cleanupFrameTranslationStateListener()
    cleanupDetectedLanguageRefreshListener()
    window.removeEventListener("extension:URLChange", handleExtensionUrlChange)
    window.__READ_FROG_HOST_INJECTED__ = false
    clearEffectiveSiteControlUrl()
  })

  // Only the top frame should detect and set language to avoid race conditions from iframes
  if (window === window.top) {
    await detectAndReportPageLanguage(window.location.href)
  }
}
