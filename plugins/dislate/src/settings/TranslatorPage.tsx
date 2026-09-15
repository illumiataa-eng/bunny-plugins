import { getAssetIDByName } from "@vendetta/ui/assets"
import { React, ReactNative } from "@vendetta/metro/common"
import { Forms } from "@vendetta/ui/components"
import { showToast } from "@vendetta/ui/toasts"
import { useProxy } from "@vendetta/storage"
import { settings } from ".."
import { listEngines, resolveEngineId } from "../api"
import { Strings } from "../strings"

const { FormRow } = Forms
const { ScrollView } = ReactNative

export default () => {
    useProxy(settings)
    const currentId = resolveEngineId(settings.translator)

    // 引擎列表由注册表驱动。加引擎后这里无需改动。
    return (
    <ScrollView style={{ flex: 1 }}>
        {
            listEngines().map(engine => (
                <FormRow
                    key={engine.id}
                    label={engine.label}
                    trailing={() => <FormRow.Arrow />}
                    onPress={() => {
                        if (currentId === engine.id) return
                        settings.translator = engine.id
                        showToast(Strings.ENGINE_SAVED(engine.label), getAssetIDByName("check"))
                    }}
                />
            ))
        }
    </ScrollView>)
}
