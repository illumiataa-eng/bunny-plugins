import { findByProps, findByStoreName } from "@vendetta/metro"
import { FluxDispatcher, React, ReactNative, stylesheet } from "@vendetta/metro/common"
import { before, after } from "@vendetta/patcher"
import { semanticColors } from "@vendetta/ui"
import { getAssetIDByName } from "@vendetta/ui/assets"
import { Forms } from "@vendetta/ui/components"
import { findInReactTree } from "@vendetta/utils"
import { settings } from ".."

import { resolveEngine } from "../api"
import { translateWithProtection } from "../translation"
import { selectContextWindow, translateBatch, DEFAULT_WINDOW_BEFORE, DEFAULT_WINDOW_AFTER } from "../batch"
import { diagnostics, translationCache } from "../state"
import { Strings } from "../strings"
import { showToast } from "@vendetta/ui/toasts"
import { logger } from "@vendetta"

const LazyActionSheet = findByProps("openLazy", "hideActionSheet")
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow ?? Forms.FormRow
const MessageStore = findByStoreName("MessageStore")
const ChannelStore = findByStoreName("ChannelStore")
const separator = "\n"

const styles = stylesheet.createThemedStyleSheet({
    iconComponent: {
        width: 24,
        height: 24,
        tintColor: semanticColors.INTERACTIVE_NORMAL
    }
})

/**
 * 从频道历史里取出以目标消息为中心的上下文窗口。
 * 不可翻译（图片、系统提示）与已翻译过的都会被跳过。
 */
const collectContextWindow = (channelId: string, targetId: string) => {
    const store: any = MessageStore.getMessages(channelId)
    const all: any[] = store?._array ?? []

    return selectContextWindow(
        all.map(m => ({
            id: m.id,
            content: m.content ?? "",
            type: m.type,
            state: m.state,
            blocked: m.blocked
        })),
        targetId,
        {
            before: settings.batch_before ?? DEFAULT_WINDOW_BEFORE,
            after: settings.batch_after ?? DEFAULT_WINDOW_AFTER,
            alreadyTranslated: new Set(translationCache.ids())
        }
    )
}

