/**
 * 插件的运行时单例。
 *
 * 放在这里而不是 index.ts，是为了避免 patches → index.ts 的循环依赖：
 * patch 文件需要诊断与翻译缓存，但不该依赖插件入口。
 */
import { createDiagnostics } from "./diagnostics"
import { collectEnvironment } from "./environment"
import { createTranslationCache } from "./translationCache"

/** 应用内可读的诊断记录（设置页的「诊断日志」读它） */
export const diagnostics = createDiagnostics({
    environment: collectEnvironment
})

/** 已翻译消息的原文缓存（决定长按菜单显示「翻译」还是「还原」） */
export const translationCache = createTranslationCache()
