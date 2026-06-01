import type { WordLearningLevel } from "@/types/config/word-learning"
import { IconBookmark, IconBookmarkFilled } from "@tabler/icons-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { i18n } from "#imports"
import { buttonVariants } from "@/components/ui/base-ui/button"
import { cn } from "@/utils/styles/utils"
import { enrichSavedLearningTextWords, saveLearningTextWords } from "@/utils/word-learning/storage"
import { SelectionPopoverTooltip, useSelectionTooltipState } from "./selection-tooltip"

type SaveStatus = "idle" | "saved" | "empty" | "error"
interface SaveState {
  status: SaveStatus
  text: string | null | undefined
}

function getTooltipText(status: SaveStatus): string {
  if (status === "saved")
    return i18n.t("action.savedWords")
  if (status === "empty")
    return i18n.t("action.noWordsToSave")
  if (status === "error")
    return i18n.t("action.saveWordsFailed")
  return i18n.t("action.saveWords")
}

function getSaveableTranslationText(translatedText: string | null | undefined): string | null {
  return translatedText?.trim() ? translatedText : null
}

export function SaveLearningWordsButton({
  className,
  minimumLevel,
  text,
  translatedText,
}: {
  className?: string
  minimumLevel: WordLearningLevel
  text: string | null | undefined
  translatedText?: string | null
}) {
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", text })
  const { handlePress, onOpenChange: handleTooltipOpenChange, open: tooltipOpen } = useSelectionTooltipState()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingTranslationTextRef = useRef<string | null>(null)
  const enrichedTranslationKeyRef = useRef<string | null>(null)
  const status = saveState.text === text ? saveState.status : "idle"
  const label = getTooltipText(status)

  const clearStatusTimer = useCallback(() => {
    if (timerRef.current)
      clearTimeout(timerRef.current)
    timerRef.current = undefined
  }, [])

  const resetTransientStatus = useCallback((savedText: string) => {
    clearStatusTimer()
    timerRef.current = setTimeout(() => {
      setSaveState({ status: "idle", text: savedText })
      timerRef.current = undefined
    }, 1500)
  }, [clearStatusTimer])

  useEffect(() => {
    return clearStatusTimer
  }, [clearStatusTimer])

  useEffect(() => {
    pendingTranslationTextRef.current = null
    enrichedTranslationKeyRef.current = null
  }, [text])

  useEffect(() => {
    const translationText = getSaveableTranslationText(translatedText)
    if (!text || !translationText || status !== "saved" || pendingTranslationTextRef.current !== text)
      return

    const enrichmentKey = `${text}\n${translationText}`
    if (enrichedTranslationKeyRef.current === enrichmentKey)
      return

    enrichedTranslationKeyRef.current = enrichmentKey
    void enrichSavedLearningTextWords(text, { minimumLevel, translationText })
      .then((records) => {
        if (records.length > 0)
          pendingTranslationTextRef.current = null
      })
      .catch(() => {
        enrichedTranslationKeyRef.current = null
      })
  }, [minimumLevel, status, text, translatedText])

  const handleSave = useCallback(() => {
    if (!text)
      return

    const savedText = text
    const translationText = getSaveableTranslationText(translatedText)
    clearStatusTimer()
    pendingTranslationTextRef.current = translationText ? null : savedText
    void saveLearningTextWords(
      savedText,
      "selection",
      translationText ? { minimumLevel, translationText } : { minimumLevel },
    )
      .then((records) => {
        setSaveState({ status: records.length > 0 ? "saved" : "empty", text: savedText })
        if (records.length === 0) {
          pendingTranslationTextRef.current = null
          resetTransientStatus(savedText)
        }
      })
      .catch(() => {
        pendingTranslationTextRef.current = null
        setSaveState({ status: "error", text: savedText })
        resetTransientStatus(savedText)
      })
      .finally(() => {
        handlePress()
      })
  }, [clearStatusTimer, handlePress, minimumLevel, resetTransientStatus, text, translatedText])

  return (
    <SelectionPopoverTooltip
      content={label}
      open={tooltipOpen}
      onOpenChange={handleTooltipOpenChange}
      render={(
        <button
          type="button"
          aria-label={label}
          aria-pressed={status === "saved"}
          className={cn(buttonVariants({ variant: "ghost-secondary", size: "icon-sm" }), className)}
          onClick={handleSave}
          title={label}
        />
      )}
    >
      {status === "saved"
        ? <IconBookmarkFilled className="text-emerald-600" />
        : <IconBookmark />}
    </SelectionPopoverTooltip>
  )
}
