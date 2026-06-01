import type { Config } from "@/types/config/config"
import type { WordLearningConfig, WordLearningLevel } from "@/types/config/word-learning"
import { CONTENT_WRAPPER_CLASS, NOTRANSLATE_CLASS, REACT_SHADOW_HOST_CLASS } from "@/utils/constants/dom-labels"
import { DEFAULT_WORD_LEARNING_CONFIG } from "@/utils/constants/word-learning"
import { isEditable, isHTMLElement } from "@/utils/host/dom/filter"
import { normalizeEscapedNewlines, normalizeEscapedNewlinesForInlineText } from "@/utils/text"
import { classifyLearningWord, lookupLearningWord } from "./classifier"
import { normalizeLearningWord, tokenizeLearningWords } from "./normalize"
import {
  getWordLearningRecords,
  markLearningWordHidden,
  markLearningWordKnown,
  recordLearningTextEncounter,
  saveLearningWord,
} from "./storage"

const STYLE_ID = "qiaomu-english-learn-word-learning-style"
const TOKEN_CLASS = "qel-word-learning-token"
const SOURCE_CLASS = "qel-word-learning-source"
const POPOVER_CLASS = "qel-word-learning-popover"
const MAX_TEXT_NODES_PER_SCAN = 800
const MAX_TOKENS_PER_SCAN = 240
const MAX_ENCOUNTER_TEXT_CHARS_PER_SCAN = 12000
const SCAN_DEBOUNCE_MS = 250

const SKIP_TAGS = new Set([
  "A",
  "BUTTON",
  "CANVAS",
  "CODE",
  "IFRAME",
  "INPUT",
  "KBD",
  "NOSCRIPT",
  "OPTION",
  "PRE",
  "SCRIPT",
  "SELECT",
  "STYLE",
  "SVG",
  "TEXTAREA",
])

interface AnnotatedToken {
  raw: string
  normalized: string
  entry: WordLearningAnnotationEntry
  start: number
  end: number
}

interface WordLearningAnnotationEntry {
  word: string
  translation: string
  shortTranslation: string
  level?: WordLearningLevel
  phonetic?: string
}

export class WordLearningPageAnnotator {
  private config: WordLearningConfig
  private hiddenWords = new Set<string>()
  private knownWords = new Set<string>()
  private sessionSuppressedWords = new Set<string>()
  private recordedEncounterWords = new Set<string>()
  private savedWords = new Set<string>()
  private savedWordEntries = new Map<string, WordLearningAnnotationEntry>()
  private wordStateSignature = ""
  private observer: MutationObserver | null = null
  private scanTimer: number | null = null
  private internalMutationTimer: number | null = null
  private isApplyingInternalMutation = false
  private pendingScanRoots = new Set<ParentNode>()
  private isStarted = false
  private popover: HTMLElement | null = null

  constructor(config: Config) {
    this.config = config.wordLearning ?? DEFAULT_WORD_LEARNING_CONFIG
  }

  async start(): Promise<void> {
    if (this.isStarted || !this.shouldAnnotate())
      return

    this.isStarted = true
    await this.loadWordState()
    this.injectStyles()
    document.addEventListener("click", this.handleDocumentClick, true)
    await this.scan()
    this.startObserver()
  }

  stop(): void {
    if (!this.isStarted)
      return

    this.isStarted = false
    this.observer?.disconnect()
    this.observer = null
    document.removeEventListener("click", this.handleDocumentClick, true)
    this.clearScanTimer()
    this.pendingScanRoots.clear()
    this.closePopover()
    this.removeAnnotations()
    this.clearInternalMutationTimer()
  }

  updateConfig(config: Config): void {
    this.config = config.wordLearning ?? DEFAULT_WORD_LEARNING_CONFIG

    if (!this.shouldAnnotate()) {
      this.stop()
      return
    }

    if (!this.isStarted) {
      void this.start()
      return
    }

    void this.refreshWordState({ force: true })
  }

