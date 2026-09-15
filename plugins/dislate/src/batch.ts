/**
 * 上下文批量翻译。
 *
 * 解决的问题：原先只能一条一条翻译。要读一整段对话得长按 6 次，
 * 而且每条都是孤立翻译 —— 「oops sorry wrong channel」脱离上文
 * 会被翻错语气，因为它在回应前两轮的团本话题。
 *
 * 现在以目标消息为中心取一个窗口，一次请求翻译整批，
 * 并自动跳过不可翻译与已翻译的条目。
 *
 * 本模块只依赖注入进来的翻译函数，不依赖运行环境，因此可测。
 */

import { extractPlaceholders, restorePlaceholders, type TranslateFn } from "./translation"

/** 默认窗口：以目标消息为中心，上下各 2 条 + 本条 = 共 5 条 */
export const DEFAULT_WINDOW_BEFORE = 2
export const DEFAULT_WINDOW_AFTER = 2

/** 每侧最多扫多少条。避免在大量图片消息中间无限外扩。 */
export const SCAN_LIMIT = 10

/**
 * 可翻译的消息类型。
 *   0  = DEFAULT
 *   19 = REPLY
 *   21 = THREAD_STARTER_MESSAGE
 * 其余（加入成员、置顶、改名等）没有可翻译的正文。
 */
export const TRANSLATABLE_TYPES: ReadonlySet<number> = new Set([0, 19, 21])

export interface WindowMessage {
    id: string
    content: string
    /** Discord MessageType；缺省视为可翻译 */
    type?: number
    /** 消息状态；缺省视为正常 */
    state?: string
    blocked?: boolean
}

export interface SkipRecord {
    id: string
    reason: string
}

export interface ContextWindow {
    /** 窗口内的消息，按时间正序 */
    messages: WindowMessage[]
    /** 目标消息在 messages 中的下标；不可翻译时为 -1 */
    targetIndex: number
    /** 扫描范围内被跳过的消息及原因 */
    skipped: SkipRecord[]
}

export interface SelectOptions {
    before?: number
    after?: number
    /** 已翻译的消息 id：跳过以避免重复翻译浪费 */
    alreadyTranslated?: ReadonlySet<string>
}

/**
 * 判断一条消息为什么不可翻译。可翻译时返回 null。
 */
export function untranslatableReason(message: WindowMessage): string | null {
    if (!message.content || message.content.trim().length === 0) {
        return "没有文本内容"
    }
    if (message.type !== undefined && !TRANSLATABLE_TYPES.has(message.type)) {
        return `系统消息（类型 ${message.type}）`
    }
    if (message.state !== undefined && message.state !== "SENT") {
        return `状态异常（${message.state}）`
    }
    if (message.blocked) {
        return "已屏蔽"
    }
    return null
}

/**
 * 以目标消息为中心选出上下文窗口。
 *
 * 两侧各自向外扩，跳过不可翻译或已翻译的消息，直到凑够条数
 * 或到达边界 —— 所以「上下各 2 条」指的是 2 条**可用**的上下文，
 * 中间夹着的图片消息不会占掉名额。
 */
export function selectContextWindow(
    messages: readonly WindowMessage[],
    targetId: string,
    options: SelectOptions = {}
): ContextWindow {
    const before = Math.max(0, options.before ?? DEFAULT_WINDOW_BEFORE)
    const after = Math.max(0, options.after ?? DEFAULT_WINDOW_AFTER)
    const done = options.alreadyTranslated

    const skipped: SkipRecord[] = []
    const empty: ContextWindow = { messages: [], targetIndex: -1, skipped }

    const at = messages.findIndex(m => m.id === targetId)
    if (at < 0) return empty

    const target = messages[at]

    // 目标自身必须可翻译，否则整窗没有意义
    const targetReason = untranslatableReason(target)
    if (targetReason) {
        skipped.push({ id: target.id, reason: targetReason })
        return empty
    }

    const reasonFor = (m: WindowMessage): string | null =>
        untranslatableReason(m) ?? (done?.has(m.id) ? "已翻译" : null)

    const pickSide = (start: number, step: number, count: number): WindowMessage[] => {
        const picked: WindowMessage[] = []
        let scanned = 0
        let i = start

        while (picked.length < count && i >= 0 && i < messages.length && scanned < SCAN_LIMIT) {
            const m = messages[i]
            const reason = reasonFor(m)

            if (reason) skipped.push({ id: m.id, reason })
            else picked.push(m)

            i += step
            scanned += 1
        }

        return picked
    }

    // 收集时由近及远，所以要翻正
    const earlier = pickSide(at - 1, -1, before).reverse()
    const later = pickSide(at + 1, 1, after)

    return {
        messages: [...earlier, target, ...later],
        targetIndex: earlier.length,
        skipped
    }
}

