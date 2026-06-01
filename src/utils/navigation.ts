import { browser } from "#imports"

export async function openOptionsPage(route = "") {
  const normalizedRoute = route
    ? route.startsWith("/") ? route : `/${route}`
    : ""

  await browser.tabs.create({
    active: true,
    url: browser.runtime.getURL(`/options.html${normalizedRoute ? `#${normalizedRoute}` : ""}`),
  })
}
