import { test } from "node:test"
import assert from "node:assert/strict"
import {
    createDiagnostics,
    classifyError,
    describeError,
    DEFAULT_CAPACITY
} from "./diagnostics.ts"

test("记录后可读出，字段完整", () => {
    const d = createDiagnostics({ now: () => 1000 })
    d.record({ source: "translate", message: "翻译失败", detail: "目标 zh-CN" })

    const [entry] = d.list()
    assert.equal(entry.at, 1000)
    assert.equal(entry.level, "error", "默认级别为 error")
    assert.equal(entry.source, "translate")
    assert.equal(entry.message, "翻译失败")
    assert.equal(entry.detail, "目标 zh-CN")
    assert.equal(d.size, 1)
})

test("带 error 的记录会自动归一化并附提示", () => {
    const d = createDiagnostics()
    d.record({
        source: "engine",
        message: "引擎请求失败",
        error: new Error("HTTP 401 Unauthorized")
    })

    const [entry] = d.list()
    assert.equal(entry.errorKind, "鉴权失败")
    assert.match(entry.errorHint ?? "", /API 密钥/)
    assert.match(entry.errorText ?? "", /401/)
})

test("环形：超出容量时丢弃最旧的", () => {
    const d = createDiagnostics({ capacity: 3 })

    for (let i = 1; i <= 5; i++) {
        d.record({ source: "patch", message: `第 ${i} 条` })
    }

    const messages = d.list().map(e => e.message)
    assert.equal(d.size, 3)
    assert.deepEqual(messages, ["第 3 条", "第 4 条", "第 5 条"])
})

test("默认容量生效", () => {
    const d = createDiagnostics()
    for (let i = 0; i < DEFAULT_CAPACITY + 10; i++) {
        d.record({ source: "patch", message: `${i}` })
    }
    assert.equal(d.size, DEFAULT_CAPACITY)
})

test("clear 清空全部记录", () => {
    const d = createDiagnostics()
    d.record({ source: "patch", message: "a" })
    d.record({ source: "patch", message: "b" })

    d.clear()

    assert.equal(d.size, 0)
    assert.deepEqual(d.list(), [])
})

test("list 返回副本，外部改动不影响内部", () => {
    const d = createDiagnostics()
    d.record({ source: "patch", message: "原始" })

    const snapshot = d.list()
    snapshot[0].message = "被改了"

    assert.equal(d.list()[0].message, "原始")
})

test("format 最新在最前，含归一化结论与环境", () => {
    const d = createDiagnostics({
        now: () => new Date(2026, 8, 15, 22, 41, 3).getTime(),
        environment: () => "Revenge 1.11.6 · Discord 344013"
    })

    d.record({ source: "translate", message: "第一次失败" })
    d.record({
        source: "engine",
        message: "第二次失败",
        detail: "引擎 llm · 目标 zh-CN",
        error: new Error("Request timed out")
    })

    const text = d.format()

    assert.match(text, /\[22:41:03\]/)
    assert.match(text, /引擎 llm · 目标 zh-CN/)
    assert.match(text, /请求超时/)
    assert.match(text, /环境：Revenge 1.11.6 · Discord 344013/)

    // 最新一条应排在前面
    assert.ok(
        text.indexOf("第二次失败") < text.indexOf("第一次失败"),
        "最新的记录排在最前"
    )
})

test("空记录时 format 给出明确提示而非空串", () => {
    const d = createDiagnostics()
    assert.equal(d.format(), "（暂无记录）")
})

test("级别可自定义，默认是 error", () => {
    const d = createDiagnostics()
    d.record({ source: "config", message: "密钥未填", level: "warn" })

    assert.equal(d.list()[0].level, "warn")
})

// ── 错误归一化：这是诊断模块对用户的主要价值 ──────────────────

test("classifyError 按错误文本给出类别与可操作提示", () => {
    const cases: Array<[string, string]> = [
        ["HTTP 401 Unauthorized", "鉴权失败"],
        ["invalid api key", "鉴权失败"],
        ["HTTP 429 Too Many Requests", "请求过于频繁"],
        ["rate limit exceeded", "请求过于频繁"],
        ["HTTP 500 Internal Server Error", "服务端错误"],
        ["Request timed out after 20000ms", "请求超时"],
        ["Failed to fetch", "网络不可达"],
        ["ECONNREFUSED", "网络不可达"],
        ["Unexpected token < in JSON at position 0", "响应解析失败"],
        ["No such model: foo", "接口不存在"],
        ["某种没见过的错误", "未知错误"]
    ]

    for (const [message, expected] of cases) {
        assert.equal(classifyError(new Error(message)).kind, expected, message)
    }
})

test("鉴权失败带可操作提示", () => {
    const { kind, hint } = classifyError(new Error("401"))
    assert.equal(kind, "鉴权失败")
    assert.ok(hint && hint.length > 0)
})

test("describeError 处理各类抛出物", () => {
    assert.equal(describeError(new Error("boom")), "boom")
    assert.equal(describeError("plain string"), "plain string")
    assert.equal(describeError(undefined), "undefined")
    assert.equal(describeError(null), "null")
    assert.equal(describeError(42), "42")
    assert.equal(describeError({ a: 1 }), '{"a":1}')
})

test("describeError 对循环引用不抛错", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    assert.doesNotThrow(() => describeError(cyclic))
})
