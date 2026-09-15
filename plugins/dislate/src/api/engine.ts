/**
 * 翻译引擎注册表。
 *
 * 解决的问题：引擎身份原先是一个裸整数（0 = DeepL，1 = Google Translate），
 * 关于「有哪些引擎、各自叫什么、支持哪些语言」的知识散落在 6 个文件里
 * （两处 switch、设置页的三元判断、语言页的分支）。
 * 加一个引擎要改 5 处，漏一处就出一个静默的错。
 *
 * 现在引擎自带元数据并在本表登记，调用方只问表：「这个配置该用哪个引擎」。
 */

export interface TranslationResult {
    source_lang: string | undefined
    text: string
}

export interface TranslationEngine {
    /** 稳定标识，用于持久化与日志 */
    readonly id: string
    /** 设置界面里显示的引擎名 */
    readonly label: string
    /** 该引擎支持的目标语言：展示名 → 传给 API 的语言代码 */
    readonly languages: Record<string, string>
    /** 是否需要用户配置密钥（用于设置界面的提示） */
    readonly requiresKey?: boolean
    /** 是否需要接口地址（LLM 这类自建端点需要） */
    readonly requiresEndpoint?: boolean
    translate(
        text: string,
        sourceLang: string | undefined,
        targetLang: string,
        original?: boolean
    ): Promise<TranslationResult>
}

const registry = new Map<string, TranslationEngine>()

/**
 * 旧版把引擎存成数字（0 = DeepL，1 = Google）。
 * 这里做一次性映射，使已有用户的设置不会失效。
 */
const LEGACY_IDS: Record<string, string> = {
    "0": "deepl",
    "1": "google"
}

export const DEFAULT_ENGINE_ID = "google"

export function registerEngine(engine: TranslationEngine): void {
    registry.set(engine.id, engine)
}

/** 把持久化里的任意值解析成一个已注册的引擎 id。无法识别时回退到默认引擎。 */
export function resolveEngineId(raw: unknown): string {
    if (typeof raw === "string" && registry.has(raw)) return raw

    if (raw !== null && raw !== undefined) {
        const legacy = LEGACY_IDS[String(raw)]
        if (legacy && registry.has(legacy)) return legacy
    }

    if (registry.has(DEFAULT_ENGINE_ID)) return DEFAULT_ENGINE_ID

    // 兜底：注册表非空但默认引擎缺失时，取第一个可用的
    const first = registry.keys().next()
    return first.done ? "" : first.value
}

/** 解析出应使用的引擎对象。注册表为空时抛错，避免静默产出错误译文。 */
export function resolveEngine(raw: unknown): TranslationEngine {
    const id = resolveEngineId(raw)
    const engine = registry.get(id)
    if (!engine) {
        throw new Error(
            `没有可用的翻译引擎（请求的 id: ${JSON.stringify(raw)}，注册表大小: ${registry.size}）`
        )
    }
    return engine
}

/** 按注册顺序列出全部引擎，供设置界面渲染。 */
export function listEngines(): TranslationEngine[] {
    return [...registry.values()]
}

/** 仅供测试使用：清空注册表。 */
export function __resetRegistry(): void {
    registry.clear()
}
