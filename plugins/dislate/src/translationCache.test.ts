import { test } from "node:test"
import assert from "node:assert/strict"
import { createTranslationCache } from "./translationCache.ts"

test("remember 后 has 为真，get 取回原文", () => {
    const cache = createTranslationCache()
    cache.remember("m1", "hello world")

    assert.equal(cache.has("m1"), true)
    assert.equal(cache.get("m1"), "hello world")
    assert.equal(cache.size, 1)
})

test("未记录的消息 has 为假，get 为 undefined", () => {
    const cache = createTranslationCache()

    assert.equal(cache.has("nope"), false)
    assert.equal(cache.get("nope"), undefined)
})

test("forget 移除记录（还原操作）", () => {
    const cache = createTranslationCache()
    cache.remember("m1", "原文")

    cache.forget("m1")

    assert.equal(cache.has("m1"), false)
    assert.equal(cache.get("m1"), undefined)
    assert.equal(cache.size, 0)
})

test("forget 不存在的 id 是安全的", () => {
    const cache = createTranslationCache()
    assert.doesNotThrow(() => cache.forget("不存在"))
})

test("同一 id 重复 remember 覆盖旧值，不增加条目", () => {
    const cache = createTranslationCache()
    cache.remember("m1", "第一次")
    cache.remember("m1", "第二次")

    assert.equal(cache.size, 1)
    assert.equal(cache.get("m1"), "第二次")
})

test("ids 列出全部已翻译消息（批量翻译据此跳过）", () => {
    const cache = createTranslationCache()
    cache.remember("a", "1")
    cache.remember("b", "2")

    assert.deepEqual(cache.ids().sort(), ["a", "b"])
})

test("clear 清空全部", () => {
    const cache = createTranslationCache()
    cache.remember("a", "1")
    cache.remember("b", "2")

    cache.clear()

    assert.equal(cache.size, 0)
    assert.deepEqual(cache.ids(), [])
})

test("空内容也能记录（不因空串漏判已翻译）", () => {
    const cache = createTranslationCache()
    cache.remember("m1", "")

    assert.equal(cache.has("m1"), true, "空串是有效原值")
    assert.equal(cache.get("m1"), "")
})

test("多个缓存实例互不干扰", () => {
    const a = createTranslationCache()
    const b = createTranslationCache()

    a.remember("m1", "A")

    assert.equal(b.has("m1"), false)
})
