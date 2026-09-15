import { getAssetIDByName } from "@vendetta/ui/assets"
import { React, ReactNative, clipboard } from "@vendetta/metro/common"
import { Forms, Codeblock } from "@vendetta/ui/components"
import { showToast } from "@vendetta/ui/toasts"
import { diagnostics } from "../state"
import { Strings } from "../strings"

const { ScrollView } = ReactNative
const { FormRow, FormSection } = Forms

/**
 * 诊断日志页。
 *
 * Revenge 没有应用内日志查看器，logger.error() 只进 logcat，
 * 用户必须接电脑跑 adb 才能看到出错原因。
 * 这一页把最近若干条错误与环境快照渲染出来，可一键复制。
 */
export default () => {
    const [text, setText] = React.useState(() => diagnostics.format())
    const refresh = () => setText(diagnostics.format())

    return (
        <ScrollView style={{ flex: 1 }}>
            <FormSection title={Strings.DIAGNOSTICS_SECTION}>
                <FormRow
                    label={Strings.DIAGNOSTICS_COPY}
                    subLabel={Strings.DIAGNOSTICS_COPY_DESC}
                    leading={<FormRow.Icon source={getAssetIDByName("ic_pencil_24px")} />}
                    onPress={() => {
                        clipboard.setString(diagnostics.format())
                        showToast(Strings.DIAGNOSTICS_COPIED, getAssetIDByName("check"))
                    }}
                />
                <FormRow
                    label={Strings.DIAGNOSTICS_REFRESH}
                    leading={<FormRow.Icon source={getAssetIDByName("ic_link")} />}
                    onPress={refresh}
                />
                <FormRow
                    label={Strings.DIAGNOSTICS_CLEAR}
                    leading={<FormRow.Icon source={getAssetIDByName("ic_message_delete")} />}
                    onPress={() => {
                        diagnostics.clear()
                        refresh()
                        showToast(Strings.DIAGNOSTICS_CLEARED, getAssetIDByName("check"))
                    }}
                />
            </FormSection>

            <Codeblock selectable={true}>{text}</Codeblock>
        </ScrollView>
    )
}
