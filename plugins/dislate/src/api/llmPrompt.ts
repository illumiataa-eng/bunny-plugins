/**
 * LLM 提示词与请求/响应形状。
 *
 * 与 LLM.ts 分开是为了可测：
 * LLM.ts 需要读配置（依赖 @vendetta/plugin），而这里只依赖语言表，
 * 因此可以在没有运行环境的情况下验证提示词结构。
 *
 * 提示词设计取自对主流开源翻译项目的调研：
 *   - 规则放 system（只发一次），文本放 user（每次都付费）
 *   - 明确禁止解释与反问
 *   - 要求原样保留占位符（占位符由 translation.ts 抽取）
 *   - 支持多行编号输入，逐条对应输出（批量翻译依赖这条）
 */
import { GTranslateLangs } from "../lang"

export const SYSTEM_RULES = `你是一名专业的翻译引擎，将用户提供的文本翻译成{target}。

规则：
1. 只输出译文。不要解释、不要加引号、不要重复原文、不要询问是否继续。
2. 原文中的占位符（形如 [[0]]、[[1]]）必须原样保留，不得增删或改动。
3. 保留原文的换行与段落结构。
4. 若输入是多条带编号的消息（形如 "1. "、"2. "），必须逐条对应输出，编号与条数保持不变。
5. 准确自然，符合目标语言的表达习惯；保留原文的语气与语体。
6. 原文若含粗俗表达，用同等强度的译文对应，不要回避或净化。`

/**
 * 语言代码 → 语言名称（zh-CN → Chinese (Simplified)）。
 * 模型对语言名称的理解比 ISO 代码更稳。
 */
export function languageName(code: string | undefined): string {
    if (!code) return "the target language"

    for (const [name, value] of Object.entries(GTranslateLangs)) {
        if (value === code) return name
    }

    return code
}

export interface ChatMessage {
    role: "system" | "user"
    content: string
}

export interface ChatRequest {
    model: string
    temperature: number
    messages: ChatMessage[]
}

/** 组装 OpenAI 兼容的请求体。 */
export function buildChatRequest(
    text: string,
    targetLang: string | undefined,
    model: string
): ChatRequest {
    return {
        model,
        temperature: 0,
        messages: [
            {
                role: "system",
                content: SYSTEM_RULES.replace("{target}", languageName(targetLang))
            },
            { role: "user", content: text }
        ]
    }
}

/** 从接口响应里取出译文；取不到时返回 undefined。 */
export function readChatResponse(data: any): string | undefined {
    const content = data?.choices?.[0]?.message?.content
    return typeof content === "string" && content.trim().length > 0
        ? content.trim()
        : undefined
}
