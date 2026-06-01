import type { FormEvent } from "react"
import type { WordLearningDisplayMode, WordLearningLevel } from "@/types/config/word-learning"
import type {
  WordLearningContext,
  WordLearningRecord,
  WordLearningReviewRating,
  WordLearningSource,
  WordLearningStatus,
} from "@/utils/word-learning/storage"
import {
  IconBookmark,
  IconBookmarkOff,
  IconBookmarkPlus,
  IconBrain,
  IconCalendarDue,
  IconCards,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconRefresh,
  IconRotateClockwise,
  IconSettings,
  IconX,
} from "@tabler/icons-react"
import { useAtom, useAtomValue } from "jotai"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { Badge } from "@/components/ui/base-ui/badge"
import { Button } from "@/components/ui/base-ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/base-ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/base-ui/empty"
import { Input } from "@/components/ui/base-ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { Switch } from "@/components/ui/base-ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/base-ui/table"
import { WORD_LEARNING_LEVELS } from "@/types/config/word-learning"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { normalizeEscapedNewlines } from "@/utils/text"
import { lookupLearningWord } from "@/utils/word-learning/classifier"
import { tokenizeLearningWords } from "@/utils/word-learning/normalize"
import {
  estimateLearningWordRetrievability,
  getWordLearningRecords,
  isLearningWordDue,
  markLearningWordHidden,
  markLearningWordKnown,
  markLearningWordLearning,
  reviewLearningWord,
  saveLearningTextWords,
  saveLearningWord,
  unsaveLearningWord,
} from "@/utils/word-learning/storage"
import { ConfigCard } from "../../components/config-card"
import { PageLayout } from "../../components/page-layout"

const LEVEL_LABELS: Record<WordLearningLevel, string> = {
  cet4: "四级及以上",
  cet6: "六级及以上",
  postgraduate: "考研及以上",
  ielts: "雅思及以上",
  toefl: "托福及以上",
  gre: "GRE",
}

const DISPLAY_LABELS: Record<WordLearningDisplayMode, string> = {
  inlineGloss: "行内释义",
  underline: "仅下划线",
}

const STATUS_LABELS: Record<WordLearningStatus, string> = {
  learning: "学习中",
  known: "已掌握",
  hidden: "已隐藏",
}

const STATUS_RANK: Record<WordLearningStatus, number> = {
  learning: 0,
  hidden: 1,
  known: 2,
}

const SOURCE_LABELS: Record<WordLearningSource, string> = {
  page: "网页",
  selection: "划词",
  subtitles: "字幕",
  tts: "朗读",
  manual: "手动",
}

type WordLearningRecordFilter = "due" | "saved" | "learning" | "known" | "hidden"

const FILTER_LABELS: Record<WordLearningRecordFilter, string> = {
  due: "待复习",
  saved: "已收藏",
  learning: "学习中",
  known: "已掌握",
  hidden: "已隐藏",
}

const REVIEW_RATING_LABELS: Record<WordLearningReviewRating, string> = {
  again: "再来",
  hard: "模糊",
  good: "记得",
  easy: "很熟",
}

const REVIEW_SESSION_RATING_LABELS: Record<WordLearningReviewRating, string> = {
  again: "再来",
  hard: "模糊",
  good: "记得",
  easy: "很熟",
}

type WordLearningPageTab = "settings" | "records"

const PAGE_TAB_LABELS: Record<WordLearningPageTab, string> = {
  settings: "学习设置",
  records: "单词学习",
}

function getWordLearningTabFromSearch(search: string): WordLearningPageTab | null {
  const tab = new URLSearchParams(search).get("tab")
  return tab === "settings" || tab === "records" ? tab : null
}

interface WordLearningReviewSessionStats {
  reviewedCount: number
  knownCount: number
  hiddenCount: number
  ratings: Record<WordLearningReviewRating, number>
}

interface ManualSaveFeedback {
  variant: "success" | "warning" | "error"
  text: string
}

function createReviewSessionStats(): WordLearningReviewSessionStats {
  return {
    reviewedCount: 0,
    knownCount: 0,
    hiddenCount: 0,
    ratings: {
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
    },
  }
}

function getReviewSessionRememberedCount(stats: WordLearningReviewSessionStats): number {
  return stats.ratings.good + stats.ratings.easy + stats.knownCount
}

function getReviewSessionNeedsPracticeCount(stats: WordLearningReviewSessionStats): number {
  return stats.ratings.again + stats.ratings.hard
}

function sortWordLearningRecords(a: WordLearningRecord, b: WordLearningRecord) {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status]
    || b.lastSeenAt - a.lastSeenAt
    || b.seenCount - a.seenCount
    || a.word.localeCompare(b.word)
}

