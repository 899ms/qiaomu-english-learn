import { Icon } from "@iconify/react"
import { i18n } from "#imports"
import { openOptionsPage } from "@/utils/navigation"
import { AISmartContext } from "./components/ai-smart-context"
import { AlwaysTranslate } from "./components/always-translate"
import LanguageOptionsSelector from "./components/language-options-selector"
import { MoreMenu } from "./components/more-menu"
import Hotkey from "./components/node-translation-hotkey-selector"
import { SiteControlToggle } from "./components/site-control-toggle"
import TranslateButton from "./components/translate-button"
import TranslatePromptSelector from "./components/translate-prompt-selector"
import TranslateProviderField from "./components/translate-provider-field"
import TranslationModeSelector from "./components/translation-mode-selector"
import { WordLearningReviewCard } from "./components/word-learning-review-card"
import { WordLearningToggle } from "./components/word-learning-toggle"

function App() {
  return (
    <>
      <div className="bg-background flex flex-col gap-4 px-6 pt-5 pb-4">
        <LanguageOptionsSelector />
        <TranslationModeSelector />
        <TranslateProviderField />
        <TranslatePromptSelector />
        <div className="w-full">
          <TranslateButton className="w-full" />
        </div>
        <SiteControlToggle />
        <AlwaysTranslate />
        <Hotkey />
        <WordLearningToggle />
        <WordLearningReviewCard />
        <AISmartContext />
      </div>
      <div className="flex items-center justify-between bg-neutral-200 px-2 py-1 dark:bg-neutral-800">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-300 dark:hover:bg-neutral-700"
          onClick={() => {
            void openOptionsPage()
          }}
        >
          <Icon icon="tabler:settings" className="size-4" strokeWidth={1.6} />
          <span className="text-[13px] font-medium">
            {i18n.t("popup.options")}
          </span>
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:bg-neutral-300 hover:text-foreground flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium dark:hover:bg-neutral-700"
          onClick={() => {
            void openOptionsPage("/word-learning?tab=records")
          }}
        >
          <Icon icon="tabler:cards" className="size-4" strokeWidth={1.6} />
          <span>复习单词</span>
        </button>
        <MoreMenu />
      </div>
    </>
  )
}

export default App
