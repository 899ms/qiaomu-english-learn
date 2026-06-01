/**
 * @vitest-environment jsdom
 */
import type { WordLearningRecord } from "@/utils/word-learning/storage"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SidebarProvider } from "@/components/ui/base-ui/sidebar"
import { WordLearningPage, WordLearningRecords } from "../index"

const mocks = vi.hoisted(() => {
  const recordsRef = {
    current: {} as Record<string, WordLearningRecord>,
  }

  return {
    recordsRef,
    getWordLearningRecords: vi.fn(async () => recordsRef.current),
    markLearningWordHidden: vi.fn(async (word: string) => {
      recordsRef.current[word] = {
        ...recordsRef.current[word]!,
        status: "hidden",
        hiddenAt: Date.now(),
      }
      return recordsRef.current[word]!
    }),
    markLearningWordKnown: vi.fn(async (word: string) => {
      recordsRef.current[word] = {
        ...recordsRef.current[word]!,
        status: "known",
        knownAt: Date.now(),
      }
      return recordsRef.current[word]!
    }),
    markLearningWordLearning: vi.fn(async (word: string) => {
      recordsRef.current[word] = {
        ...recordsRef.current[word]!,
        status: "learning",
      }
      return recordsRef.current[word]!
    }),
    saveLearningWord: vi.fn(async (word: string) => {
      recordsRef.current[word] = {
        ...recordsRef.current[word]!,
        savedAt: Date.now(),
        review: {
          dueAt: Date.now(),
          intervalDays: 0,
          ease: 2.5,
          consecutiveCorrect: 0,
          lapseCount: 0,
          reviewCount: 0,
        },
      }
      return recordsRef.current[word]!
    }),
    unsaveLearningWord: vi.fn(async (word: string) => {
      const next = { ...recordsRef.current[word]! }
      delete next.savedAt
      delete next.review
      recordsRef.current[word] = next
      return recordsRef.current[word]!
    }),
    reviewLearningWord: vi.fn(async (word: string) => {
      recordsRef.current[word] = {
        ...recordsRef.current[word]!,
        review: {
          dueAt: Date.now() + 86400000,
          intervalDays: 1,
          ease: 2.5,
          consecutiveCorrect: 1,
          lapseCount: 0,
          reviewCount: 1,
          lastReviewedAt: Date.now(),
        },
      }
      return recordsRef.current[word]!
    }),
    saveLearningTextWords: vi.fn(async (text: string) => {
      const words = text
        .split(/[^a-z]+/i)
        .map(word => word.trim().toLowerCase())
        .filter(Boolean)
      const uniqueWords = [...new Set(words)]

      for (const word of uniqueWords) {
        recordsRef.current[word] = {
          word,
          status: "learning",
          seenCount: 1,
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now(),
          savedAt: Date.now(),
          review: {
            dueAt: Date.now(),
            intervalDays: 0,
            ease: 2.5,
            consecutiveCorrect: 0,
            lapseCount: 0,
            reviewCount: 0,
          },
          contexts: [
            {
              text,
              source: "manual",
              capturedAt: Date.now(),
            },
          ],
          sources: {
            manual: 1,
          },
        }
      }

      return uniqueWords.map(word => recordsRef.current[word]!)
    }),
    estimateLearningWordRetrievability: vi.fn(() => 0.82),
    isLearningWordDue: (record: WordLearningRecord, now = Date.now()) =>
      typeof record.savedAt === "number"
      && record.status === "learning"
      && (record.review?.dueAt ?? record.savedAt) <= now,
  }
})

vi.mock("@/utils/word-learning/storage", () => ({
  estimateLearningWordRetrievability: mocks.estimateLearningWordRetrievability,
  getWordLearningRecords: mocks.getWordLearningRecords,
  markLearningWordHidden: mocks.markLearningWordHidden,
  markLearningWordKnown: mocks.markLearningWordKnown,
  markLearningWordLearning: mocks.markLearningWordLearning,
  saveLearningTextWords: mocks.saveLearningTextWords,
  saveLearningWord: mocks.saveLearningWord,
  unsaveLearningWord: mocks.unsaveLearningWord,
  reviewLearningWord: mocks.reviewLearningWord,
  isLearningWordDue: mocks.isLearningWordDue,
}))

