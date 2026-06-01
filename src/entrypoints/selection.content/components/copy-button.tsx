import { IconCheck, IconCopy } from "@tabler/icons-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { i18n } from "#imports"
import { buttonVariants } from "@/components/ui/base-ui/button"
import { cn } from "@/utils/styles/utils"
import { SelectionPopoverTooltip, useSelectionTooltipState } from "./selection-tooltip"

export function CopyButton({
  ariaLabel,
  className,
  disabled = false,
  text,
  tooltipText,
}: {
  ariaLabel?: string
  className?: string
  disabled?: boolean
  text: string | null | undefined
  tooltipText?: string
}) {
  const [copied, setCopied] = useState(false)
  const { handlePress, onOpenChange: handleTooltipOpenChange, open: tooltipOpen } = useSelectionTooltipState()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const copyDisabled = disabled || !text

  useEffect(() => {
    return () => {
      if (timerRef.current)
        clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = useCallback(() => {
    if (copyDisabled || !text)
      return
    void navigator.clipboard.writeText(text)
    setCopied(true)
    handlePress()
    if (timerRef.current)
      clearTimeout(timerRef.current)
    timerRef.current = setTimeout(setCopied, 1500, false)
  }, [copyDisabled, handlePress, text])

  return (
    <SelectionPopoverTooltip
      content={copied ? i18n.t("action.copied") : (tooltipText ?? i18n.t("action.copy"))}
      open={tooltipOpen}
      onOpenChange={handleTooltipOpenChange}
      render={(
        <button
          type="button"
          aria-label={ariaLabel ?? tooltipText ?? i18n.t("action.copy")}
          disabled={copyDisabled}
          className={cn(buttonVariants({ variant: "ghost-secondary", size: "icon-sm" }), className)}
          onClick={handleCopy}
        />
      )}
    >
      {copied
        ? <IconCheck className="text-green-500" />
        : <IconCopy />}
    </SelectionPopoverTooltip>
  )
}
