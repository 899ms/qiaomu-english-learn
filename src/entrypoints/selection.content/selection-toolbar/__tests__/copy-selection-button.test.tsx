// @vitest-environment jsdom
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { selectionSessionAtom } from "../atoms"
import { SelectionToolbarCopyButton } from "../copy-selection-button"

vi.mock("#imports", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock("../../components/selection-tooltip", () => ({
  SelectionToolbarTooltip: ({
    children,
    render,
  }: {
    children: ReactNode
    render: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>
  }) => (
    <button {...render.props} type="button">
      {children}
    </button>
  ),
  useSelectionTooltipState: () => ({
    handlePress: vi.fn(),
    onOpenChange: vi.fn(),
    open: false,
  }),
}))

describe("selectionToolbarCopyButton", () => {
  const writeTextMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    })
  })

  function renderWithSelection(ui: ReactElement) {
    const store = createStore()
    store.set(selectionSessionAtom, {
      id: 1,
      createdAt: 1700000000000,
      selectionSnapshot: {
        text: "Original selected content",
        ranges: [],
      },
      contextSnapshot: {
        text: "Original selected content",
        paragraphs: ["Original selected content"],
      },
    })

    return render(
      <Provider store={store}>
        {ui}
      </Provider>,
    )
  }

  it("copies the original selected content", () => {
    renderWithSelection(<SelectionToolbarCopyButton />)

    fireEvent.click(screen.getByRole("button", { name: "action.copy" }))

    expect(writeTextMock).toHaveBeenCalledWith("Original selected content")
  })
})
