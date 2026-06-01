import type { ThinkingSnapshot } from "@/types/background-stream"
import type { WordLearningLevel } from "@/types/config/word-learning"
import { IconLoader2 } from "@tabler/icons-react"
import { Activity } from "react"
import { Thinking } from "@/components/thinking"
import { normalizeEscapedNewlines } from "@/utils/text"
import { CopyButton } from "../../components/copy-button"
import { SaveLearningWordsButton } from "../../components/save-learning-words-button"
import { SelectionSourceContent } from "../../components/selection-source-content"
import { SpeakButton } from "../../components/speak-button"

interface TranslationContentProps {
  selectionContent: string | null | undefined
  translatedText: string | undefined
  isTranslating: boolean
  minimumWordLearningLevel: WordLearningLevel
  thinking: ThinkingSnapshot | null
}

export function TranslationContent({
  selectionContent,
  translatedText,
  isTranslating,
  minimumWordLearningLevel,
  thinking,
}: TranslationContentProps) {
  const showLoadingIndicator = isTranslating && !thinking && !translatedText
  const showStreamingIndicator = isTranslating && !thinking && translatedText
  const displayTranslatedText = translatedText === undefined
    ? undefined
    : normalizeEscapedNewlines(translatedText)
  const saveTranslatedText = isTranslating ? null : displayTranslatedText
  return (
    <div className="p-4">
      <SelectionSourceContent
        text={selectionContent}
        separatorClassName="mb-3"
        trailingActions={(
          <SaveLearningWordsButton
            className="size-6"
            text={selectionContent}
            translatedText={saveTranslatedText}
            minimumLevel={minimumWordLearningLevel}
          />
        )}
      />
      <div className="space-y-2">
        {thinking && (
          <Thinking status={thinking.status} content={thinking.text} />
        )}
        <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {showLoadingIndicator && <IconLoader2 className="inline size-4 animate-spin" strokeWidth={1.6} />}
          {displayTranslatedText}
          {showStreamingIndicator && " ●"}
        </p>
        <Activity mode={translatedText ? "visible" : "hidden"}>
          <div className="flex items-center gap-1">
            <CopyButton text={displayTranslatedText} />
            <SpeakButton text={displayTranslatedText} />
          </div>
        </Activity>
      </div>
    </div>
  )
}