  restartForPageChange(config?: Config): void {
    if (config) {
      this.config = config.wordLearning ?? DEFAULT_WORD_LEARNING_CONFIG
    }

    this.recordedEncounterWords = new Set()
    this.closePopover()
    void this.refreshWordState({ force: true })
  }

  async refreshWordState({ force = false }: { force?: boolean } = {}): Promise<void> {
    const wordStateChanged = await this.loadWordState()

    if (!this.isStarted || !this.shouldAnnotate())
      return

    if (!force && !wordStateChanged)
      return

    this.closePopover()
    this.removeAnnotations()
    await this.scan()
  }

  private shouldAnnotate(): boolean {
    return this.config.enabled && this.config.autoAnnotate
  }

  private async loadWordState(): Promise<boolean> {
    const records = await getWordLearningRecords()
    const hiddenWords = new Set<string>()
    const knownWords = new Set<string>()
    const savedWords = new Set<string>()
    const savedWordEntries = new Map<string, WordLearningAnnotationEntry>()

    for (const record of Object.values(records)) {
      if (record.status === "hidden") {
        hiddenWords.add(record.word)
      }
      if (record.status === "known") {
        knownWords.add(record.word)
      }

      if (typeof record.savedAt !== "number")
        continue

      savedWords.add(record.word)
      const entry = this.createSavedWordEntry(record)
      if (entry) {
        savedWordEntries.set(entry.word, entry)
      }
    }

    const signature = this.createWordStateSignature({
      hiddenWords,
      knownWords,
      savedWords,
      savedWordEntries,
    })
    const changed = signature !== this.wordStateSignature

    this.hiddenWords = hiddenWords
    this.knownWords = knownWords
    this.savedWords = savedWords
    this.savedWordEntries = savedWordEntries
    this.wordStateSignature = signature

    return changed
  }

  private createWordStateSignature({
    hiddenWords,
    knownWords,
    savedWords,
    savedWordEntries,
  }: {
    hiddenWords: Set<string>
    knownWords: Set<string>
    savedWords: Set<string>
    savedWordEntries: Map<string, WordLearningAnnotationEntry>
  }): string {
    const parts = [
      ...[...hiddenWords].sort().map(word => `h:${word}`),
      ...[...knownWords].sort().map(word => `k:${word}`),
      ...[...savedWords].sort().map(word => `w:${word}`),
      ...[...savedWordEntries.values()]
        .sort((a, b) => a.word.localeCompare(b.word))
        .map(entry => [
          "s",
          entry.word,
          entry.translation,
          entry.shortTranslation,
          entry.level ?? "",
          entry.phonetic ?? "",
        ].join(":")),
    ]

    return parts.join("|")
  }

  private createSavedWordEntry(record: {
    word: string
    level?: WordLearningLevel
    translation?: string
    shortTranslation?: string
    phonetic?: string
  }): WordLearningAnnotationEntry | null {
    const lexiconEntry = lookupLearningWord(record.word)
    const translation = normalizeEscapedNewlines(lexiconEntry?.translation ?? record.translation ?? "").trim()
    const shortTranslation = normalizeEscapedNewlinesForInlineText(
      lexiconEntry?.shortTranslation ?? record.shortTranslation ?? translation,
    )
    const level = lexiconEntry?.level ?? record.level
    const phonetic = lexiconEntry?.phonetic ?? record.phonetic

    if (!translation || !shortTranslation)
      return null

    return {
      word: lexiconEntry?.word ?? record.word,
      translation,
      shortTranslation,
      ...(level ? { level } : {}),
      ...(phonetic ? { phonetic } : {}),
    }
  }

  private startObserver(): void {
    if (this.observer || !document.body)
      return

    this.observer = new MutationObserver((mutations) => {
      if (!this.isStarted)
        return

      if (this.isApplyingInternalMutation)
        return

      const scanRoots = this.getMutationScanRoots(mutations)
      if (scanRoots.length > 0) {
        scanRoots.forEach(root => this.pendingScanRoots.add(root))
        this.scheduleScan()
      }
    })

    this.observeBodyMutations(this.observer)
  }

