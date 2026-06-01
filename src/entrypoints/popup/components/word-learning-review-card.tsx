import type { WordLearningReviewSummary } from "@/utils/word-learning/review-summary"
import { Icon } from "@iconify/react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { openOptionsPage } from "@/utils/navigation"
import { getWordLearningReviewSummary } from "@/utils/word-learning/review-summary"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

function formatNextReviewTime(dueAt: number, now: number): string {
  const delta = dueAt - now
  if (delta <= 0)
    return "现在"

  if (delta < HOUR_MS)
    return `${Math.ceil(delta / MINUTE_MS)} 分钟后`

  if (delta < DAY_MS)
    return `${Math.ceil(delta / HOUR_MS)} 小时后`

  return `${Math.ceil(delta / DAY_MS)} 天后`
}

function formatDueWords(words: string[]): string {
  if (words.length === 0)
    return "从最容易忘的开始"

  if (words.length <= 2)
    return words.join("、")

  return `${words.slice(0, 2).join("、")} 等`
}

function getReviewCardCopy(summary: WordLearningReviewSummary | null, now: number) {
  if (!summary) {
    return {
      title: "今日复习",
      headline: "读取中",
      description: "正在同步生词本状态。",
      actionLabel: "打开生词本",
      actionVariant: "outline" as const,
    }
  }

  if (summary.dueCount > 0) {
    return {
      title: "今日复习",
      headline: `${summary.dueCount} 个到期`,
      description: `先复习 ${formatDueWords(summary.dueWords)}`,
      actionLabel: "开始复习",
      actionVariant: "default" as const,
    }
  }

  if (summary.savedCount > 0) {
    return {
      title: "今日复习",
      headline: "今天清空",
      description: summary.nextDueAt
        ? `下一张 ${formatNextReviewTime(summary.nextDueAt, now)} 到期`
        : `已收藏 ${summary.savedCount} 个单词`,
      actionLabel: "查看生词",
      actionVariant: "outline" as const,
    }
  }

  return {
    title: "今日复习",
    headline: "还没有生词",
    description: "网页、划词和手动添加会进入这里。",
    actionLabel: "打开生词本",
    actionVariant: "outline" as const,
  }
}

export function WordLearningReviewCard() {
  const [summary, setSummary] = useState<WordLearningReviewSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let isMounted = true

    getWordLearningReviewSummary(now)
      .then((nextSummary) => {
        if (isMounted) {
          setSummary(nextSummary)
          setLoadError(null)
        }
      })
      .catch((error) => {
        if (isMounted) {
          setLoadError(error instanceof Error ? error.message : "读取复习状态失败。")
        }
      })

    return () => {
      isMounted = false
    }
  }, [now])

  const copy = loadError
    ? {
        title: "今日复习",
        headline: "状态不可用",
        description: loadError,
        actionLabel: "打开生词本",
        actionVariant: "outline" as const,
      }
    : getReviewCardCopy(summary, now)

  const handleOpenReview = () => {
    void openOptionsPage("/word-learning?tab=records")
  }

  return (
    <section className="rounded-md border bg-muted/25 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-muted-foreground flex items-center gap-1 text-[11px] font-medium">
            <Icon icon="tabler:clock-hour-4" className="size-3.5" />
            {copy.title}
          </div>
          <div className="mt-1 truncate text-[15px] font-semibold">
            {copy.headline}
          </div>
          <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-5">
            {copy.description}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant={copy.actionVariant}
          className="shrink-0"
          onClick={handleOpenReview}
        >
          <Icon icon="tabler:cards" className="size-3.5" />
          {copy.actionLabel}
        </Button>
      </div>
    </section>
  )
}