export default () => before("openLazy", LazyActionSheet, ([component, key, msg]) => {
    const message = msg?.message
    if (key !== "MessageLongPressActionSheet" || !message) return

    component.then((instance: any) => {
        const unpatch = after("default", instance, (_: any, component: any) => {
            React.useEffect(() => () => { unpatch() }, [])

            // Safely locate action sheet row groups to prevent Metro index crashes
            const groups: any[] = findInReactTree(
                component,
                (c: any) => Array.isArray(c) && c[0]?.type?.name === "ActionSheetRowGroup"
            )

            const originalMessage = MessageStore.getMessage(
                message.channel_id,
                message.id
            )
            if (!originalMessage?.content && !message.content) return

            const messageId = originalMessage?.id ?? message.id
            const messageContent = originalMessage?.content ?? message.content

            const alreadyTranslated = translationCache.has(messageId)

            // 菜单文案直接取整句：中文语序与英文不同，
            // 拼 `${type} Message` 那种写法在中文里拼不出来。

            // withContext = true → 连带上下文一起翻；false → 只翻这一条。
            // 两种模式是并列的两个入口，不再由设置里的开关二选一。
            const runTranslate = async (withContext: boolean) => {
                LazyActionSheet.hideActionSheet()
                try {
                    const target_lang = settings.target_lang
                    const isImmersive = settings.immersive_enabled

                    if (!originalMessage) return

                    const channelId = originalMessage.channel_id
                    const engine = resolveEngine(settings.translator)
                    const langTag = `\`[${target_lang?.toLowerCase()}]\``

                    const dispatchContent = (id: string, content: string | undefined) => {
                        FluxDispatcher.dispatch({
                            type: "MESSAGE_UPDATE",
                            message: {
                                id,
                                channel_id: channelId,
                                guild_id: ChannelStore.getChannel(channelId)?.guild_id,
                                content,
                            },
                            log_edit: false,
                            otherPluginBypass: true
                        })
                    }

                    const buildFinal = (original: string, translated: string) =>
                        isImmersive
                            ? `${original}${separator}${translated} ${langTag}`
                            : `${translated} ${langTag}`

                    // 还原：只处理被点的那一条
                    if (alreadyTranslated) {
                        dispatchContent(messageId, translationCache.get(messageId))
                        translationCache.forget(messageId)
                        return
                    }

                    // 含上下文：以本条为中心，连带上下若干条一起翻
                    if (withContext) {
                        const contextWindow = collectContextWindow(channelId, messageId)

                        if (contextWindow.messages.length > 1) {
                            const outcome = await translateBatch(
                                contextWindow,
                                target_lang,
                                (text, lang) => engine.translate(text, undefined, lang).then(r => r.text)
                            )

                            let applied = 0

                            outcome.items.forEach((item, index) => {
                                // 没翻出来的那条不动它，也绝不拿假内容顶上
                                if (item.text === undefined) return

                                const wm = contextWindow.messages[index]
                                dispatchContent(wm.id, buildFinal(wm.content, item.text.trim()))
                                translationCache.remember(wm.id, wm.content)
                                applied += 1
                            })

                            const missingMarkers = outcome.items.reduce(
                                (sum, item) => sum + item.missing.length, 0
                            )
                            if (missingMarkers > 0) {
                                diagnostics.record({
                                    source: "translate",
                                    level: "warn",
                                    message: `批量译文丢失了 ${missingMarkers} 个标记`,
                                    detail: `引擎 ${engine.id} · 目标 ${target_lang} · 窗口 ${outcome.items.length} 条`
                                })
                            }

                            if (applied > 0) {
                                if (!outcome.complete) {
                                    diagnostics.record({
                                        source: "translate",
                                        level: "warn",
                                        message: `${outcome.items.length - applied} 条未翻出，已跳过`,
                                        detail: `引擎 ${engine.id} · 可降低窗口条数重试`
                                    })
                                }
                                return
                            }
                            // 整窗都没翻出来 —— 降级走下面的单条
                        }
                        // 窗口里只有本条（附近没有可翻的上下文）时，同样降级走单条
                    }

                    // 单条（同时是「含上下文」的兜底）：占位符抽取、引擎调用、还原都收在
                    // 斜杠命令走同一个函数，不会再出现「一条路径有保护、另一条没有」。
                    const outcome = await translateWithProtection(
                        messageContent,
                        target_lang,
                        (text, lang) => engine.translate(text, undefined, lang).then(r => r.text)
                    )

                    if (outcome.missing.length > 0) {
                        diagnostics.record({
                            source: "translate",
                            level: "warn",
                            message: `译文丢失了 ${outcome.missing.length} 个标记`,
                            detail: `引擎 ${engine.id} · 目标 ${target_lang} · 原文长度 ${messageContent.length}`
                        })
                    }

                    dispatchContent(messageId, buildFinal(messageContent, outcome.text.trim()))
                    translationCache.remember(messageId, messageContent)
                } catch (e) {
                    diagnostics.record({
                        source: "translate",
                        level: "error",
                        message: "翻译失败",
                        detail: `引擎 ${resolveEngine(settings.translator).id} · 目标 ${settings.target_lang}`,
                        error: e
                    })
                    showToast(Strings.TRANSLATE_FAILED, getAssetIDByName("Small"))
                    logger.error(e)
                }
            }

            const makeRow = (label: string, iconName: string, onPress: () => void) => {
                const source = getAssetIDByName(iconName)
                return React.createElement(ActionSheetRow, {
                    label,
                    icon: React.createElement(ActionSheetRow.Icon, {
                        source,
                        IconComponent: () => (
                            <ReactNative.Image
                                resizeMode="cover"
                                style={styles.iconComponent}
                                source={source}
                            />
                        )
                    }),
                    onPress
                })
            }

            // 已翻译 → 只给还原；未翻译 → 单条与含上下文并列两项，
            // 由用户当场决定翻多少，而不是先去设置里切换开关。
            const rows = alreadyTranslated
                ? [makeRow(Strings.REVERT_MESSAGE, "ic_highlight", () => runTranslate(false))]
                : [
                    makeRow(Strings.TRANSLATE_MESSAGE, "LanguageIcon", () => runTranslate(false)),
                    makeRow(Strings.TRANSLATE_WITH_CONTEXT, "ic_chat_bubble_filled_24px", () => runTranslate(true))
                ]

            // Inject into the first valid ActionSheetRow array inside groups
            if (groups?.length) {
                for (let gi = 0; gi < groups.length; gi++) {
                    const groupChildren: any[] = findInReactTree(
                        groups[gi],
                        (c: any) => Array.isArray(c) && c.some((child: any) => child?.type?.name === "ActionSheetRow")
                    )
                    if (groupChildren) {
                        groupChildren.unshift(...rows)
                        return
                    }
                }
            }

            // Fallback injection if tree searching fails
            const buttons = findInReactTree(component, (x: any) => Array.isArray(x) && x[0]?.type?.name === "ActionSheetRow")
            if (buttons) {
                buttons.unshift(...rows)
            }
        })
    }).catch((err: any) => {
        logger.error("[Translate] Failed to open LazyActionSheet:", err)
    })
})
