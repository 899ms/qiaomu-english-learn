import type { ReactNode } from "react"
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import { Activity, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { ScrollArea } from "@/components/ui/base-ui/scroll-area"
import { Separator } from "@/components/ui/base-ui/separator"
import { cn } from "@/utils/styles/utils"
import { normalizeEscapedNewlines } from "@/utils/text"
import { CopyButton } from "./copy-button"
import { SpeakButton } from "./speak-button"

interface SelectionSourceContentProps {
  text: string | null | undefined
  defaultExpanded?: boolean
  emptyPlaceholder?: string
  separatorClassName?: string
  trailingActions?: ReactNode
}

export function SelectionSourceContent({
  text,
  defaultExpanded = false,
  emptyPlaceholder,
  separatorClassName,
  trailingActions,
}: SelectionSourceContentProps) {
  const [actionsExpanded, setActionsExpanded] = useState(defaultExpanded)
  const displayText = normalizeEscapedNewlines(text || emptyPlaceholder || "")
  const actionText = text ? normalizeEscapedNewlines(text) : undefined

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <ScrollArea className={cn("min-w-0 flex-1", actionsExpanded && "h-18 overflow-hidden")}>
            <p className={cn("text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-zinc-600 dark:text-zinc-400", !actionsExpanded && "line-clamp-3")}>
              {displayText}
            </p>
          </ScrollArea>
          <div className="flex shrink-0 items-center gap-1">
            {trailingActions}
            <Button
              variant="ghost-secondary"
              size="icon-xs"
              className="size-5.5 shrink-0"
              onClick={() => setActionsExpanded(prev => !prev)}
            >
              <Activity mode={actionsExpanded ? "visible" : "hidden"}>
                <IconChevronUp />
              </Activity>
              <Activity mode={actionsExpanded ? "hidden" : "visible"}>
                <IconChevronDown />
              </Activity>
            </Button>
          </div>
        </div>
        <Activity mode={actionsExpanded ? "visible" : "hidden"}>
          <div className="flex items-center gap-1">
            <CopyButton text={actionText} />
            <SpeakButton text={actionText} />
          </div>
        </Activity>
      </div>
      <Separator className={cn("opacity-60", actionsExpanded ? "mt-1.5" : "mt-3", separatorClassName)} />
    </>
  )
}
