import { getAssetIDByName } from "@vendetta/ui/assets"
import { React, ReactNative, stylesheet, constants, NavigationNative, url } from "@vendetta/metro/common"
import { semanticColors } from "@vendetta/ui"
import { Forms } from "@vendetta/ui/components"
import { manifest } from "@vendetta/plugin"
import { useProxy } from "@vendetta/storage"

import { settings } from ".."
import { resolveEngine } from "../api"
import { Strings } from "../strings"
import TargetLang from "./TargetLang"
import TranslatorPage from "./TranslatorPage"
import DiagnosticsPage from "./DiagnosticsPage"
import LLMSettings from "./LLMSettings"

const { ScrollView, Text } = ReactNative
const { FormRow, FormSwitchRow } = Forms

const styles = stylesheet.createThemedStyleSheet({
    subheaderText: {
        color: semanticColors.HEADER_SECONDARY,
        textAlign: 'center',
        margin: 10,
        marginBottom: 50,
        letterSpacing: 0.25,
        fontFamily: constants.Fonts.PRIMARY_BOLD,
        fontSize: 14
    }
})

export default () => {
    const navigation = NavigationNative.useNavigation()
    useProxy(settings)

    const engine = resolveEngine(settings.translator)

    // 显示当前目标语言的名字，而不是 zh-cn 这样的代码
    const targetLanguageName = Object.entries(engine.languages)
        .find(([, code]) => code === settings.target_lang)?.[0]

    const before = settings.batch_before ?? 2
    const after = settings.batch_after ?? 2

    return (
        <ScrollView>
            <FormSwitchRow
                label={Strings.IMMERSIVE}
                subLabel={Strings.IMMERSIVE_DESC}
                leading={<FormRow.Icon source={getAssetIDByName("ic_chat_bubble_filled_24px")} />}
                value={settings.immersive_enabled ?? true}
                onValueChange={(v) => {
                    settings.immersive_enabled = v
                }}
            />

            {/* 不再提供「批量翻译」开关：单条与含上下文已是长按菜单里
                并列的两个入口，选哪个由用户当场决定，无需预先配置。 */}
            <FormRow
                label={Strings.CONTEXT_WINDOW}
                subLabel={Strings.CONTEXT_WINDOW_DESC(before, after)}
                leading={<FormRow.Icon source={getAssetIDByName("ic_message_delete")} />}
            />

            <FormRow
                label={Strings.TRANSLATE_TO}
                subLabel={targetLanguageName ?? settings.target_lang?.toLowerCase()}
                leading={<FormRow.Icon source={getAssetIDByName("ic_activity_24px")} />}
                trailing={() => <FormRow.Arrow />}
                onPress={() => navigation.push("VendettaCustomPage", {
                    title: Strings.TRANSLATE_TO,
                    render: TargetLang,
                })}
            />

            <FormRow
                label={Strings.ENGINE}
                subLabel={engine.label}
                leading={<FormRow.Icon source={getAssetIDByName("ic_locale_24px")} />}
                trailing={() => <FormRow.Arrow />}
                onPress={() => navigation.push("VendettaCustomPage", {
                    title: Strings.ENGINE,
                    render: TranslatorPage,
                })}
            />

            <FormRow
                label={Strings.LLM_SETTINGS}
                subLabel={Strings.LLM_SETTINGS_DESC}
                leading={<FormRow.Icon source={getAssetIDByName("ic_activity_24px")} />}
                trailing={() => <FormRow.Arrow />}
                onPress={() => navigation.push("VendettaCustomPage", {
                    title: Strings.LLM_SETTINGS,
                    render: LLMSettings,
                })}
            />

            <FormRow
                label={Strings.DIAGNOSTICS}
                subLabel={Strings.DIAGNOSTICS_DESC}
                leading={<FormRow.Icon source={getAssetIDByName("ic_message_delete")} />}
                trailing={() => <FormRow.Arrow />}
                onPress={() => navigation.push("VendettaCustomPage", {
                    title: Strings.DIAGNOSTICS,
                    render: DiagnosticsPage,
                })}
            />

            <Text style={styles.subheaderText} onPress={() => url.openURL("https://github.com/Rico040/bunny-plugins")}>
                {`Build: (${manifest.hash.substring(0, 7)})`}
            </Text>
        </ScrollView>
    )
}
