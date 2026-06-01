import type { WordLearningLexiconEntry } from "./lexicon"
import type { WordLearningLevel } from "@/types/config/word-learning"
import { WORD_LEARNING_LEXICON_BY_WORD } from "./lexicon"
import { normalizeLearningWord } from "./normalize"

const LEVEL_RANK: Record<WordLearningLevel, number> = {
  cet4: 1,
  cet6: 2,
  postgraduate: 3,
  ielts: 4,
  toefl: 5,
  gre: 6,
}

const LEMMA_OVERRIDES = new Map<string, string>([
  ["criteria", "criteria"],
  ["criterion", "criteria"],
  ["phenomena", "phenomenon"],
  ["hypotheses", "hypothesis"],
])

function resolveLemma(rawWord: string): string {
  const normalized = normalizeLearningWord(rawWord)
  return LEMMA_OVERRIDES.get(normalized) ?? normalized
}

export function isLearningLevelAtLeast(level: WordLearningLevel, threshold: WordLearningLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[threshold]
}

export function lookupLearningWord(rawWord: string): WordLearningLexiconEntry | null {
  const lemma = resolveLemma(rawWord)
  return WORD_LEARNING_LEXICON_BY_WORD.get(lemma) ?? null
}

export function classifyLearningWord(rawWord: string, threshold: WordLearningLevel): WordLearningLexiconEntry | null {
  const entry = lookupLearningWord(rawWord)
  if (!entry)
    return null

  return isLearningLevelAtLeast(entry.level, threshold) ? entry : null
}