function getStatusVariant(status: WordLearningStatus): "accent" | "outline" | "secondary" {
  if (status === "known")
    return "secondary"
  if (status === "hidden")
    return "outline"
  return "accent"
}

function formatLastSeen(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(timestamp)
}

function getReviewDueAt(record: WordLearningRecord): number | null {
  if (typeof record.savedAt !== "number")
    return null

  return record.review?.dueAt ?? record.savedAt
}

function getLatestLearningContext(record: WordLearningRecord | null | undefined): WordLearningContext | null {
  const contexts = record?.contexts ?? []
  if (contexts.length === 0)
    return null

  return contexts
    .toSorted((a, b) => b.capturedAt - a.capturedAt)[0] ?? null
}

function formatContextCloze(context: WordLearningContext, word: string): string {
  const normalizedText = normalizeEscapedNewlines(context.text)
  const token = tokenizeLearningWords(normalizedText)
    .find(item => item.normalized === word)

  if (!token)
    return normalizedText

  return `${normalizedText.slice(0, token.start)}____${normalizedText.slice(token.end)}`
}

function formatReviewDue(record: WordLearningRecord, now: number): string {
  const dueAt = getReviewDueAt(record)
  if (dueAt === null)
    return "-"

  const delta = dueAt - now
  if (delta <= 0)
    return "现在复习"

  const minutes = Math.ceil(delta / 60000)
  if (minutes < 60)
    return `${minutes} 分钟后`

  const hours = Math.ceil(minutes / 60)
  if (hours < 24)
    return `${hours} 小时后`

  const days = Math.ceil(hours / 24)
  if (days <= 14)
    return `${days} 天后`

  return formatLastSeen(dueAt)
}

function formatRetrievability(value: number | null): string {
  if (value === null)
    return "-"

  return `${Math.round(value * 100)}%`
}

function getEmptyTitle(filter: WordLearningRecordFilter): string {
  if (filter === "due")
    return "暂无待复习单词"
  if (filter === "saved")
    return "还没有收藏单词"
  return `暂无${FILTER_LABELS[filter]}单词`
}

function SourceBadges({ sources }: { sources: WordLearningRecord["sources"] }) {
  const sourceEntries = Object.entries(sources)
    .filter((entry): entry is [WordLearningSource, number] =>
      entry[0] in SOURCE_LABELS
      && typeof entry[1] === "number"
      && entry[1] > 0,
    )
    .sort(([a], [b]) => SOURCE_LABELS[a].localeCompare(SOURCE_LABELS[b]))

  if (sourceEntries.length === 0) {
    return <span className="text-muted-foreground">-</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {sourceEntries.map(([source, count]) => (
        <Badge key={source} variant="outline" size="sm">
          {SOURCE_LABELS[source]}
          {" "}
          {count}
        </Badge>
      ))}
    </div>
  )
}

function formatManualSavedWords(records: WordLearningRecord[]): string {
  const words = records.map(record => record.word)
  if (words.length <= 3)
    return words.join("、")

  return `${words.slice(0, 3).join("、")} 等`
}

function getManualSaveFeedbackClassName(feedback: ManualSaveFeedback): string {
  if (feedback.variant === "error")
    return "border-destructive/30 bg-destructive/5 text-destructive"

  if (feedback.variant === "warning")
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"

  return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false

  const tagName = target.tagName.toLowerCase()
  return tagName === "input"
    || tagName === "textarea"
    || tagName === "select"
    || target.isContentEditable
}

