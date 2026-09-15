import { test } from "node:test"
import assert from "node:assert/strict"
import {
    registerEngine,
    resolveEngine,
    resolveEngineId,
    listEngines,
    __resetRegistry,
    type TranslationEngine
} from "./engine.ts"

function fakeEngine(id: string, label: string): TranslationEngine {
    return {
        id,
        label,
        languages: { "English": "en" },
        async translate(text) {
            return { source_lang: undefined, text: `${id}:${text}` }
        }
    }
}

function seeded() {
    __resetRegistry()
    registerEngine(fakeEngine("deepl", "DeepL"))
    registerEngine(fakeEngine("google", "Google Translate"))
}

test("按 id 解析引擎，分派到对应实现", async () => {
    seeded()
    const engine = resolveEngine("deepl")

    assert.equal(engine.id, "deepl")
    const result = await engine.translate("hi", undefined, "en")
    assert.equal(result.text, "deepl:hi")
})

test("迁移：旧版数字 0 → deepl，1 → google", () => {
    seeded()

    assert.equal(resolveEngineId(0), "deepl", "旧设置 0 是 DeepL")
    assert.equal(resolveEngineId(1), "google", "旧设置 1 是 Google Translate")
    assert.equal(resolveEngine(0).label, "DeepL")
})

test("未注册的值回退到默认引擎，不抛错", () => {
    seeded()

    assert.equal(resolveEngineId("确实不存在的引擎"), "google")
    assert.equal(resolveEngineId(99), "google")
})

test("undefined / null 回退到默认引擎", () => {
    seeded()

    assert.equal(resolveEngineId(undefined), "google")
    assert.equal(resolveEngineId(null), "google")
})

test("listEngines 保持注册顺序（决定设置页显示顺序）", () => {
    seeded()
    const ids = listEngines().map(e => e.id)

    assert.deepEqual(ids, ["deepl", "google"])
})

test("注册表为空时抛错，而不是静默产出错误译文", () => {
    __resetRegistry()

    assert.throws(() => resolveEngine("deepl"), /没有可用的翻译引擎/)
})

test("重名注册覆盖旧项，不产生重复", () => {
    __resetRegistry()
    registerEngine(fakeEngine("deepl", "旧名"))
    registerEngine(fakeEngine("deepl", "新名"))

    assert.equal(listEngines().length, 1)
    assert.equal(resolveEngine("deepl").label, "新名")
})

test("引擎自带语言表，可从引擎读取而非外部判断", () => {
    __resetRegistry()
    registerEngine({
        ...fakeEngine("x", "X"),
        languages: { "简体中文": "zh-CN", "日本語": "ja" }
    })

    const langs = resolveEngine("x").languages
    assert.equal(langs["简体中文"], "zh-CN")
    assert.equal(Object.keys(langs).length, 2)
})
