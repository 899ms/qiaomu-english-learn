// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { describe, expect, it, vi } from "vitest"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { SelectionToolbarCustomActionButtons } from ".."

vi.mock("../custom-action-trigger", () => ({
  SelectionToolbarCustomActionTrigger: ({ action }: { action: { name: string } }) => (
    <button type="button">{action.name}</button>
  ),
}))

describe("selectionToolbarCustomActionButtons", () => {
  it("hides the built-in dictionary action from the floating toolbar", () => {
    const store = createStore()
    store.set(configAtom, {
      ...DEFAULT_CONFIG,
      selectionToolbar: {
        ...DEFAULT_CONFIG.selectionToolbar,
        customActions: [
          {
            ...DEFAULT_CONFIG.selectionToolbar.customActions[0]!,
            id: "default-dictionary",
            name: "Dictionary",
          },
          {
            ...DEFAULT_CONFIG.selectionToolbar.customActions[0]!,
            id: "custom-action",
            name: "Custom action",
          },
        ],
      },
    })

    render(
      <Provider store={store}>
        <SelectionToolbarCustomActionButtons />
      </Provider>,
    )

    expect(screen.queryByRole("button", { name: "Dictionary" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Custom action" })).toBeInTheDocument()
  })
})
