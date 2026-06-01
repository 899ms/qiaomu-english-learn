import { z } from "zod"

export const WORD_LEARNING_LEVELS = [
  "cet4",
  "cet6",
  "postgraduate",
  "ielts",
  "toefl",
  "gre",
] as const

export const wordLearningLevelSchema = z.enum(WORD_LEARNING_LEVELS)

export const wordLearningDisplayModeSchema = z.enum([
  "inlineGloss",
  "underline",
])

export const wordLearningConfigSchema = z.object({
  enabled: z.boolean(),
  autoAnnotate: z.boolean(),
  minimumLevel: wordLearningLevelSchema,
  displayMode: wordLearningDisplayModeSchema,
  hideKnownWords: z.boolean(),
})

export type WordLearningLevel = z.infer<typeof wordLearningLevelSchema>
export type WordLearningDisplayMode = z.infer<typeof wordLearningDisplayModeSchema>
export type WordLearningConfig = z.infer<typeof wordLearningConfigSchema>