// ── 请求组装与响应解析 ────────────────────────────────────────

export interface BatchRequestLine {
    id: string
    /** 已抽取占位符的待译文本 */
    text: string
}

/**
 * 组装带编号的请求正文。
 *
 * 编号是必须的：一次翻多条时，模型必须能逐条对应回来，
 * 否则译文会串行错位。
 */
export function buildBatchRequest(lines: readonly BatchRequestLine[]): string {
    return lines.map((line, i) => `${i + 1}. ${line.text}`).join("\n")
}

/**
 * 行首编号。接受 `1.` `1)` `1:` `[1]` `#1` 几种写法。
 * 要求编号后有分隔符，避免把「2024 年」这类正文误当成编号。
 */
const ITEM_LINE = /^\s*(?:\[(\d+)\]|#(\d+)|(\d+)[.\):])\s*(.*)$/

/**
 * 解析带编号的译文。返回长度固定为 expected 的数组，
 * 缺项为 null —— 调用方据此判断哪些条目没翻出来。
 */
export function parseNumberedItems(text: string, expected: number): (string | null)[] {
    const result: (string | null)[] = new Array(expected).fill(null)

    let current: number | null = null
    let buffer: string[] = []

    const flush = () => {
        if (current !== null && current >= 1 && current <= expected) {
            const joined = buffer.join("\n").trim()
            if (joined.length > 0) result[current - 1] = joined
        }
        buffer = []
    }

    for (const line of text.split("\n")) {
        const match = ITEM_LINE.exec(line)

        if (match) {
            flush()
            current = Number(match[1] ?? match[2] ?? match[3])
            buffer.push(match[4] ?? "")
        } else if (current !== null) {
            // 续行：模型把一条译文折成了多行
            buffer.push(line)
        }
    }

    flush()
    return result
}

// ── 端到端 ────────────────────────────────────────────────────

export interface BatchItemResult {
    id: string
    /** 译文（标记已还原）；该条没解析出来时为 undefined */
    text?: string
    /** 该条丢失的占位符索引 */
    missing: number[]
}

export interface BatchOutcome {
    /** 与窗口顺序一一对应 */
    items: BatchItemResult[]
    /** 送给引擎的请求正文，便于诊断 */
    sent: string
    /** 是否每条都拿到了译文 */
    complete: boolean
}

/**
 * 翻译整个窗口，一次请求。
 */
export async function translateBatch(
    window: ContextWindow,
    targetLang: string,
    translate: TranslateFn
): Promise<BatchOutcome> {
    const extracted = window.messages.map(m => extractPlaceholders(m.content))

    const sent = buildBatchRequest(
        window.messages.map((m, i) => ({ id: m.id, text: extracted[i].text }))
    )

    const response = await translate(sent, targetLang)
    const parsed = parseNumberedItems(response, window.messages.length)

    const items: BatchItemResult[] = window.messages.map((m, i) => {
        const raw = parsed[i]

        if (raw === null) {
            // 该条没翻出来：报告全部占位符缺失，并标记为无译文
            return {
                id: m.id,
                missing: extracted[i].values.map((_, k) => k)
            }
        }

        const restored = restorePlaceholders(raw, extracted[i].values)
        return { id: m.id, text: restored.text, missing: restored.missing }
    })

    return {
        items,
        sent,
        complete: items.every(item => item.text !== undefined)
    }
}
