import type { MouseEvent } from "react"
import { IconCheck, IconCopy } from "@tabler/icons-react"
import { useAtomValue } from "jotai"
import { useCallback, useEffect, useRef, useState } from "react"
import { i18n } from "#imports"
import { SelectionToolbarTooltip, useSelectionTooltipState } from "../components/selection-tooltip"
import { selectionSessionAtom } from "./atoms"

export function SelectionToolbarCopyButton() {
  const selectionSession = useAtomValue(selectionSessionAtom)
  const selectedText = selectionSession?.selectionSnapshot.text
  const [copied, setCopied] = useState(false)
  const { handlePress, onOpenChange: handleTooltipOpenChange, open: tooltipOpen } = useSelectionTooltipState()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => {
      if (timerRef.current)
        clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur()
    if (!selectedText)
      return

    void navigator.clipboard.writeText(selectedText)
    setCopied(true)
    handlePress()
    if (timerRef.current)
      clearTimeout(timerRef.current)
    timerRef.current = setTimeout(setCopied, 1500, false)
  }, [handlePress, selectedText])

  return (
    <SelectionToolbarTooltip
      content={copied ? i18n.t("action.copied") : i18n.t("action.copy")}
      open={tooltipOpen}
      onOpenChange={handleTooltipOpenChange}
      render={(
        <button
          type="button"
          aria-label={i18n.t("action.copy")}
          className="px-2 h-7 shrink-0 flex items-center justify-center hover:bg-accent cursor-pointer"
          onClick={handleCopy}
        />
      )}
    >
      {copied
        ? <IconCheck className="size-4.5 text-green-500" />
        : <IconCopy className="size-4.5" />}
    </SelectionToolbarTooltip>
  )
}
