/**
 * LLM 翻译引擎（OpenAI 兼容格式）。
 *
 * 用 /chat/completions 这一通用形状，一套代码同时覆盖
 * OpenAI、DeepSeek、Kimi、硅基流动、OpenRouter，以及本地的 Ollama / LM Studio：
 * 改一下接口地址即可。
 *
 * 提示词与请求/响应形状在 ./llmPrompt（那里可脱离运行环境测试），
 * 本文件只负责读配置与发请求。
 */
import type { TranslationEngine } from "./engine"
import { GTranslateLangs } from "../lang"
import { settings } from "../config"
import { buildChatRequest, readChatResponse } from "./llmPrompt"

/** 比 Revenge 默认的 10 秒宽裕，LLM 生成较慢 */
const DEFAULT_TIMEOUT_MS = 20000

interface LLMConfig {
    baseUrl?: string
    apiKey?: string
    model?: string
    timeoutMs?: number
}

function readConfig(): LLMConfig {
    const raw = settings as Record<string, any>
    return {
        baseUrl: raw.llm_base_url,
        apiKey: raw.llm_api_key,
        model: raw.llm_model
    }
}

function missingConfigReason(config: LLMConfig): string | null {
    const missing: string[] = []
    if (!config.baseUrl) missing.push("接口地址")
    if (!config.apiKey) missing.push("API 密钥")
    if (!config.model) missing.push("模型名")
    return missing.length > 0 ? missing.join("、") : null
}

const translate = async (
    text: string,
    source_lang: string = "auto",
    target_lang: string,
    original: boolean = false
) => {
    if (original) return { source_lang, text }

    const config = readConfig()
    const reason = missingConfigReason(config)
    if (reason) {
        throw Error(`LLM 尚未配置：请填写${reason}`)
    }

    const endpoint = config.baseUrl!.replace(/\/+$/, "") + "/chat/completions"
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

    // Revenge 的 safeFetch 默认只给 10 秒，对 LLM 太紧，
    // 所以这里自己控超时。
    const controller = new AbortController()
    const timer = setTimeout(
        () => controller.abort(`请求超过 ${timeoutMs}ms`),
        timeoutMs
    )

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`
            },
            body: JSON.stringify(buildChatRequest(text, target_lang, config.model!)),
            signal: controller.signal
        })

        if (!response.ok) {
            throw Error(`HTTP ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        const out = readChatResponse(data)

        if (out === undefined) {
            throw Error("接口返回了空内容")
        }

        return { source_lang, text: out }
    } finally {
        clearTimeout(timer)
    }
}

const engine: TranslationEngine = {
    id: "llm",
    label: "LLM（OpenAI 兼容）",
    languages: GTranslateLangs,
    requiresKey: true,
    requiresEndpoint: true,
    translate
}

export default engine
