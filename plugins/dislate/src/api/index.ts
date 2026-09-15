/**
 * 翻译引擎的对外接口。
 *
 * 调用方不再关心「有哪些引擎、怎么分派」，只问：
 *   resolveEngine(settings.translator).translate(...)
 *
 * 加一个新引擎 = 新建一个文件 + 在这里 registerEngine() 一行。
 */
import {
    registerEngine,
    resolveEngine,
    resolveEngineId,
    listEngines,
    DEFAULT_ENGINE_ID
} from "./engine"
import DeepL from "./DeepL"
import GTranslate from "./GTranslate"
import LLM from "./LLM"

// 注册顺序即设置界面里的显示顺序
registerEngine(DeepL)
registerEngine(GTranslate)
registerEngine(LLM)

export { resolveEngine, resolveEngineId, listEngines, DEFAULT_ENGINE_ID }
export type { TranslationEngine, TranslationResult } from "./engine"
