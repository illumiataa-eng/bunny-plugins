import { getAssetIDByName } from "@vendetta/ui/assets"
import { React, ReactNative } from "@vendetta/metro/common"
import { Forms } from "@vendetta/ui/components"
import { showToast } from "@vendetta/ui/toasts"
import { useProxy } from "@vendetta/storage"
import { settings } from "../config"
import { diagnostics } from "../state"
import { describeError } from "../diagnostics"
import LLM from "../api/LLM"
import { Strings } from "../strings"

const { ScrollView } = ReactNative
const { FormRow, FormInput, FormSection } = Forms

/** 一组「说明行 + 输入框」，沿用仓库里既有的写法 */
function Field(props: {
    label: string
    subLabel: string
    placeholder: string
    value: string
    keyboardType?: string
    onChange: (v: string) => void
}) {
    return (
        <>
            <FormRow
                label={props.label}
                subLabel={props.subLabel}
                leading={<FormRow.Icon source={getAssetIDByName("ic_pencil_24px")} />}
            />
            <FormInput
                title=""
                keyboardType={props.keyboardType ?? "default"}
                placeholder={props.placeholder}
                value={props.value}
                onChange={props.onChange}
                style={{ marginTop: -25, marginHorizontal: 12 }}
            />
        </>
    )
}

/**
 * LLM 引擎配置。
 *
 * 密钥只存在本机（@vendetta/plugin 的 storage，明文），
 * 绝不写进插件代码 —— 插件 JS 是公开可下载的，等于公开发布密钥。
 */
export default () => {
    useProxy(settings)

    const testConnection = async () => {
        try {
            const result = await LLM.translate("hello", undefined, "zh-CN")
            showToast(Strings.LLM_TEST_OK(result.text.slice(0, 30)), getAssetIDByName("check"))
        } catch (e) {
            diagnostics.record({
                source: "config",
                level: "error",
                message: "LLM 连接测试失败",
                detail: `接口 ${settings.llm_base_url ?? "未填"} · 模型 ${settings.llm_model ?? "未填"}`,
                error: e
            })
            showToast(Strings.LLM_TEST_FAIL(describeError(e).slice(0, 60)), getAssetIDByName("Small"))
        }
    }

    return (
        <ScrollView style={{ flex: 1 }}>
            <FormSection title={Strings.LLM_BASE_URL}>
                <Field
                    label={Strings.LLM_BASE_URL}
                    subLabel={Strings.LLM_BASE_URL_DESC}
                    placeholder="https://api.deepseek.com/v1"
                    value={settings.llm_base_url ?? ""}
                    keyboardType="url"
                    onChange={(v: string) => { settings.llm_base_url = v }}
                />
            </FormSection>

            <FormSection title={Strings.LLM_KEY}>
                <Field
                    label={Strings.LLM_KEY}
                    subLabel={Strings.LLM_KEY_DESC}
                    placeholder="sk-..."
                    value={settings.llm_api_key ?? ""}
                    onChange={(v: string) => { settings.llm_api_key = v }}
                />
            </FormSection>

            <FormSection title={Strings.LLM_MODEL}>
                <Field
                    label={Strings.LLM_MODEL}
                    subLabel={Strings.LLM_MODEL_DESC}
                    placeholder="deepseek-chat"
                    value={settings.llm_model ?? ""}
                    onChange={(v: string) => { settings.llm_model = v }}
                />
            </FormSection>

            <FormSection title={Strings.LLM_TEST}>
                <FormRow
                    label={Strings.LLM_TEST}
                    subLabel={Strings.LLM_TEST_DESC}
                    leading={<FormRow.Icon source={getAssetIDByName("ic_link")} />}
                    onPress={testConnection}
                />
                <FormRow
                    label={Strings.LLM_PROVIDERS_HINT}
                />
            </FormSection>
        </ScrollView>
    )
}
