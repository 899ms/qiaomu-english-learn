import type { WordLearningLevel } from "@/types/config/word-learning"
import { normalizeEscapedNewlines, normalizeEscapedNewlinesForInlineText } from "@/utils/text"
import { GENERATED_WORD_LEARNING_LEXICON_ROWS } from "./generated-lexicon"

export interface WordLearningLexiconEntry {
  word: string
  level: WordLearningLevel
  translation: string
  shortTranslation: string
  phonetic?: string
}

// Curated overrides for the generated CET/ECDICT lexicon. Keep this list small:
// it is for product-critical wording and examples where a shorter gloss reads better.
const WORD_LEARNING_SEED_LEXICON: WordLearningLexiconEntry[] = [
  { word: "abandon", level: "cet4", translation: "放弃；抛弃", shortTranslation: "放弃", phonetic: "/əˈbændən/" },
  { word: "abnormal", level: "cet4", translation: "反常的；异常的", shortTranslation: "异常", phonetic: "/æbˈnɔːrml/" },
  { word: "absorb", level: "cet4", translation: "吸收；理解；使专注", shortTranslation: "吸收", phonetic: "/əbˈzɔːrb/" },
  { word: "abstract", level: "cet4", translation: "抽象的；摘要", shortTranslation: "抽象", phonetic: "/ˈæbstrækt/" },
  { word: "accelerate", level: "cet4", translation: "加速；促进", shortTranslation: "加速", phonetic: "/əkˈseləreɪt/" },
  { word: "access", level: "cet4", translation: "入口；使用权；访问", shortTranslation: "访问", phonetic: "/ˈækses/" },
  { word: "accommodate", level: "cet4", translation: "容纳；为...提供住宿；适应", shortTranslation: "容纳", phonetic: "/əˈkɑːmədeɪt/" },
  { word: "accomplish", level: "cet4", translation: "完成；实现", shortTranslation: "完成", phonetic: "/əˈkɑːmplɪʃ/" },
  { word: "accumulate", level: "cet4", translation: "积累；堆积", shortTranslation: "积累", phonetic: "/əˈkjuːmjəleɪt/" },
  { word: "accurate", level: "cet4", translation: "准确的；精确的", shortTranslation: "准确", phonetic: "/ˈækjərət/" },
  { word: "acknowledge", level: "cet4", translation: "承认；确认；致谢", shortTranslation: "承认", phonetic: "/əkˈnɑːlɪdʒ/" },
  { word: "acquire", level: "cet4", translation: "获得；习得", shortTranslation: "获得", phonetic: "/əˈkwaɪər/" },
  { word: "adapt", level: "cet4", translation: "适应；改编", shortTranslation: "适应", phonetic: "/əˈdæpt/" },
  { word: "adequate", level: "cet4", translation: "足够的；合格的", shortTranslation: "足够", phonetic: "/ˈædɪkwət/" },
  { word: "adjacent", level: "cet4", translation: "邻近的；毗连的", shortTranslation: "邻近", phonetic: "/əˈdʒeɪsnt/" },
  { word: "advocate", level: "cet4", translation: "提倡；拥护者", shortTranslation: "提倡", phonetic: "/ˈædvəkeɪt/" },
  { word: "aesthetic", level: "cet6", translation: "审美的；美学的", shortTranslation: "审美", phonetic: "/esˈθetɪk/" },
  { word: "ambiguous", level: "cet6", translation: "模棱两可的；含糊的", shortTranslation: "含糊", phonetic: "/æmˈbɪɡjuəs/" },
  { word: "analogy", level: "cet6", translation: "类比；相似", shortTranslation: "类比", phonetic: "/əˈnælədʒi/" },
  { word: "anticipate", level: "cet4", translation: "预期；预料；期待", shortTranslation: "预期", phonetic: "/ænˈtɪsɪpeɪt/" },
  { word: "arbitrary", level: "cet6", translation: "任意的；武断的", shortTranslation: "武断", phonetic: "/ˈɑːrbɪtreri/" },
  { word: "articulate", level: "cet6", translation: "清楚表达；发音清晰的", shortTranslation: "表达清楚", phonetic: "/ɑːrˈtɪkjuleɪt/" },
  { word: "assert", level: "cet4", translation: "断言；维护", shortTranslation: "断言", phonetic: "/əˈsɜːrt/" },
  { word: "attribute", level: "cet4", translation: "把...归因于；属性", shortTranslation: "归因", phonetic: "/əˈtrɪbjuːt/" },
  { word: "autonomous", level: "cet6", translation: "自治的；自主的", shortTranslation: "自主", phonetic: "/ɔːˈtɑːnəməs/" },
  { word: "coherent", level: "cet6", translation: "连贯的；一致的", shortTranslation: "连贯", phonetic: "/koʊˈhɪrənt/" },
  { word: "collaborate", level: "cet6", translation: "协作；合作", shortTranslation: "协作", phonetic: "/kəˈlæbəreɪt/" },
  { word: "comprehensive", level: "cet4", translation: "综合的；全面的", shortTranslation: "全面", phonetic: "/ˌkɑːmprɪˈhensɪv/" },
  { word: "constrain", level: "cet6", translation: "限制；约束", shortTranslation: "约束", phonetic: "/kənˈstreɪn/" },
  { word: "contradict", level: "cet6", translation: "反驳；与...矛盾", shortTranslation: "矛盾", phonetic: "/ˌkɑːntrəˈdɪkt/" },
  { word: "controversial", level: "cet4", translation: "有争议的", shortTranslation: "有争议", phonetic: "/ˌkɑːntrəˈvɜːrʃl/" },
  { word: "conventional", level: "cet4", translation: "传统的；常规的", shortTranslation: "常规", phonetic: "/kənˈvenʃənl/" },
  { word: "criteria", level: "cet6", translation: "标准；准则", shortTranslation: "标准", phonetic: "/kraɪˈtɪriə/" },
  { word: "derive", level: "cet4", translation: "获得；源于", shortTranslation: "源于", phonetic: "/dɪˈraɪv/" },
  { word: "deteriorate", level: "cet6", translation: "恶化；变坏", shortTranslation: "恶化", phonetic: "/dɪˈtɪriəreɪt/" },
  { word: "dimension", level: "cet4", translation: "维度；方面；尺寸", shortTranslation: "维度", phonetic: "/daɪˈmenʃn/" },
  { word: "discrepancy", level: "cet6", translation: "差异；不一致", shortTranslation: "差异", phonetic: "/dɪsˈkrepənsi/" },
  { word: "elaborate", level: "cet6", translation: "详尽说明；精心制作的", shortTranslation: "详述", phonetic: "/ɪˈlæbəreɪt/" },
  { word: "empirical", level: "postgraduate", translation: "经验主义的；实证的", shortTranslation: "实证", phonetic: "/ɪmˈpɪrɪkl/" },
  { word: "epiphany", level: "toefl", translation: "顿悟；豁然开朗；突然明白", shortTranslation: "顿悟", phonetic: "/ɪˈpɪfəni/" },
  { word: "hypothesis", level: "postgraduate", translation: "假设；假说", shortTranslation: "假设", phonetic: "/haɪˈpɑːθəsɪs/" },
  { word: "inevitable", level: "cet4", translation: "不可避免的", shortTranslation: "不可避免", phonetic: "/ɪnˈevɪtəbl/" },
  { word: "infrastructure", level: "cet6", translation: "基础设施", shortTranslation: "基础设施", phonetic: "/ˈɪnfrəstrʌktʃər/" },
  { word: "integrate", level: "cet4", translation: "整合；融入", shortTranslation: "整合", phonetic: "/ˈɪntɪɡreɪt/" },
  { word: "metaphor", level: "cet6", translation: "隐喻；比喻", shortTranslation: "隐喻", phonetic: "/ˈmetəfɔːr/" },
  { word: "notion", level: "cet4", translation: "概念；看法", shortTranslation: "概念", phonetic: "/ˈnoʊʃn/" },
  { word: "paradox", level: "cet6", translation: "悖论；自相矛盾的人或事", shortTranslation: "悖论", phonetic: "/ˈpærədɑːks/" },
  { word: "phenomenon", level: "cet4", translation: "现象", shortTranslation: "现象", phonetic: "/fəˈnɑːmɪnən/" },
  { word: "preliminary", level: "cet6", translation: "初步的；预备的", shortTranslation: "初步", phonetic: "/prɪˈlɪmɪneri/" },
  { word: "profound", level: "cet4", translation: "深刻的；深远的", shortTranslation: "深刻", phonetic: "/prəˈfaʊnd/" },
  { word: "resilient", level: "ielts", translation: "有韧性的；能恢复的", shortTranslation: "有韧性", phonetic: "/rɪˈzɪliənt/" },
  { word: "substantial", level: "cet4", translation: "大量的；实质性的", shortTranslation: "大量", phonetic: "/səbˈstænʃl/" },
  { word: "sustain", level: "cet4", translation: "维持；承受", shortTranslation: "维持", phonetic: "/səˈsteɪn/" },
]

const GENERATED_WORD_LEARNING_LEXICON: WordLearningLexiconEntry[] = GENERATED_WORD_LEARNING_LEXICON_ROWS.map(([
  word,
  level,
  translation,
  shortTranslation,
  phonetic,
]) => ({
  word,
  level,
  translation: normalizeEscapedNewlines(translation),
  shortTranslation: normalizeEscapedNewlinesForInlineText(shortTranslation),
  ...(phonetic ? { phonetic } : {}),
}))

export const WORD_LEARNING_LEXICON: WordLearningLexiconEntry[] = [
  ...new Map(
    [...GENERATED_WORD_LEARNING_LEXICON, ...WORD_LEARNING_SEED_LEXICON]
      .map(entry => [entry.word, entry] as const),
  ).values(),
]

export const WORD_LEARNING_LEXICON_BY_WORD = new Map(
  WORD_LEARNING_LEXICON.map(entry => [entry.word, entry]),
)
