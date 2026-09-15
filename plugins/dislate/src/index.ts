import { logger } from "@vendetta"
import patchActionSheet from "./patches/ActionSheet"
import patchCommands from "./patches/Commands"
import Settings from "./settings"
import { createDisposerBox } from "./disposer"
import { diagnostics } from "./state"

// 配置定义在 ./config（那里不依赖插件入口，避免循环）。
// 这里转出，让 `from ".."` 的既有写法继续可用。
export { settings } from "./config"

const disposers = createDisposerBox()

export default {
    onLoad: () => {
        // 清掉可能残留的上一轮（防重复 onLoad 造成叠加）
        disposers.teardown()

        // 每个补丁在创建处立即登记。
        // 这样即便 patchCommands() 抛错，patchActionSheet() 的 unpatch
        // 也已经在容器里，卸载时能被收回 —— 旧写法用数组字面量收集，
        // 一旦中途抛错，赋值永不发生，引用就永久丢失了。
        disposers.track(patchActionSheet())
        disposers.track(patchCommands())
    },

    onUnload: () => {
        const report = disposers.teardown()

        if (report.failed > 0) {
            // 分离：日志进 logcat，诊断进应用内
            diagnostics.record({
                source: "patch",
                level: "warn",
                message: `${report.failed} 个补丁释放失败，可能仍有残留`,
                detail: "若长按菜单出现重复项，请 Reload Discord 彻底清理",
                error: report.errors[0]
            })

            logger.error(
                `Dislate: ${report.failed} 个补丁释放失败，仍可能有残留`,
                report.errors
            )
        }
    },

    settings: Settings
}
