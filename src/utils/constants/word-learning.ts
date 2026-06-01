import type { WordLearningConfig } from "@/types/config/word-learning"

export const DEFAULT_WORD_LEARNING_CONFIG: WordLearningConfig = {
  enabled: true,
  autoAnnotate: true,
  minimumLevel: "cet4",
  displayMode: "inlineGloss",
  hideKnownWords: true,
}

export const WORD_LEARNING_KNOWN_WORDS_STORAGE_KEY = "wordLearningKnownWords"
export const WORD_LEARNING_RECORDS_STORAGE_KEY = "wordLearningRecords"
