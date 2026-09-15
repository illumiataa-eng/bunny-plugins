import { test } from "node:test"
import assert from "node:assert/strict"

// LLM.ts 依赖运行环境（要读配置），但提示词逻辑搬到了 llmPrompt.ts，
// 于是这一层可以脱离 Discord 单独验证。
import {
    buildChatRequest,
    readChatResponse,
    languageName,
    SYSTEM_RULES
} from "./llmPrompt.ts"

// ── 语言名映射 ────────────────────────────────────────────────

test("语言代码转成语言名称，而不是把代码丢给模型", () => {
    assert.equal(languageName("zh-CN"), "Chinese (Simplified)")
    assert.equal(languageName("ja"), "Japanese")
    assert.match(languageName("zh-TW"), /Chinese/)
})

test("未知代码原样返回，缺省时给出兜底措辞", () => {
    assert.equal(languageName("xx-YY"), "xx-YY")
    assert.equal(languageName(undefined), "the target language")
})

// ── 请求结构 ──────────────────────────────────────────────────

test("规则放 system，文本单独放 user", () => {
    const req = buildChatRequest("hello world", "zh-CN", "deepseek-chat")

    assert.equal(req.messages.length, 2)
    assert.equal(req.messages[0].role, "system")
    assert.equal(req.messages[1].role, "user")
    assert.equal(req.messages[1].content, "hello world")
    assert.ok(!req.messages[0].content.includes("hello world"), "文本不应混进 system")
})

test("temperature 为 0（翻译要确定性，不要创意）", () => {
    const req = buildChatRequest("hi", "zh-CN", "m")
    assert.equal(req.temperature, 0)
})

test("模型名透传", () => {
    assert.equal(buildChatRequest("hi", "ja", "qwen2.5").model, "qwen2.5")
})

test("system 里写入了目标语言名称", () => {
    const req = buildChatRequest("hi", "zh-CN", "m")
    assert.match(req.messages[0].content, /Chinese \(Simplified\)/)
    assert.ok(!req.messages[0].content.includes("{target}"), "占位符应已被替换")
})

test("未指定语言时 system 不残留占位符", () => {
    const req = buildChatRequest("hi", undefined, "m")
    assert.ok(!req.messages[0].content.includes("{target}"))
})

// ── 规则内容：这些是调研结论的落地，值得钉住 ──────────────────

test("规则要求只输出译文，禁止解释与反问", () => {
    assert.match(SYSTEM_RULES, /只输出译文/)
    assert.match(SYSTEM_RULES, /不要解释/)
    assert.match(SYSTEM_RULES, /不要询问是否继续/)
})

test("规则要求原样保留占位符", () => {
    assert.match(SYSTEM_RULES, /占位符/)
    assert.match(SYSTEM_RULES, /\[\[0\]\]/)
    assert.match(SYSTEM_RULES, /原样保留/)
})

test("规则要求保留换行与段落结构", () => {
    assert.match(SYSTEM_RULES, /换行/)
})

test("规则覆盖批量翻译所需的逐条对应", () => {
    assert.match(SYSTEM_RULES, /逐条对应/)
    assert.match(SYSTEM_RULES, /编号/)
})

test("规则要求保留语气语体，且不净化粗俗表达", () => {
    assert.match(SYSTEM_RULES, /语气/)
    assert.match(SYSTEM_RULES, /粗俗/)
    assert.match(SYSTEM_RULES, /不要回避/)
})

// ── 响应解析 ──────────────────────────────────────────────────

test("从标准响应里取出译文", () => {
    const data = { choices: [{ message: { role: "assistant", content: "你好世界" } }] }
    assert.equal(readChatResponse(data), "你好世界")
})

test("去掉译文首尾空白", () => {
    const data = { choices: [{ message: { content: "  你好  \n" } }] }
    assert.equal(readChatResponse(data), "你好")
})

test("空内容视为取不到，不返回空串冒充成功", () => {
    assert.equal(readChatResponse({ choices: [{ message: { content: "" } }] }), undefined)
    assert.equal(readChatResponse({ choices: [{ message: { content: "   " } }] }), undefined)
})

test("结构异常时不抛错，返回 undefined", () => {
    assert.equal(readChatResponse({}), undefined)
    assert.equal(readChatResponse({ choices: [] }), undefined)
    assert.equal(readChatResponse({ choices: [{ message: {} }] }), undefined)
    assert.equal(readChatResponse(null), undefined)
    assert.equal(readChatResponse({ choices: [{ message: { content: 123 } }] }), undefined)
})

test("规则里不存在未替换的模板变量", () => {
    // 除了 {target} 之外不该有别的占位符漏网
    const leftover = SYSTEM_RULES.replace("{target}", "").match(/\{[a-zA-Z_]+\}/g)
    assert.equal(leftover, null, `发现未替换的变量: ${leftover}`)
})
