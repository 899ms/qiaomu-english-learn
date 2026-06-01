import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import { openOptionsPage } from "../navigation"

describe("navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    browser.tabs.create = vi.fn().mockResolvedValue({})
  })

  it("opens the options page as an extension tab", async () => {
    await openOptionsPage()

    expect(browser.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: "chrome-extension://test-extension-id/options.html",
    })
  })

  it("opens an options route when provided", async () => {
    await openOptionsPage("/word-learning?tab=records")

    expect(browser.tabs.create).toHaveBeenCalledWith({
      active: true,
      url: "chrome-extension://test-extension-id/options.html#/word-learning?tab=records",
    })
  })
})
