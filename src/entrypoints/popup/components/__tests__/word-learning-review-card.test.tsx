// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { WordLearningReviewCard } from "../word-learning-review-card"

const mocks = vi.hoisted(() => ({
  getWordLearningReviewSummary: vi.fn(),
  openOptionsPage: vi.fn(),
}))

vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}))

vi.mock("@/utils/navigation", () => ({
  openOptionsPage: mocks.openOptionsPage,
}))

vi.mock("@/utils/word-learning/review-summary", () => ({
  getWordLearningReviewSummary: mocks.getWordLearningReviewSummary,
}))

describe("wordLearningReviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getWordLearningReviewSummary.mockResolvedValue({
      savedCount: 4,
      dueCount: 3,
      learningCount: 4,
      knownCount: 0,
      hiddenCount: 0,
      nextDueAt: null,
      dueWords: ["abstract", "perception", "criteria"],
    })
  })

  it("shows due review work and opens the flashcard queue", async () => {
    render(<WordLearningReviewCard />)

    expect(await screen.findByText("3 个到期")).toBeInTheDocument()
    expect(screen.getByText("先复习 abstract、perception 等")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "开始复习" }))

    await waitFor(() => {
      expect(mocks.openOptionsPage).toHaveBeenCalledWith("/word-learning?tab=records")
    })
  })

  it("shows the next review time when nothing is due", async () => {
    mocks.getWordLearningReviewSummary.mockResolvedValue({
      savedCount: 2,
      dueCount: 0,
      learningCount: 2,
      knownCount: 0,
      hiddenCount: 0,
      nextDueAt: Date.now() + 2 * 60 * 60 * 1000,
      dueWords: [],
    })

    render(<WordLearningReviewCard />)

    expect(await screen.findByText("今天清空")).toBeInTheDocument()
    expect(screen.getByText("下一张 2 小时后 到期")).toBeInTheDocument()
  })
})
