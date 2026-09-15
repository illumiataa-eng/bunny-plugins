/**
 * 插件配置（持久化的设置项）。
 *
 * 单独成文件是为了打断这条环：
 *   index.ts → api/index.ts → api/LLM.ts → index.ts
 * LLM 引擎需要读配置，但不该依赖插件入口。
 *
 * 这里只 import 零依赖的模块，保证自己被任何地方安全引用。
 */
import { storage } from "@vendetta/plugin"
import { DEFAULT_ENGINE_ID } from "./api/engine"
import { DEFAULT_WINDOW_BEFORE, DEFAULT_WINDOW_AFTER } from "./batch"

export const settings: {
    source_lang?: string
    target_lang?: string
    /**
     * 翻译引擎 id。
     * 旧版本存的是数字（0 = DeepL，1 = Google Translate），
     * 保留 number 是为了让老设置平滑迁移，由 resolveEngine 负责解析。
     */
    translator?: string | number
    immersive_enabled?: boolean

    /** 批量翻译：连带上下文一起翻 */
    batch_enabled?: boolean
    /** 上下文窗口：目标消息之前取几条 */
    batch_before?: number
    /** 上下文窗口：目标消息之后取几条 */
    batch_after?: number

    /** LLM 引擎的接口地址，例如 https://api.deepseek.com/v1 */
    llm_base_url?: string
    /** LLM 引擎的 API 密钥（明文存于本机，不要写进代码） */
    llm_api_key?: string
    /** LLM 引擎的模型名，例如 deepseek-chat */
    llm_model?: string
} = storage

settings.target_lang ??= "en"
settings.translator ??= DEFAULT_ENGINE_ID
settings.immersive_enabled ??= true
settings.batch_enabled ??= true
settings.batch_before ??= DEFAULT_WINDOW_BEFORE
settings.batch_after ??= DEFAULT_WINDOW_AFTER
