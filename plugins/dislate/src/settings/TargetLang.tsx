import { getAssetIDByName } from "@vendetta/ui/assets"
import { React, ReactNative } from "@vendetta/metro/common"
import { Forms, Search } from "@vendetta/ui/components"
import { showToast } from "@vendetta/ui/toasts"
import { useProxy } from "@vendetta/storage"
import { settings } from ".."
import { resolveEngine } from "../api"
import { Strings } from "../strings"

const { FormRow } = Forms
const { ScrollView } = ReactNative

export default () => {
    useProxy(settings)
    const [query, setQuery] = React.useState("")

    // 语言表来自当前引擎，而不是按引擎 id 分两个几乎逐字重复的分支。
    // 加引擎后这里无需改动。
    const languages = resolveEngine(settings.translator).languages
    const needle = query.toLowerCase()
    const matches = Object.entries(languages)
        .filter(([name]) => name.toLowerCase().includes(needle))

    return (<ScrollView style={{ flex: 1 }}>
        <Search
            style={{ padding: 15 }}
            placeholder={Strings.SEARCH_LANGUAGE}
            onChangeText={(text: string) => {
                setQuery(text)
            }}
        />
        {
            matches.map(([name, value]) => <FormRow
                key={name}
                label={name}
                trailing={() => <FormRow.Arrow />}
                onPress={() => {
                    if (settings.target_lang == value) return
                    settings.target_lang = value
                    showToast(Strings.TARGET_LANG_SAVED(name), getAssetIDByName("check"))
                }}
            />)
        }
    </ScrollView>)
}
