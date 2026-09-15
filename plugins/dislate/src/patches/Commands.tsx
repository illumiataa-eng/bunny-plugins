import { logger } from "@vendetta"
import { registerCommand } from "@vendetta/commands"
import { ApplicationCommandInputType, ApplicationCommandType, ApplicationCommandOptionType } from "../../../../ApplicationCommandTypes"
import { showToast } from "@vendetta/ui/toasts"
import { getAssetIDByName } from "@vendetta/ui/assets"
import { Codeblock } from "@vendetta/ui/components"
import { showConfirmationAlert } from "@vendetta/ui/alerts"
import { findByProps } from "@vendetta/metro"
import { settings } from ".."

import { resolveEngine } from "../api"
import { translateWithProtection } from "../translation"
import { diagnostics } from "../state"
import { Strings } from "../strings"

const ClydeUtils = findByProps("sendBotMessage")

/**
 * 语言下拉由当前引擎的语言表生成，而不再固定成 DeepL 的表。
 * （原实现硬编码 choices: [...langOptionsDeepL]，导致用户选了
 * Google 之后斜杠命令的语言列表仍是 DeepL 的。）
 *
 * 注意：choices 在命令注册时求值一次，之后切换引擎需重载客户端。
 */
function languageOptions() {
    return Object.entries(resolveEngine(settings.translator).languages).map(([name, value]) => ({
        name,
        displayName: name,
        value
    }))
}

export default () => registerCommand({
    name: "translate",
    displayName: "translate",
    description: Strings.COMMAND_DESC,
    displayDescription: Strings.COMMAND_DESC,
    applicationId: "-1",
    type: ApplicationCommandType.CHAT as number,
    inputType: ApplicationCommandInputType.BUILT_IN_TEXT as number,
    options: [
        {
            name: "text",
            displayName: Strings.COMMAND_OPT_TEXT,
            description: Strings.COMMAND_OPT_TEXT_DESC,
            displayDescription: Strings.COMMAND_OPT_TEXT_DESC,
            type: ApplicationCommandOptionType.STRING as number,
            required: true
        },
        {
            name: "language",
            displayName: Strings.COMMAND_OPT_LANG,
            description: Strings.COMMAND_OPT_LANG_DESC,
            displayDescription: Strings.COMMAND_OPT_LANG_DESC,
            type: ApplicationCommandOptionType.STRING as number,
            // @ts-ignore
            choices: languageOptions(),
            required: true
        }
    ],
    async execute(args, ctx) {
        const [text, lang] = args
        try {
            const engine = resolveEngine(settings.translator)

            // 与长按菜单共用同一个流程，占位符同样受保护。
            // 修复前这条路径完全没有抽取/还原，/translate 里的 <@123>
            // 会被原样送进翻译引擎，被翻坏或吞掉。
            const outcome = await translateWithProtection(
                text.value,
                lang.value,
                (t, l) => engine.translate(t, undefined, l).then(r => r.text)
            )

            if (outcome.missing.length > 0) {
                diagnostics.record({
                    source: "translate",
                    level: "warn",
                    message: `译文丢失了 ${outcome.missing.length} 个标记`,
                    detail: `来源 斜杠命令 · 引擎 ${engine.id} · 目标 ${lang.value}`
                })
            }

            const translated = outcome.text

            return await new Promise((resolve): void => showConfirmationAlert({
                title: Strings.CONFIRM_SEND_TITLE,
                content: (
                    <Codeblock>
                        {translated}
                    </Codeblock>
                    ),
                confirmText: Strings.CONFIRM_SEND_YES,
                onConfirm: () => resolve({ content: translated }),
                cancelText: Strings.CONFIRM_SEND_NO
            }))
        } catch (e) {
            diagnostics.record({
                source: "translate",
                level: "error",
                message: "斜杠命令翻译失败",
                detail: `引擎 ${resolveEngine(settings.translator).id} · 目标 ${lang.value}`,
                error: e
            })
            logger.error(e)
            return ClydeUtils.sendBotMessage(ctx.channel.id, Strings.TRANSLATE_FAILED)
        }
    }
})