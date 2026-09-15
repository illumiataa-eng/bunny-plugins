/**
 * 已翻译消息的原文缓存。
 *
 * 原先这是 ActionSheet.tsx 内部的一个模块级数组：
 *   let cachedData: object[] = []
 * 它既没有名字（看不出存的是什么），也没有接口（外面只能靠
 * Object.keys(o)[0] 这种手法猜），而且被锁在 patch 文件里 ——
 * 批量翻译需要知道「这条是否已经翻过」，却拿不到它。
 *
 * 抽出来之后：判断是否已翻译、取回原文、移除记录，都有明确的方法，
 * 且可以在没有 Discord 环境的情况下测试。
 */

export interface TranslationCache {
    /** 记住一条消息的原文，标记为已翻译 */
    remember(messageId: string, originalContent: string): void
    /** 移除记录，标记为未翻译（用于「还原」） */
    forget(messageId: string): void
    /** 取回原文；未翻译过则为 undefined */
    get(messageId: string): string | undefined
    /** 是否已经翻译过 */
    has(messageId: string): boolean
    /** 全部已翻译的消息 id，便于批量翻译跳过 */
    ids(): string[]
    readonly size: number
    clear(): void
}

export function createTranslationCache(): TranslationCache {
    const store = new Map<string, string>()

    return {
        remember(messageId: string, originalContent: string): void {
            store.set(messageId, originalContent)
        },

        forget(messageId: string): void {
            store.delete(messageId)
        },

        get(messageId: string): string | undefined {
            return store.get(messageId)
        },

        has(messageId: string): boolean {
            return store.has(messageId)
        },

        ids(): string[] {
            return [...store.keys()]
        },

        get size(): number {
            return store.size
        },

        clear(): void {
            store.clear()
        }
    }
}
