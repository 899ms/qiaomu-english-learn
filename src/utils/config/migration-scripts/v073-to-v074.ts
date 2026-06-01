/**
 * Migration script from v073 to v074
 * - Adds the additive wordLearning config used by qiaomu-english-learn.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots - never import constants or helpers that may change.
 */

const defaultWordLearning = {
  enabled: true,
  autoAnnotate: true,
  minimumLevel: "cet4",
  displayMode: "inlineGloss",
  hideKnownWords: true,
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function migrate(oldConfig: any): any {
  return {
    ...oldConfig,
    wordLearning: isRecord(oldConfig?.wordLearning)
      ? {
          ...defaultWordLearning,
          ...oldConfig.wordLearning,
        }
      : defaultWordLearning,
  }
}
