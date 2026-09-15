/**
 * 翻译流程。
 *
 * 解决的问题：原先「占位符抽取 → 调用引擎 → 占位符还原」这段逻辑
 * 只写在 ActionSheet.tsx 里，Commands.tsx（斜杠命令）完全没有 ——
 * 于是 /translate 里的 <@123> 会被原样送去翻译，被翻坏或吞掉。
 * 同一件事没有自己的 module，就必然出现一条路径有保护、另一条没有。
 *
 * 本模块只依赖注入进来的翻译函数，不依赖任何运行环境，因此可测。
 */

/**
 * 需要原样保留的 Discord 标记。
 *
 * 原实现只覆盖前五类中的四种（漏了角色提及），
 * 时间戳 / 斜杠命令 / 服务器导引 / 代码 / 链接则完全没管。
 */
export const PLACEHOLDER_SOURCES = [
    "<a?:\\w+:\\d+>",                     // 自定义表情（含动画）
    "<@&\\d+>",                           // 角色提及  ← 原先漏掉（<@!?\d+> 匹配不到 &）
    "<@!?\\d+>",                          // 用户提及 / 昵称提及
    "<#\\d+>",                            // 频道提及
    "<t:\\d+(?::[tTdDfFR])?>",            // 时间戳    ← 原先漏掉
    "<\\/[\\w-]+:\\d+>",                  // 斜杠命令  ← 原先漏掉
    "<id:[\\w-]+>",                       // 服务器导引 ← 原先漏掉
    "```[\\s\\S]*?```",                   // 代码块（可跨行）
    "`[^`\\n]+`",                         // 行内代码
    "https?:\\/\\/[^\\s<>()\\[\\]]+"      // URL（含 Markdown 链接的目标部分）
] as const

const PLACEHOLDER_PATTERN = new RegExp(PLACEHOLDER_SOURCES.join("|"), "g")

/** 占位符形态：[[0]]。还原时容忍内部空白（模型有时会写成 [[ 0 ]]。 */
const RESTORE_PATTERN = /\[\[\s*(\d+)\s*\]\]/g

export interface PlaceholderSet {
    /** 标记被替换成 [[n]] 之后的文本，送给翻译引擎 */
    text: string
    /** 按索引保存的原始标记 */
    values: string[]
}

export interface RestoreResult {
    /** 还原后的文本 */
    text: string
    /** 成功还原的数量 */
    restored: number
    /** 译文中找不到的占位符索引 —— 模型把它们吞了 */
    missing: number[]
}

/**
 * 把 Discord 标记抽出来换成 [[n]]，避免它们进入翻译引擎。
 */
export function extractPlaceholders(text: string): PlaceholderSet {
    const values: string[] = []

    const replaced = text.replace(PLACEHOLDER_PATTERN, match => {
        values.push(match)
        return `[[${values.length - 1}]]`
    })

    return { text: replaced, values }
}

/**
 * 把译文里的 [[n]] 换回原始标记。
 * 容忍占位符内部的空白，并报告未被还原的索引。
 */
export function restorePlaceholders(translated: string, values: string[]): RestoreResult {
    const found = new Set<number>()

    const text = translated.replace(RESTORE_PATTERN, (match, digits: string) => {
        const index = Number(digits)
        if (index >= 0 && index < values.length) {
            found.add(index)
            return values[index]
        }
        // 越界：保留原样，避免把模型乱写的编号当标记处理
        return match
    })

    const missing = values
        .map((_, index) => index)
        .filter(index => !found.has(index))

    return { text, restored: found.size, missing }
}

/** 注入式翻译函数：接受待译文本与目标语言，返回译文。 */
export type TranslateFn = (text: string, targetLang: string) => Promise<string>

export interface TranslateOutcome {
    /** 最终文本，标记已还原 */
    text: string
    /** 送给引擎的文本（已抽取标记），便于诊断 */
    sent: string
    /** 抽取到的标记数量 */
    placeholders: number
    /** 引擎译文里丢失的占位符索引 */
    missing: number[]
}

/**
 * 翻译一条文本，全程保护其中的 Discord 标记。
 *
 * 这是两条触发路径（长按菜单、斜杠命令）共用的唯一入口 ——
 * 任何一条路径都不需要自己记得处理占位符。
 */
export async function translateWithProtection(
    rawText: string,
    targetLang: string,
    translate: TranslateFn
): Promise<TranslateOutcome> {
    const { text: sent, values } = extractPlaceholders(rawText)
    const translated = await translate(sent, targetLang)
    const restored = restorePlaceholders(translated, values)

    return {
        text: restored.text,
        sent,
        placeholders: values.length,
        missing: restored.missing
    }
}