export function WordLearningRecords() {
  const wordLearning = useAtomValue(configFieldsAtomMap.wordLearning)
  const [records, setRecords] = useState<WordLearningRecord[] | null>(null)
  const [busyWord, setBusyWord] = useState<string | null>(null)
  const [isManualSaving, setIsManualSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<WordLearningRecordFilter>("due")
  const [revealedWord, setRevealedWord] = useState<string | null>(null)
  const [dismissedReviewWord, setDismissedReviewWord] = useState<string | null>(null)
  const [recallDrafts, setRecallDrafts] = useState<Record<string, string>>({})
  const [manualEntry, setManualEntry] = useState("")
  const [manualSaveFeedback, setManualSaveFeedback] = useState<ManualSaveFeedback | null>(null)
  const [sessionStats, setSessionStats] = useState(createReviewSessionStats)
  const [now, setNow] = useState(() => Date.now())

  const refreshRecords = useCallback(async () => {
    try {
      const nextRecords = Object.values(await getWordLearningRecords())
        .sort(sortWordLearningRecords)

      setRecords(nextRecords)
      setNow(Date.now())
      setLoadError(null)
    }
    catch (error) {
      setLoadError(error instanceof Error ? error.message : "加载单词记录失败。")
    }
  }, [])

  useEffect(() => {
    void refreshRecords()
  }, [refreshRecords])

  const counts = useMemo(() => {
    const values = records ?? []
    return {
      total: values.length,
      due: values.filter(record => isLearningWordDue(record, now)).length,
      saved: values.filter(record => typeof record.savedAt === "number").length,
      learning: values.filter(record => record.status === "learning").length,
      known: values.filter(record => record.status === "known").length,
      hidden: values.filter(record => record.status === "hidden").length,
    }
  }, [now, records])

  const handleRecordAction = useCallback(async (
    word: string,
    action: (word: string) => Promise<WordLearningRecord>,
  ) => {
    setBusyWord(word)
    try {
      await action(word)
      await refreshRecords()
    }
    finally {
      setBusyWord(null)
    }
  }, [refreshRecords])

  const dueRecords = useMemo(() => {
    const values = records ?? []
    return values
      .filter(record => isLearningWordDue(record, now))
      .sort((a, b) =>
        (estimateLearningWordRetrievability(a, now) ?? 1) - (estimateLearningWordRetrievability(b, now) ?? 1)
        || (getReviewDueAt(a) ?? 0) - (getReviewDueAt(b) ?? 0)
        || a.word.localeCompare(b.word),
      )
  }, [now, records])

  const activeReviewRecord = dueRecords[0]
  const activeReviewWord = activeReviewRecord?.word ?? null
  const isReviewModalOpen = activeReviewWord !== null && dismissedReviewWord !== activeReviewWord
  const activeReviewEntry = activeReviewRecord ? lookupLearningWord(activeReviewRecord.word) : null
  const activeReviewTranslation = activeReviewEntry?.translation ?? activeReviewRecord?.translation ?? "暂无本地释义"
  const activeReviewRetrievability = activeReviewRecord
    ? estimateLearningWordRetrievability(activeReviewRecord, now)
    : null
  const isAnswerVisible = activeReviewRecord?.word === revealedWord
  const activeReviewContext = getLatestLearningContext(activeReviewRecord)
  const activeReviewContextCloze = activeReviewContext
    ? formatContextCloze(activeReviewContext, activeReviewRecord.word)
    : null
  const activeRecallText = activeReviewRecord
    ? recallDrafts[activeReviewRecord.word] ?? ""
    : ""
  const sessionRemainingCount = dueRecords.length
  const sessionTotalCount = sessionStats.reviewedCount + sessionRemainingCount
  const sessionProgressPercent = sessionTotalCount > 0
    ? Math.round((sessionStats.reviewedCount / sessionTotalCount) * 100)
    : 0
  const hasReviewSession = sessionStats.reviewedCount > 0 || sessionRemainingCount > 0
  const sessionRememberedCount = getReviewSessionRememberedCount(sessionStats)
  const sessionNeedsPracticeCount = getReviewSessionNeedsPracticeCount(sessionStats)
  const nextReviewRecord = useMemo(() => {
    const values = records ?? []
    return values
      .filter((record) => {
        const dueAt = getReviewDueAt(record)
        return record.status === "learning"
          && dueAt !== null
          && dueAt > now
      })
      .sort((a, b) => (getReviewDueAt(a) ?? 0) - (getReviewDueAt(b) ?? 0))
      .at(0) ?? null
  }, [now, records])

  const handleReviewModalOpenChange = useCallback((open: boolean) => {
    if (open) {
      setDismissedReviewWord(null)
      return
    }

    if (activeReviewWord) {
      setDismissedReviewWord(activeReviewWord)
    }
  }, [activeReviewWord])

  const handleReviewRating = useCallback(async (word: string, rating: WordLearningReviewRating) => {
    setBusyWord(word)
    try {
      await reviewLearningWord(word, rating)
      setSessionStats(current => ({
        ...current,
        reviewedCount: current.reviewedCount + 1,
        ratings: {
          ...current.ratings,
          [rating]: current.ratings[rating] + 1,
        },
      }))
      await refreshRecords()
    }
    finally {
      setBusyWord(null)
    }
  }, [refreshRecords])

  const handleSessionWordAction = useCallback(async (
    word: string,
    action: (word: string) => Promise<WordLearningRecord>,
    sessionKey: "knownCount" | "hiddenCount",
  ) => {
    setBusyWord(word)
    try {
      await action(word)
      setSessionStats(current => ({
        ...current,
        reviewedCount: current.reviewedCount + 1,
        [sessionKey]: current[sessionKey] + 1,
      }))
      await refreshRecords()
    }
    finally {
      setBusyWord(null)
    }
  }, [refreshRecords])

  const handleManualSave = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const text = manualEntry.trim()
    if (!text) {
      setManualSaveFeedback({
        variant: "warning",
        text: "请输入一个单词或一句英文。",
      })
      return
    }

    setIsManualSaving(true)
    try {
      const savedRecords = await saveLearningTextWords(text, "manual", {
        minimumLevel: wordLearning.minimumLevel,
      })
      await refreshRecords()

      if (savedRecords.length === 0) {
        setManualSaveFeedback({
          variant: "warning",
          text: `没有找到${LEVEL_LABELS[wordLearning.minimumLevel]}的可收藏单词。`,
        })
        return
      }

      setManualEntry("")
      setFilter("due")
      setManualSaveFeedback({
        variant: "success",
        text: `已加入 ${savedRecords.length} 个单词：${formatManualSavedWords(savedRecords)}`,
      })
    }
    catch (error) {
      setManualSaveFeedback({
        variant: "error",
        text: error instanceof Error ? error.message : "添加到复习失败。",
      })
    }
    finally {
      setIsManualSaving(false)
    }
  }, [manualEntry, refreshRecords, wordLearning.minimumLevel])

  const revealAnswer = useCallback(() => {
    if (activeReviewRecord) {
      setRevealedWord(activeReviewRecord.word)
    }
  }, [activeReviewRecord])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!activeReviewRecord || !isReviewModalOpen || busyWord || isEditableKeyboardTarget(event.target))
        return

      if (event.metaKey || event.ctrlKey || event.altKey)
        return

      const key = event.key.toLowerCase()

      if (key === " " || key === "enter") {
        event.preventDefault()
        revealAnswer()
        return
      }

      if (key === "k") {
        event.preventDefault()
        void handleSessionWordAction(activeReviewRecord.word, markLearningWordKnown, "knownCount")
        return
      }

      if (key === "h") {
        event.preventDefault()
        void handleSessionWordAction(activeReviewRecord.word, markLearningWordHidden, "hiddenCount")
        return
      }

      if (!isAnswerVisible)
        return

      const rating = key === "1"
        ? "again"
        : key === "2"
          ? "hard"
          : key === "3"
            ? "good"
            : key === "4"
              ? "easy"
              : null

      if (rating) {
        event.preventDefault()
        void handleReviewRating(activeReviewRecord.word, rating)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeReviewRecord, busyWord, handleReviewRating, handleSessionWordAction, isAnswerVisible, isReviewModalOpen, revealAnswer])

  const visibleRecords = useMemo(() => {
    const values = records ?? []
    return values
      .filter((record) => {
        if (filter === "due")
          return isLearningWordDue(record, now)
        if (filter === "saved")
          return typeof record.savedAt === "number"
        return record.status === filter
      })
      .filter(record => !(filter === "due" && record.word === activeReviewRecord?.word))
      .slice(0, 50)
  }, [activeReviewRecord?.word, filter, now, records])

  return (
    <ConfigCard
      id="word-learning-records"
      title="单词学习"
      description="管理从网页、划词翻译、字幕和朗读中收藏的单词，并按复习节奏巩固。"
      className="lg:flex-col"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground text-xs">总数</div>
              <div className="font-semibold">{counts.total}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground text-xs">待复习</div>
              <div className="font-semibold">{counts.due}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground text-xs">已收藏</div>
              <div className="font-semibold">{counts.saved}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground text-xs">学习中</div>
              <div className="font-semibold">{counts.learning}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground text-xs">已掌握</div>
              <div className="font-semibold">{counts.known}</div>
            </div>
            <div className="rounded-md border px-3 py-2">
              <div className="text-muted-foreground text-xs">已隐藏</div>
              <div className="font-semibold">{counts.hidden}</div>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <form
          className="rounded-md border bg-muted/20 p-3"
          onSubmit={handleManualSave}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <label htmlFor="word-learning-manual-entry" className="sr-only">
                手动添加单词或句子
              </label>
              <Input
                id="word-learning-manual-entry"
                value={manualEntry}
                placeholder="输入单词或粘贴一句英文"
                aria-label="手动添加单词或句子"
                onChange={(event) => {
                  setManualEntry(event.currentTarget.value)
                  setManualSaveFeedback(null)
                }}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={isManualSaving || !manualEntry.trim()}
            >
              <IconPlus className="size-3.5" />
              添加到复习
            </Button>
          </div>
          <div className="text-muted-foreground mt-2 text-xs">
            按当前默认难度筛选；单个词会直接加入复习。
          </div>
          {manualSaveFeedback && (
            <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${getManualSaveFeedbackClassName(manualSaveFeedback)}`}>
              {manualSaveFeedback.text}
            </div>
          )}
        </form>

        {records === null && !loadError
          ? (
              <div className="text-muted-foreground text-sm">正在加载单词记录...</div>
            )
          : (
              <>
                {hasReviewSession && (
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">本轮复习</div>
                        <div className="text-muted-foreground mt-1 text-xs">
                          {sessionStats.reviewedCount}
                          {" "}
                          /
                          {" "}
                          {sessionTotalCount}
                          {" "}
                          已完成
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(Object.entries(REVIEW_SESSION_RATING_LABELS) as [WordLearningReviewRating, string][]).map(([rating, label]) => (
                          <Badge key={rating} variant="outline" size="sm">
                            {label}
                            {" "}
                            {sessionStats.ratings[rating]}
                          </Badge>
                        ))}
                        {sessionStats.knownCount > 0 && (
                          <Badge variant="secondary" size="sm">
                            已掌握
                            {" "}
                            {sessionStats.knownCount}
                          </Badge>
                        )}
                        {sessionStats.hiddenCount > 0 && (
                          <Badge variant="outline" size="sm">
                            隐藏
                            {" "}
                            {sessionStats.hiddenCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="bg-muted mt-3 h-2 overflow-hidden rounded-full">
                      <div
                        className="bg-foreground h-full rounded-full transition-all"
                        style={{ width: `${sessionProgressPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {activeReviewRecord
                  ? (
                      <>
                        <div className="rounded-md border bg-muted/20 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="text-muted-foreground flex items-center gap-1 text-xs font-medium uppercase">
                                <IconBrain className="size-3.5" />
                                沉浸复习
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="text-lg font-semibold">
                                  当前单词：
                                  {activeReviewRecord.word}
                                </span>
                                <Badge variant="accent" size="sm">
                                  {formatReviewDue(activeReviewRecord, now)}
                                </Badge>
                                <Badge variant="outline" size="sm">
                                  剩余
                                  {" "}
                                  {sessionRemainingCount}
                                </Badge>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => setDismissedReviewWord(null)}
                            >
                              <IconCards className="size-3.5" />
                              继续沉浸复习
                            </Button>
                          </div>
                        </div>

                        <Dialog open={isReviewModalOpen} onOpenChange={handleReviewModalOpenChange}>
                          <DialogContent
                            showCloseButton={false}
                            overlayClassName="bg-black/80 supports-backdrop-filter:backdrop-blur-sm"
                            className="max-h-[calc(100dvh-2rem)] w-[min(920px,calc(100vw-2rem))] overflow-hidden rounded-xl border-white/10 bg-background/95 p-0 shadow-2xl sm:max-w-[920px] dark:bg-neutral-950"
                          >
                            <DialogHeader className="sr-only">
                              <DialogTitle>
                                闪卡复习：
                                {activeReviewRecord.word}
                              </DialogTitle>
                              <DialogDescription>
                                沉浸式单词复习弹窗，先回忆答案，再查看释义并选择复习结果。
                              </DialogDescription>
                            </DialogHeader>
                            <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6">
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0">
                                  <div className="text-muted-foreground flex items-center gap-1 text-xs font-medium uppercase">
                                    <IconBrain className="size-3.5" />
                                    闪卡复习
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <div className="text-3xl font-semibold tracking-normal">{activeReviewRecord.word}</div>
                                    {activeReviewEntry && (
                                      <Badge variant="outline" size="sm">
                                        {activeReviewEntry.level.toUpperCase()}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 md:justify-end">
                                  <Badge variant="accent" size="sm">
                                    <IconCalendarDue className="size-3" />
                                    {formatReviewDue(activeReviewRecord, now)}
                                  </Badge>
                                  <Badge variant="outline" size="sm">
                                    <IconBrain className="size-3" />
                                    保持率
                                    {" "}
                                    {formatRetrievability(activeReviewRetrievability)}
                                  </Badge>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="关闭沉浸复习"
                                    onClick={() => setDismissedReviewWord(activeReviewRecord.word)}
                                  >
                                    <IconX className="size-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="mt-4 min-h-36 rounded-md border bg-muted/20 p-4">
                                {isAnswerVisible
                                  ? (
                                      <div className="flex h-full flex-col gap-4">
                                        <div>
                                          <div className="text-muted-foreground mb-1 text-xs font-medium">释义</div>
                                          <div className="text-lg font-medium whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                            {normalizeEscapedNewlines(activeReviewTranslation)}
                                          </div>
                                        </div>
                                        {activeRecallText.trim() && (
                                          <div>
                                            <div className="text-muted-foreground mb-1 text-xs font-medium">你的回忆</div>
                                            <div className="rounded-md border bg-background/80 px-3 py-2 text-sm leading-6 break-words [overflow-wrap:anywhere]">
                                              {activeRecallText.trim()}
                                            </div>
                                          </div>
                                        )}
                                        {activeReviewContext && (
                                          <div>
                                            <div className="text-muted-foreground mb-1 text-xs font-medium">原句</div>
                                            <div className="rounded-md border bg-background/80 px-3 py-2 text-sm leading-6 whitespace-pre-wrap text-muted-foreground break-words [overflow-wrap:anywhere]">
                                              {normalizeEscapedNewlines(activeReviewContext.text)}
                                            </div>
                                            <div className="text-muted-foreground mt-1 text-xs">
                                              {SOURCE_LABELS[activeReviewContext.source]}
                                              {" "}
                                              语境
                                            </div>
                                          </div>
                                        )}
                                        <div>
                                          <div className="text-muted-foreground mb-1 text-xs font-medium">来源</div>
                                          <SourceBadges sources={activeReviewRecord.sources} />
                                        </div>
                                        <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                                          <span>
                                            出现
                                            {" "}
                                            {activeReviewRecord.seenCount}
                                          </span>
                                          <span>
                                            复习
                                            {" "}
                                            {activeReviewRecord.review?.reviewCount ?? 0}
                                          </span>
                                          <span>
                                            连续记得
                                            {" "}
                                            {activeReviewRecord.review?.consecutiveCorrect ?? 0}
                                          </span>
                                          <span>
                                            遗忘
                                            {" "}
                                            {activeReviewRecord.review?.lapseCount ?? 0}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  : (
                                      <div className="flex min-h-28 flex-col items-center justify-center gap-4 text-center">
                                        {activeReviewContextCloze
                                          ? (
                                              <div className="max-w-2xl">
                                                <div className="text-muted-foreground mb-2 text-xs font-medium">语境</div>
                                                <div className="text-base leading-7 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                                  {activeReviewContextCloze}
                                                </div>
                                                <div className="text-muted-foreground mt-2 text-xs">答案已隐藏</div>
                                              </div>
                                            )
                                          : (
                                              <div className="text-muted-foreground text-sm">答案已隐藏</div>
                                            )}
                                        <div className="w-full max-w-xl text-left">
                                          <label
                                            htmlFor={`word-learning-recall-${activeReviewRecord.word}`}
                                            className="text-muted-foreground mb-1 block text-xs font-medium"
                                          >
                                            你的回忆
                                          </label>
                                          <Input
                                            id={`word-learning-recall-${activeReviewRecord.word}`}
                                            value={activeRecallText}
                                            className="bg-background/80"
                                            placeholder="先写下你想到的含义或线索"
                                            aria-label={`输入 ${activeReviewRecord.word} 的回忆`}
                                            onChange={(event) => {
                                              const nextRecallText = event.currentTarget.value
                                              setRecallDrafts(current => ({
                                                ...current,
                                                [activeReviewRecord.word]: nextRecallText,
                                              }))
                                            }}
                                            onKeyDown={(event) => {
                                              if (event.key === "Enter") {
                                                event.preventDefault()
                                                revealAnswer()
                                              }
                                            }}
                                          />
                                        </div>
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={revealAnswer}
                                          aria-label={`显示 ${activeReviewRecord.word} 的答案`}
                                        >
                                          <IconEye className="size-3.5" />
                                          显示答案
                                        </Button>
                                      </div>
                                    )}
                              </div>

                              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                                {isAnswerVisible && (
                                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:mr-auto md:w-[420px]">
                                    {(Object.entries(REVIEW_RATING_LABELS) as [WordLearningReviewRating, string][]).map(([rating, label]) => (
                                      <Button
                                        key={rating}
                                        variant={rating === "good" ? "default" : "outline"}
                                        size="sm"
                                        disabled={busyWord === activeReviewRecord.word}
                                        aria-label={`将 ${activeReviewRecord.word} 复习标记为${label}`}
                                        onClick={() => void handleReviewRating(activeReviewRecord.word, rating)}
                                      >
                                        {label}
                                      </Button>
                                    ))}
                                  </div>
                                )}
                                <div className="flex flex-wrap justify-end gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={busyWord === activeReviewRecord.word}
                                    aria-label={`将 ${activeReviewRecord.word} 标记为已掌握`}
                                    onClick={() => void handleSessionWordAction(activeReviewRecord.word, markLearningWordKnown, "knownCount")}
                                  >
                                    <IconCheck className="size-3.5" />
                                    已掌握
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busyWord === activeReviewRecord.word}
                                    aria-label={`隐藏 ${activeReviewRecord.word}`}
                                    onClick={() => void handleSessionWordAction(activeReviewRecord.word, markLearningWordHidden, "hiddenCount")}
                                  >
                                    <IconEyeOff className="size-3.5" />
                                    隐藏
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </>
                    )
                  : (
                      <div className="rounded-md border bg-muted/20 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <IconCards className="size-4" />
                          {sessionStats.reviewedCount > 0 ? "本轮完成" : "今天的复习都清了"}
                        </div>
                        <div className="text-muted-foreground mt-1 text-sm">
                          {sessionStats.reviewedCount > 0
                            ? `已处理 ${sessionStats.reviewedCount} 个，记得 ${sessionRememberedCount} 个，需要回炉 ${sessionNeedsPracticeCount} 个。`
                            : counts.saved === 0
                              ? "你从网页、划词翻译、字幕或朗读里收藏的单词会出现在这里。"
                              : "已收藏单词会在下一次到期时回到这里。"}
                        </div>
                        {nextReviewRecord && (
                          <div className="text-muted-foreground mt-2 text-xs">
                            下一张：
                            {" "}
                            {nextReviewRecord.word}
                            {" "}
                            {formatReviewDue(nextReviewRecord, now)}
                          </div>
                        )}
                        {sessionStats.reviewedCount > 0 && (
                          <div className="mt-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSessionStats(createReviewSessionStats())}
                            >
                              <IconRotateClockwise className="size-3.5" />
                              开始新一轮
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(FILTER_LABELS) as WordLearningRecordFilter[]).map(item => (
                      <Button
                        key={item}
                        variant={filter === item ? "secondary" : "ghost"}
                        size="sm"
                        aria-pressed={filter === item}
                        onClick={() => setFilter(item)}
                      >
                        {FILTER_LABELS[item]}
                        <Badge variant="outline" size="sm">
                          {counts[item]}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void refreshRecords()}>
                    <IconRefresh className="size-3.5" />
                    刷新
                  </Button>
                </div>

                {visibleRecords.length === 0
                  ? filter === "due" && activeReviewRecord
                    ? null
                    : (
                        <Empty className="border">
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              {filter === "saved" ? <IconBookmark className="size-5" /> : <IconRefresh className="size-5" />}
                            </EmptyMedia>
                            <EmptyTitle>{getEmptyTitle(filter)}</EmptyTitle>
                            <EmptyDescription>
                              你阅读网页、划词翻译、看字幕或使用朗读时，符合条件的单词会进入这里。
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      )
                  : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>单词</TableHead>
                            <TableHead>释义</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>复习</TableHead>
                            <TableHead>出现次数</TableHead>
                            <TableHead>来源</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleRecords.map((record) => {
                            const entry = lookupLearningWord(record.word)
                            const isBusy = busyWord === record.word
                            const isSaved = typeof record.savedAt === "number"
                            const isDue = isLearningWordDue(record, now)

                            return (
                              <TableRow key={record.word}>
                                <TableCell className="whitespace-normal">
                                  <div className="font-medium">{record.word}</div>
                                  {entry && (
                                    <div className="text-muted-foreground text-xs uppercase">{entry.level}</div>
                                  )}
                                </TableCell>
                                <TableCell className="max-w-80 whitespace-pre-wrap text-muted-foreground break-words [overflow-wrap:anywhere]">
                                  {filter === "due" ? "-" : normalizeEscapedNewlines(entry?.translation ?? record.translation ?? "暂无本地释义")}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={getStatusVariant(record.status)}>
                                    {STATUS_LABELS[record.status]}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {isSaved
                                    ? (
                                        <div className="flex flex-col gap-1">
                                          <Badge variant={isDue ? "accent" : "outline"} size="sm">
                                            <IconBookmark className="size-3" />
                                            {isDue ? "待复习" : "已收藏"}
                                          </Badge>
                                          <span className="text-muted-foreground text-xs">
                                            {formatReviewDue(record, now)}
                                          </span>
                                        </div>
                                      )
                                    : <span className="text-muted-foreground">-</span>}
                                </TableCell>
                                <TableCell>{record.seenCount}</TableCell>
                                <TableCell className="whitespace-normal">
                                  <SourceBadges sources={record.sources} />
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap justify-end gap-1">
                                    {isSaved
                                      ? (
                                          <Button
                                            variant="ghost"
                                            size="xs"
                                            disabled={isBusy}
                                            aria-label={`取消收藏 ${record.word}`}
                                            onClick={() => void handleRecordAction(record.word, unsaveLearningWord)}
                                          >
                                            <IconBookmarkOff className="size-3" />
                                            取消收藏
                                          </Button>
                                        )
                                      : (
                                          <Button
                                            variant="outline"
                                            size="xs"
                                            disabled={isBusy}
                                            aria-label={`收藏 ${record.word}`}
                                            onClick={() => void handleRecordAction(record.word, saveLearningWord)}
                                          >
                                            <IconBookmarkPlus className="size-3" />
                                            收藏
                                          </Button>
                                        )}
                                    {record.status !== "known" && (
                                      <Button
                                        variant="outline"
                                        size="xs"
                                        disabled={isBusy}
                                        aria-label={`将 ${record.word} 标记为已掌握`}
                                        onClick={() => void handleRecordAction(record.word, markLearningWordKnown)}
                                      >
                                        <IconCheck className="size-3" />
                                        已掌握
                                      </Button>
                                    )}
                                    {record.status !== "learning" && (
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        disabled={isBusy}
                                        aria-label={`让 ${record.word} 回到学习中`}
                                        onClick={() => void handleRecordAction(record.word, markLearningWordLearning)}
                                      >
                                        <IconRotateClockwise className="size-3" />
                                        继续学习
                                      </Button>
                                    )}
                                    {record.status !== "hidden" && (
                                      <Button
                                        variant="ghost"
                                        size="xs"
                                        disabled={isBusy}
                                        aria-label={`隐藏 ${record.word}`}
                                        onClick={() => void handleRecordAction(record.word, markLearningWordHidden)}
                                      >
                                        <IconEyeOff className="size-3" />
                                        隐藏
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    )}
              </>
            )}
      </div>
    </ConfigCard>
  )
}

function WordLearningSettings() {
  const [wordLearning, setWordLearning] = useAtom(configFieldsAtomMap.wordLearning)
  return (
    <div className="*:border-b [&>*:last-child]:border-b-0">
      <ConfigCard
        id="word-learning-enabled"
        title="学习模式"
        description="在网页翻译、划词翻译、字幕和朗读场景里叠加单词学习提示。"
      >
        <div className="w-full flex justify-end">
          <Switch
            checked={wordLearning.enabled}
            onCheckedChange={checked => setWordLearning({ ...wordLearning, enabled: checked })}
          />
        </div>
      </ConfigCard>

      <ConfigCard
        id="word-learning-auto-annotate"
        title="网页标注"
        description="在不改变整页翻译的前提下，自动标注符合难度的英文单词。"
      >
        <div className="w-full flex justify-end">
          <Switch
            checked={wordLearning.autoAnnotate}
            onCheckedChange={checked => setWordLearning({ ...wordLearning, autoAnnotate: checked })}
          />
        </div>
      </ConfigCard>

      <ConfigCard
        id="word-learning-minimum-level"
        title="默认提示难度"
        description="只默认提示这个难度及以上的单词。"
      >
        <div className="w-full flex justify-start md:justify-end">
          <Select
            value={wordLearning.minimumLevel}
            onValueChange={(level: WordLearningLevel | null) => {
              if (level)
                void setWordLearning({ ...wordLearning, minimumLevel: level })
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue render={<span />}>
                {LEVEL_LABELS[wordLearning.minimumLevel]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {WORD_LEARNING_LEVELS.map(level => (
                  <SelectItem key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </ConfigCard>

      <ConfigCard
        id="word-learning-display-mode"
        title="网页显示方式"
        description="选择阅读流里直接出现多少辅助信息。"
      >
        <div className="w-full flex justify-start md:justify-end">
          <Select
            value={wordLearning.displayMode}
            onValueChange={(displayMode: WordLearningDisplayMode | null) => {
              if (displayMode)
                void setWordLearning({ ...wordLearning, displayMode })
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue render={<span />}>
                {DISPLAY_LABELS[wordLearning.displayMode]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(DISPLAY_LABELS).map(([mode, label]) => (
                  <SelectItem key={mode} value={mode}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </ConfigCard>

      <ConfigCard
        id="word-learning-hide-known"
        title="隐藏已掌握单词"
        description="标记为已掌握后，不再默认提示该单词。"
      >
        <div className="w-full flex justify-end">
          <Switch
            checked={wordLearning.hideKnownWords}
            onCheckedChange={checked => setWordLearning({ ...wordLearning, hideKnownWords: checked })}
          />
        </div>
      </ConfigCard>

    </div>
  )
}

export function WordLearningPage() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const searchTab = getWordLearningTabFromSearch(search)
  const activeTab = searchTab ?? "settings"

  const handleTabChange = useCallback((tab: WordLearningPageTab) => {
    void navigate({
      search: tab === "settings" ? "" : `?tab=${tab}`,
    }, { replace: true })
  }, [navigate])

  return (
    <PageLayout title="乔木单词学习">
      <div className="border-b py-4">
        <div
          role="tablist"
          aria-label="乔木单词学习页面"
          className="inline-flex rounded-md border bg-muted/30 p-1"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "settings"}
            variant={activeTab === "settings" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleTabChange("settings")}
          >
            <IconSettings className="size-3.5" />
            {PAGE_TAB_LABELS.settings}
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={activeTab === "records"}
            variant={activeTab === "records" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleTabChange("records")}
          >
            <IconCards className="size-3.5" />
            {PAGE_TAB_LABELS.records}
          </Button>
        </div>
      </div>

      {activeTab === "settings" ? <WordLearningSettings /> : <WordLearningRecords />}
    </PageLayout>
  )
}