  private observeBodyMutations(observer: MutationObserver): void {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  }

  private getMutationScanRoots(mutations: MutationRecord[]): ParentNode[] {
    const roots = new Set<ParentNode>()

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        const root = this.getNodeScanRoot(node)
        if (root) {
          roots.add(root)
        }
      }
    }

    return this.dedupeNestedRoots([...roots])
  }

  private getNodeScanRoot(node: Node): ParentNode | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement
      if (!parent || this.shouldSkipElement(parent))
        return null

      return parent
    }

    if (isHTMLElement(node) && !this.shouldSkipElement(node))
      return node

    return null
  }

  private dedupeNestedRoots(roots: ParentNode[]): ParentNode[] {
    return roots.filter((root) => {
      if (!this.isConnectedRoot(root))
        return false

      return !roots.some(other =>
        other !== root
        && this.isConnectedRoot(other)
        && other instanceof Node
        && other.contains(root as Node),
      )
    })
  }

  private scheduleScan(): void {
    if (!this.isStarted || !this.shouldAnnotate())
      return

    this.clearScanTimer()
    this.scanTimer = window.setTimeout(() => {
      this.scanTimer = null
      void this.scanPendingRoots()
    }, SCAN_DEBOUNCE_MS)
  }

  private clearScanTimer(): void {
    if (this.scanTimer !== null) {
      window.clearTimeout(this.scanTimer)
      this.scanTimer = null
    }
  }

  private clearInternalMutationTimer(): void {
    if (this.internalMutationTimer !== null) {
      window.clearTimeout(this.internalMutationTimer)
      this.internalMutationTimer = null
    }
    this.isApplyingInternalMutation = false
  }

  private suppressObserverForInternalMutation(): void {
    this.isApplyingInternalMutation = true
    if (this.internalMutationTimer !== null) {
      window.clearTimeout(this.internalMutationTimer)
    }
    this.internalMutationTimer = window.setTimeout(() => {
      this.internalMutationTimer = null
      this.isApplyingInternalMutation = false
    }, 0)
  }

  private async scanPendingRoots(): Promise<void> {
    const roots = this.dedupeNestedRoots([...this.pendingScanRoots])
    this.pendingScanRoots.clear()

    if (roots.length === 0)
      return

    const encounterTexts: string[] = []
    let remainingTokenBudget = MAX_TOKENS_PER_SCAN

    for (const root of roots) {
      if (remainingTokenBudget <= 0)
        break

      remainingTokenBudget -= this.scanRoot(root, remainingTokenBudget, encounterTexts)
    }

    this.recordScanEncounters(encounterTexts)
  }

  private async scan(root: ParentNode = document.body): Promise<void> {
    if (!root || !this.shouldAnnotate())
      return

    const encounterTexts: string[] = []
    this.scanRoot(root, MAX_TOKENS_PER_SCAN, encounterTexts)
    this.recordScanEncounters(encounterTexts)
  }

  private scanRoot(root: ParentNode, tokenBudget: number, encounterTexts: string[]): number {
    if (!this.isConnectedRoot(root) || !this.shouldAnnotate())
      return 0

    const textNodes = this.collectTextNodes(root)
    let remainingTokenBudget = tokenBudget

    for (const textNode of textNodes) {
      if (remainingTokenBudget <= 0)
        break

      const result = this.annotateTextNode(textNode, remainingTokenBudget)
      if (!result)
        continue

      remainingTokenBudget -= result.tokenCount
      encounterTexts.push(result.text)
    }

    return tokenBudget - remainingTokenBudget
  }

  private isConnectedRoot(root: ParentNode): boolean {
    return root === document
      || root === document.body
      || (root instanceof Node && root.isConnected)
  }

  private collectTextNodes(root: ParentNode): Text[] {
    const textNodes: Text[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent || !/[a-z]{4,}/i.test(node.textContent))
          return NodeFilter.FILTER_REJECT

        const parent = node.parentElement
        if (!parent || this.shouldSkipElement(parent))
          return NodeFilter.FILTER_REJECT

        return NodeFilter.FILTER_ACCEPT
      },
    })

    while (textNodes.length < MAX_TEXT_NODES_PER_SCAN) {
      const node = walker.nextNode()
      if (!node)
        break

      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node as Text)
      }
    }

    return textNodes
  }

  private shouldSkipElement(element: HTMLElement): boolean {
    if (SKIP_TAGS.has(element.tagName) || isEditable(element))
      return true

    if (element.closest(`.${TOKEN_CLASS}, .${CONTENT_WRAPPER_CLASS}, .${REACT_SHADOW_HOST_CLASS}, .${POPOVER_CLASS}`))
      return true

    if (element.closest(`.${NOTRANSLATE_CLASS}`))
      return true

    return Boolean(element.hidden) || Boolean(element.closest("[hidden], [aria-hidden='true']"))
  }

  private annotateTextNode(textNode: Text, tokenLimit = Number.POSITIVE_INFINITY): { text: string, tokenCount: number } | null {
    const text = textNode.textContent ?? ""
    const tokens = this.getAnnotatedTokens(text, tokenLimit)
    if (tokens.length === 0)
      return null

    const fragment = document.createDocumentFragment()
    let cursor = 0

    for (const token of tokens) {
      if (token.start > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, token.start)))
      }

      fragment.appendChild(this.createTokenElement(token))
      cursor = token.end
    }

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)))
    }

    this.suppressObserverForInternalMutation()
    textNode.replaceWith(fragment)
    return { text, tokenCount: tokens.length }
  }

  private getAnnotatedTokens(text: string, tokenLimit = Number.POSITIVE_INFINITY): AnnotatedToken[] {
    const tokens: AnnotatedToken[] = []

    for (const token of tokenizeLearningWords(text)) {
      if (tokens.length >= tokenLimit)
        break

      const entry = classifyLearningWord(token.normalized, this.config.minimumLevel)
        ?? this.savedWordEntries.get(token.normalized)
      if (!entry)
        continue

      if (this.shouldSuppressWord(entry.word))
        continue

      tokens.push({
        ...token,
        entry,
      })
    }

    return tokens
  }

  private shouldSuppressWord(word: string): boolean {
    return this.sessionSuppressedWords.has(word)
      || this.hiddenWords.has(word)
      || (this.config.hideKnownWords && this.knownWords.has(word))
  }

  private createTokenElement(token: AnnotatedToken): HTMLElement {
    const wrapper = document.createElement("span")
    wrapper.className = `${NOTRANSLATE_CLASS} ${TOKEN_CLASS}`
    wrapper.dataset.qelWord = token.entry.word
    wrapper.dataset.qelTranslation = token.entry.translation
    wrapper.dataset.qelShortTranslation = token.entry.shortTranslation
    wrapper.dataset.qelDisplayMode = this.config.displayMode
    wrapper.dataset.qelSaved = String(this.savedWords.has(token.entry.word))
    if (token.entry.level) {
      wrapper.dataset.qelLevel = token.entry.level
    }
    if (token.entry.phonetic) {
      wrapper.dataset.qelPhonetic = token.entry.phonetic
    }

    const source = document.createElement("span")
    source.className = SOURCE_CLASS
    source.textContent = token.raw
    wrapper.appendChild(source)

    return wrapper
  }

  private recordScanEncounters(texts: string[]): void {
    const text = this.buildEncounterText(texts)
    if (!text)
      return

    const words = this.getNewEncounterWords(text)
    if (words.length === 0)
      return

    words.forEach(word => this.recordedEncounterWords.add(word))
    void recordLearningTextEncounter(text, "page", {
      minimumLevel: this.config.minimumLevel,
      hideKnownWords: this.config.hideKnownWords,
    }).catch((error) => {
      console.warn("Failed to record word learning context.", error)
    })
  }

  private buildEncounterText(texts: string[]): string {
    const chunks: string[] = []
    let length = 0

    for (const text of texts) {
      const normalizedText = text.trim()
      if (!normalizedText)
        continue

      const remaining = MAX_ENCOUNTER_TEXT_CHARS_PER_SCAN - length
      if (remaining <= 0)
        break

      chunks.push(normalizedText.slice(0, remaining))
      length += Math.min(normalizedText.length, remaining) + 1
    }

    return chunks.join("\n")
  }

  private getNewEncounterWords(text: string): string[] {
    const words = new Set<string>()

    for (const token of tokenizeLearningWords(text)) {
      const entry = classifyLearningWord(token.normalized, this.config.minimumLevel)
      if (!entry)
        continue

      if (this.shouldSuppressWord(entry.word) || this.recordedEncounterWords.has(entry.word))
        continue

      words.add(entry.word)
    }

    return [...words]
  }

  private handleDocumentClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) {
      this.closePopover()
      return
    }

    const token = target.closest<HTMLElement>(`.${TOKEN_CLASS}`)
    if (!token) {
      if (!target.closest(`.${POPOVER_CLASS}`)) {
        this.closePopover()
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()
    this.showPopover(token)
  }

  private showPopover(token: HTMLElement): void {
    const word = token.dataset.qelWord
    const translation = token.dataset.qelTranslation
    if (!word || !translation)
      return

    this.closePopover()

    const popover = document.createElement("div")
    popover.className = `${NOTRANSLATE_CLASS} ${POPOVER_CLASS}`
    popover.setAttribute("role", "dialog")

    const title = document.createElement("div")
    title.className = "qel-word-learning-popover-title"
    title.textContent = word
    popover.appendChild(title)

    const meta = document.createElement("div")
    meta.className = "qel-word-learning-popover-meta"
    meta.textContent = [token.dataset.qelLevel?.toUpperCase(), token.dataset.qelPhonetic]
      .filter(Boolean)
      .join(" · ")
    popover.appendChild(meta)

    const definition = document.createElement("div")
    definition.className = "qel-word-learning-popover-definition"
    definition.textContent = translation
    popover.appendChild(definition)

    const actions = document.createElement("div")
    actions.className = "qel-word-learning-popover-actions"

    const isSaved = token.dataset.qelSaved === "true" || this.savedWords.has(word)
    const saveButton = document.createElement("button")
    saveButton.type = "button"
    saveButton.textContent = isSaved ? "已加入复习" : "加入复习"
    saveButton.disabled = isSaved
    saveButton.addEventListener("click", async () => {
      if (saveButton.disabled)
        return

      saveButton.disabled = true
      saveButton.textContent = "加入中"
      try {
        await this.saveWord(word)
        token.dataset.qelSaved = "true"
        saveButton.textContent = "已加入复习"
      }
      catch (error) {
        console.warn("Failed to save word for review.", error)
        saveButton.disabled = false
        saveButton.textContent = "加入复习"
      }
    })

    const knownButton = document.createElement("button")
    knownButton.type = "button"
    knownButton.textContent = "已掌握"
    knownButton.addEventListener("click", () => {
      void this.markWordKnown(word)
    })

    const hideButton = document.createElement("button")
    hideButton.type = "button"
    hideButton.textContent = "隐藏"
    hideButton.addEventListener("click", () => {
      void this.markWordHidden(word)
    })

    actions.append(saveButton, knownButton, hideButton)
    popover.appendChild(actions)
    document.body.appendChild(popover)
    this.popover = popover

    const rect = token.getBoundingClientRect()
    const popoverRect = popover.getBoundingClientRect()
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - popoverRect.width - 8),
    )
    const top = Math.min(
      rect.bottom + 8,
      Math.max(8, window.innerHeight - popoverRect.height - 8),
    )

    popover.style.left = `${left}px`
    popover.style.top = `${top}px`
  }

  private async markWordKnown(word: string): Promise<void> {
    const normalizedWord = this.suppressWordInCurrentPage(word, "known")
    if (!normalizedWord)
      return

    await markLearningWordKnown(normalizedWord)
    await this.loadWordState()
    this.removeAnnotationsForWord(normalizedWord)
  }

  private async saveWord(word: string): Promise<void> {
    const normalizedWord = normalizeLearningWord(word)
    if (!normalizedWord)
      return

    await saveLearningWord(normalizedWord)
    this.savedWords.add(normalizedWord)
    await this.loadWordState()
  }

  private async markWordHidden(word: string): Promise<void> {
    const normalizedWord = this.suppressWordInCurrentPage(word, "hidden")
    if (!normalizedWord)
      return

    await markLearningWordHidden(normalizedWord)
    await this.loadWordState()
    this.removeAnnotationsForWord(normalizedWord)
  }

  private suppressWordInCurrentPage(rawWord: string, status: "hidden" | "known"): string | null {
    const word = normalizeLearningWord(rawWord)
    if (!word)
      return null

    this.sessionSuppressedWords.add(word)
    if (status === "hidden") {
      this.hiddenWords.add(word)
    }
    else {
      this.knownWords.add(word)
    }

    this.closePopover()
    this.removeAnnotationsForWord(word)
    return word
  }

  private removeAnnotationsForWord(word: string): void {
    document.querySelectorAll<HTMLElement>(`.${TOKEN_CLASS}`)
      .forEach((token) => {
        if (token.dataset.qelWord === word)
          this.unwrapToken(token)
      })
  }

  private removeAnnotations(): void {
    document.querySelectorAll<HTMLElement>(`.${TOKEN_CLASS}`)
      .forEach(token => this.unwrapToken(token))
  }

  private unwrapToken(token: HTMLElement): void {
    const source = token.querySelector<HTMLElement>(`.${SOURCE_CLASS}`)
    this.suppressObserverForInternalMutation()
    token.replaceWith(document.createTextNode(source?.textContent ?? token.textContent ?? ""))
  }

  private closePopover(): void {
    this.popover?.remove()
    this.popover = null
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID))
      return

    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = `
      .${TOKEN_CLASS} {
        align-items: baseline;
        border-bottom: 1px dotted rgba(20, 121, 104, 0.72);
        border-radius: 3px;
        cursor: pointer;
        display: inline-flex;
        gap: 2px;
        margin: 0 1px;
        padding: 0 2px;
        text-decoration: none;
        transition: background-color 120ms ease, border-color 120ms ease;
      }
      .${TOKEN_CLASS}:hover {
        background: rgba(20, 121, 104, 0.1);
        border-color: rgba(20, 121, 104, 0.95);
      }
      .${TOKEN_CLASS}[data-qel-display-mode="inlineGloss"]::after {
        content: attr(data-qel-short-translation);
        color: rgb(20, 121, 104);
        font-size: 0.76em;
        font-weight: 500;
        line-height: 1;
      }
      .${POPOVER_CLASS} {
        background: color-mix(in srgb, canvas 92%, white 8%);
        border: 1px solid rgba(15, 23, 42, 0.13);
        border-radius: 8px;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
        color: rgb(15, 23, 42);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        max-width: min(280px, calc(100vw - 16px));
        padding: 10px;
        position: fixed;
        z-index: 2147483647;
      }
      .qel-word-learning-popover-title {
        font-size: 15px;
        font-weight: 650;
        line-height: 1.2;
      }
      .qel-word-learning-popover-meta {
        color: rgb(100, 116, 139);
        font-size: 12px;
        margin-top: 2px;
      }
      .qel-word-learning-popover-definition {
        font-size: 13px;
        line-height: 1.45;
        margin-top: 8px;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }
      .qel-word-learning-popover-actions {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
        margin-top: 10px;
      }
      .qel-word-learning-popover-actions button {
        background: rgba(15, 23, 42, 0.06);
        border: 0;
        border-radius: 6px;
        color: rgb(15, 23, 42);
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        padding: 5px 8px;
      }
      .qel-word-learning-popover-actions button:hover {
        background: rgba(20, 121, 104, 0.14);
      }
      .qel-word-learning-popover-actions button:disabled {
        cursor: default;
        opacity: 0.72;
      }
    `

    document.documentElement.appendChild(style)
  }
}