describe("wordLearningRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
    mocks.recordsRef.current = {
      abstract: {
        word: "abstract",
        status: "learning",
        seenCount: 2,
        firstSeenAt: 1700000000000,
        lastSeenAt: 1700000001000,
        savedAt: 1700000000000,
        review: {
          dueAt: 1700000000000,
          intervalDays: 0,
          ease: 2.5,
          consecutiveCorrect: 0,
          lapseCount: 0,
          reviewCount: 0,
        },
        contexts: [
          {
            text: "The abstract argument guided the research.",
            source: "page",
            capturedAt: 1700000001000,
          },
        ],
        sources: {
          page: 2,
        },
      },
      criteria: {
        word: "criteria",
        status: "known",
        seenCount: 1,
        firstSeenAt: 1700000000000,
        lastSeenAt: 1700000000000,
        sources: {
          selection: 1,
        },
      },
    }
  })

  it("shows collected learning records with meanings and source counters", async () => {
    render(<WordLearningRecords />)

    expect(await screen.findByRole("dialog", {
      name: "闪卡复习：abstract",
    })).toBeInTheDocument()
    expect(await screen.findByText("abstract")).toBeInTheDocument()
    expect(screen.getByText("本轮复习")).toBeInTheDocument()
    expect(screen.getByText(/0\s*\/\s*1\s*已完成/)).toBeInTheDocument()
    expect(screen.getByText("The ____ argument guided the research.")).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "输入 abstract 的回忆" })).toBeInTheDocument()
    expect(screen.getByText("答案已隐藏")).toBeInTheDocument()
    expect(screen.queryByText("抽象的；摘要")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", {
      name: "显示 abstract 的答案",
    }))

    expect(screen.getByText("抽象的；摘要")).toBeInTheDocument()
    expect(screen.getByText("原句")).toBeInTheDocument()
    expect(screen.getByText("The abstract argument guided the research.")).toBeInTheDocument()
    expect(screen.getByText("网页 2")).toBeInTheDocument()
    expect(screen.getByRole("button", {
      name: "将 abstract 复习标记为记得",
    })).toBeInTheDocument()
  })

  it("supports active recall before revealing the answer", async () => {
    render(<WordLearningRecords />)

    const recallInput = await screen.findByRole("textbox", {
      name: "输入 abstract 的回忆",
    })

    fireEvent.change(recallInput, {
      target: { value: "和研究论证有关的抽象概念" },
    })
    fireEvent.keyDown(recallInput, { key: "Enter" })

    expect(await screen.findByText("抽象的；摘要")).toBeInTheDocument()
    expect(screen.getByText("和研究论证有关的抽象概念")).toBeInTheDocument()
  })

  it("marks a learning word as known from the flashcard", async () => {
    render(<WordLearningRecords />)

    const knownButton = await screen.findByRole("button", {
      name: "将 abstract 标记为已掌握",
    })
    fireEvent.click(knownButton)

    await waitFor(() => {
      expect(mocks.markLearningWordKnown).toHaveBeenCalledWith("abstract")
    })
    expect(await screen.findByText("本轮完成")).toBeInTheDocument()
    expect(screen.getByText("已处理 1 个，记得 1 个，需要回炉 0 个。")).toBeInTheDocument()
  })

  it("schedules a due saved word from the review card", async () => {
    render(<WordLearningRecords />)

    await screen.findByText("abstract")
    fireEvent.click(screen.getByRole("button", {
      name: "显示 abstract 的答案",
    }))
    await screen.findByText("抽象的；摘要")

    const goodButton = await screen.findByRole("button", {
      name: "将 abstract 复习标记为记得",
    })
    fireEvent.click(goodButton)

    await waitFor(() => {
      expect(mocks.reviewLearningWord).toHaveBeenCalledWith("abstract", "good")
    })
    expect(await screen.findByText("本轮完成")).toBeInTheDocument()
    expect(screen.getByText("已处理 1 个，记得 1 个，需要回炉 0 个。")).toBeInTheDocument()
  })

  it("supports keyboard review shortcuts after revealing a flashcard", async () => {
    render(<WordLearningRecords />)

    await screen.findByText("abstract")

    await waitFor(() => {
      fireEvent.keyDown(window, { key: " " })
      expect(screen.getByText("抽象的；摘要")).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: "3" })

    await waitFor(() => {
      expect(mocks.reviewLearningWord).toHaveBeenCalledWith("abstract", "good")
    })
  })

  it("saves manually entered words into the review queue", async () => {
    render(<WordLearningRecords />)

    fireEvent.click(await screen.findByRole("button", {
      name: "关闭沉浸复习",
    }))

    const manualInput = await screen.findByRole("textbox", {
      name: "手动添加单词或句子",
    })

    fireEvent.change(manualInput, {
      target: { value: "Perception" },
    })
    fireEvent.click(screen.getByRole("button", {
      name: "添加到复习",
    }))

    await waitFor(() => {
      expect(mocks.saveLearningTextWords).toHaveBeenCalledWith("Perception", "manual", {
        minimumLevel: "cet4",
      })
    })
    expect(await screen.findByText("已加入 1 个单词：perception")).toBeInTheDocument()
    expect(screen.getAllByText("perception").length).toBeGreaterThan(0)
  })

  it("opens the records tab from the review entry route", async () => {
    render(
      <MemoryRouter initialEntries={["/word-learning?tab=records"]}>
        <SidebarProvider>
          <WordLearningPage />
        </SidebarProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByRole("textbox", {
      name: "手动添加单词或句子",
    })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "单词学习" })).toHaveAttribute("aria-selected", "true")
  })
})
