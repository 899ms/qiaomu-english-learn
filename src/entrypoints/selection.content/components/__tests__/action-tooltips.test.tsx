// @vitest-environment jsdom
import type { ReactElement } from "react"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/base-ui/tooltip"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { CopyButton } from "../copy-button"
import { SaveLearningWordsButton } from "../save-learning-words-button"
import { ContextDetailsButton, RegenerateButton } from "../selection-toolbar-footer-content"
import { SpeakButton } from "../speak-button"

const { enrichSavedLearningTextWordsMock, saveLearningTextWordsMock } = vi.hoisted(() => ({
  enrichSavedLearningTextWordsMock: vi.fn(async () => [{ word: "abstract" }]),
  saveLearningTextWordsMock: vi.fn(async () => [{ word: "abstract" }]),
}))

vi.mock("@/utils/word-learning/storage", () => ({
  enrichSavedLearningTextWords: enrichSavedLearningTextWordsMock,
  saveLearningTextWords: saveLearningTextWordsMock,
}))

vi.mock("@/hooks/use-text-to-speech", () => ({
  useTextToSpeech: () => ({
    play: vi.fn(),
    stop: vi.fn(),
    isFetching: false,
    isPlaying: false,
  }),
}))

describe("selection action tooltips", () => {
  const writeTextMock = vi.fn()

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: writeTextMock,
    },
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    document.body.innerHTML = ""
  })

  function renderWithProviders(ui: ReactElement) {
    const store = createStore()
    store.set(configAtom, DEFAULT_CONFIG)

    const wrap = (children: ReactElement) => (
      <Provider store={store}>
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </Provider>
    )
    const view = render(wrap(ui))

    return {
      ...view,
      rerenderWithProviders: (nextUi: ReactElement) => view.rerender(wrap(nextUi)),
    }
  }

  async function openTooltip(trigger: Element) {
    fireEvent.mouseEnter(trigger)
    fireEvent.focus(trigger)

    await waitFor(() => {
      expect(document.querySelector("[data-slot='tooltip-content']")).toBeTruthy()
    })

    const tooltip = document.querySelector("[data-slot='tooltip-content']")
    const positioner = tooltip?.parentElement

    if (!tooltip || !positioner) {
      throw new Error("Tooltip did not render")
    }

    return { tooltip, positioner }
  }

  async function expectTooltipClosesOnHoverLeave(trigger: Element) {
    await openTooltip(trigger)

    fireEvent.mouseLeave(trigger)
    fireEvent.blur(trigger)

    await waitFor(() => {
      expect(document.querySelector("[data-slot='tooltip-content']")).toBeNull()
    })
  }

  it("renders the copy tooltip above selection popovers", async () => {
    const { container } = renderWithProviders(<CopyButton text="Copied text" />)
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    const { tooltip, positioner } = await openTooltip(trigger!)

    expect(tooltip).toHaveTextContent("action.copy")
    expect(positioner).toHaveClass("z-50")
  })

  it("keeps the copy tooltip open after click and updates its text", async () => {
    const { container } = renderWithProviders(<CopyButton text="Copied text" />)
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    const { tooltip: initialTooltip } = await openTooltip(trigger!)
    expect(initialTooltip).toHaveTextContent("action.copy")

    fireEvent.click(trigger!)

    await waitFor(() => {
      expect(document.querySelector("[data-slot='tooltip-content']")).toHaveTextContent("action.copied")
    })

    expect(writeTextMock).toHaveBeenCalledWith("Copied text")
  })

  it("renders the speak tooltip above selection popovers", async () => {
    const { container } = renderWithProviders(<SpeakButton text="Speak text" />)
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    const { tooltip, positioner } = await openTooltip(trigger!)

    expect(tooltip).toHaveTextContent("action.speak")
    expect(positioner).toHaveClass("z-50")
  })

  it("saves selected words from the translation popover", async () => {
    const { container } = renderWithProviders(
      <SaveLearningWordsButton text="abstract criteria" minimumLevel="cet4" />,
    )
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    const { tooltip: initialTooltip } = await openTooltip(trigger!)
    expect(initialTooltip).toHaveTextContent("action.saveWords")

    fireEvent.click(trigger!)

    await waitFor(() => {
      expect(document.querySelector("[data-slot='tooltip-content']")).toHaveTextContent("action.savedWords")
    })

    expect(saveLearningTextWordsMock).toHaveBeenCalledWith("abstract criteria", "selection", {
      minimumLevel: "cet4",
    })
  })

  it("passes finished selection translations when saving a single word", async () => {
    const { container } = renderWithProviders(
      <SaveLearningWordsButton text="epiphany" translatedText="顿悟；突然明白" minimumLevel="gre" />,
    )
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    fireEvent.click(trigger!)

    await waitFor(() => {
      expect(saveLearningTextWordsMock).toHaveBeenCalledWith("epiphany", "selection", {
        minimumLevel: "gre",
        translationText: "顿悟；突然明白",
      })
    })
    expect(enrichSavedLearningTextWordsMock).not.toHaveBeenCalled()
  })

  it("backfills delayed selection translations after an early save", async () => {
    const { container, rerenderWithProviders } = renderWithProviders(
      <SaveLearningWordsButton text="epiphany" translatedText={null} minimumLevel="gre" />,
    )
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    fireEvent.click(trigger!)

    await waitFor(() => {
      expect(saveLearningTextWordsMock).toHaveBeenCalledWith("epiphany", "selection", {
        minimumLevel: "gre",
      })
    })
    await waitFor(() => {
      expect(trigger).toHaveAttribute("aria-pressed", "true")
    })

    rerenderWithProviders(
      <SaveLearningWordsButton text="epiphany" translatedText="顿悟；突然明白" minimumLevel="gre" />,
    )

    await waitFor(() => {
      expect(enrichSavedLearningTextWordsMock).toHaveBeenCalledWith("epiphany", {
        minimumLevel: "gre",
        translationText: "顿悟；突然明白",
      })
    })
  })

  it("keeps selected words visibly saved for the current popover", async () => {
    vi.useFakeTimers()
    try {
      const { container } = renderWithProviders(
        <SaveLearningWordsButton text="abstract criteria" minimumLevel="cet4" />,
      )
      const trigger = container.querySelector("[data-slot='tooltip-trigger']")

      expect(trigger).toBeTruthy()

      await act(async () => {
        fireEvent.click(trigger!)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(trigger).toHaveAttribute("aria-pressed", "true")
      expect(trigger).toHaveAttribute("title", "action.savedWords")

      act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(trigger).toHaveAttribute("aria-pressed", "true")
      expect(trigger).toHaveAttribute("title", "action.savedWords")
    }
    finally {
      vi.useRealTimers()
    }
  })

  it("renders the regenerate tooltip above selection popovers", async () => {
    const { container } = renderWithProviders(<RegenerateButton onRegenerate={vi.fn()} />)
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    const { tooltip, positioner } = await openTooltip(trigger!)

    expect(tooltip).toHaveTextContent("action.regenerate")
    expect(positioner).toHaveClass("z-50")
  })

  it("renders the context details tooltip above selection popovers", async () => {
    const { container } = renderWithProviders(
      <ContextDetailsButton titleText="Title" paragraphsText="Context" />,
    )
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    const { tooltip, positioner } = await openTooltip(trigger!)

    expect(tooltip).toHaveTextContent("action.viewContextDetails")
    expect(positioner).toHaveClass("z-50")
  })

  it("keeps the speak tooltip open after click", async () => {
    const { container } = renderWithProviders(<SpeakButton text="Speak text" />)
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    const { tooltip: initialTooltip } = await openTooltip(trigger!)
    expect(initialTooltip).toHaveTextContent("action.speak")

    fireEvent.click(trigger!)

    await waitFor(() => {
      expect(document.querySelector("[data-slot='tooltip-content']")).toHaveTextContent("action.speak")
    })
  })

  it("keeps the regenerate tooltip open after click", async () => {
    const onRegenerate = vi.fn()
    const { container } = renderWithProviders(<RegenerateButton onRegenerate={onRegenerate} />)
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    const { tooltip: initialTooltip } = await openTooltip(trigger!)
    expect(initialTooltip).toHaveTextContent("action.regenerate")

    fireEvent.click(trigger!)

    await waitFor(() => {
      expect(document.querySelector("[data-slot='tooltip-content']")).toHaveTextContent("action.regenerate")
    })

    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })

  it("keeps the context details tooltip open after click", async () => {
    const { container } = renderWithProviders(
      <ContextDetailsButton titleText="Title" paragraphsText="Context" />,
    )
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    const { tooltip: initialTooltip } = await openTooltip(trigger!)
    expect(initialTooltip).toHaveTextContent("action.viewContextDetails")

    fireEvent.click(trigger!)

    await waitFor(() => {
      expect(document.querySelector("[data-slot='tooltip-content']")).toHaveTextContent("action.viewContextDetails")
    })
  })

  it("closes the copy tooltip after hover leave", async () => {
    const { container } = renderWithProviders(<CopyButton text="Copied text" />)
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    await expectTooltipClosesOnHoverLeave(trigger!)
  })

  it("closes the speak tooltip after hover leave", async () => {
    const { container } = renderWithProviders(<SpeakButton text="Speak text" />)
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    await expectTooltipClosesOnHoverLeave(trigger!)
  })

  it("closes the regenerate tooltip after hover leave", async () => {
    const { container } = renderWithProviders(<RegenerateButton onRegenerate={vi.fn()} />)
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    await expectTooltipClosesOnHoverLeave(trigger!)
  })

  it("closes the context details tooltip after hover leave", async () => {
    const { container } = renderWithProviders(
      <ContextDetailsButton titleText="Title" paragraphsText="Context" />,
    )
    const trigger = container.querySelector("[data-slot='tooltip-trigger']")

    expect(trigger).toBeTruthy()

    await expectTooltipClosesOnHoverLeave(trigger!)
  })
})
