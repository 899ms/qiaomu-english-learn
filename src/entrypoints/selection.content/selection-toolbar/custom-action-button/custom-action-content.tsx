import type { ThinkingSnapshot } from "@/types/background-stream"
import type { SelectionToolbarCustomActionOutputField } from "@/types/config/selection-toolbar"
import { useMemo } from "react"
import { CopyButton } from "../../components/copy-button"
import { SelectionSourceContent } from "../../components/selection-source-content"
import { formatStructuredObjectAsMarkdown } from "./structured-object-markdown"
import { StructuredObjectRenderer } from "./structured-object-renderer"

interface CustomActionContentProps {
  isRunning: boolean
  outputSchema: SelectionToolbarCustomActionOutputField[]
  selectionContent: string | null | undefined
  value: Record<string, unknown> | null
  thinking: ThinkingSnapshot | null
}

export function CustomActionContent({
  isRunning,
  outputSchema,
  selectionContent,
  value,
  thinking,
}: CustomActionContentProps) {
  const markdownText = useMemo(
    () => formatStructuredObjectAsMarkdown(outputSchema, value),
    [outputSchema, value],
  )

  return (
    <div className="p-4">
      <SelectionSourceContent
        text={selectionContent}
        emptyPlaceholder="—"
        separatorClassName="mb-4"
      />

      <div className="space-y-2">
        <div className="flex justify-end">
          <CopyButton
            text={markdownText}
            tooltipText="复制 Markdown"
            ariaLabel="复制 Markdown 格式结果"
            className="size-6"
          />
        </div>
        <StructuredObjectRenderer
          outputSchema={outputSchema}
          value={value}
          isStreaming={isRunning}
          thinking={thinking}
        />
      </div>
    </div>
  )
}
