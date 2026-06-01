import type { TestSeriesObject } from "./types"
import { testSeries as v073TestSeries } from "./v073"

const defaultWordLearning = {
  enabled: true,
  autoAnnotate: true,
  minimumLevel: "cet4",
  displayMode: "inlineGloss",
  hideKnownWords: true,
}

export const testSeries: TestSeriesObject = Object.fromEntries(
  Object.entries(v073TestSeries).map(([seriesId, seriesData]) => [
    seriesId,
    {
      ...seriesData,
      config: {
        ...seriesData.config,
        wordLearning: defaultWordLearning,
      },
    },
  ]),
)
