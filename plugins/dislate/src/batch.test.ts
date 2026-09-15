import { test } from "node:test"
import assert from "node:assert/strict"
import {
    selectContextWindow,
    untranslatableReason,
    buildBatchRequest,
    parseNumberedItems,
    translateBatch,
    DEFAULT_WINDOW_BEFORE,
    DEFAULT_WINDOW_AFTER,
    type WindowMessage,
    type ContextWindow
} from "./batch.ts"

function msg(id: string, content: string, extra: Partial<WindowMessage> = {}): WindowMessage {
    return { id, content, type: 0, state: "SENT", ...extra }
}

/** 7 条消息，目标是中间那条（m4） */
const CHANNEL: WindowMessage[] = [
    msg("m1", "第一条"),
    msg("m2", "第二条"),
    msg("m3", "第三条"),
    msg("m4", "目标消息"),
    msg("m5", "第五条"),
    msg("m6", "第六条"),
    msg("m7", "第七条")
]

// ── 窗口选择 ──────────────────────────────────────────────────

test("默认上下各取 2 条，共 5 条，目标在正中", () => {
    const w = selectContextWindow(CHANNEL, "m4")

    assert.deepEqual(w.messages.map(m => m.id), ["m2", "m3", "m4", "m5", "m6"])
    assert.equal(w.targetIndex, 2, "目标应在窗口正中")
    assert.equal(w.messages[w.targetIndex].id, "m4")
})

test("默认参数是上下各 2（共 5 条）", () => {
    assert.equal(DEFAULT_WINDOW_BEFORE, 2)
    assert.equal(DEFAULT_WINDOW_AFTER, 2)
})

test("窗宽可配置", () => {
    const wide = selectContextWindow(CHANNEL, "m4", { before: 3, after: 3 })
    assert.deepEqual(wide.messages.map(m => m.id), ["m1", "m2", "m3", "m4", "m5", "m6", "m7"])
    assert.equal(wide.targetIndex, 3)

    const narrow = selectContextWindow(CHANNEL, "m4", { before: 1, after: 1 })
    assert.deepEqual(narrow.messages.map(m => m.id), ["m3", "m4", "m5"])
})

test("靠近边界时不越界，窗口收缩", () => {
    const w = selectContextWindow(CHANNEL, "m1")

    assert.deepEqual(w.messages.map(m => m.id), ["m1", "m2", "m3"])
    assert.equal(w.targetIndex, 0)
})

test("目标不存在时返回空窗口", () => {
    const w = selectContextWindow(CHANNEL, "不存在")

    assert.deepEqual(w.messages, [])
    assert.equal(w.targetIndex, -1)
})

// ── 跳过规则 ──────────────────────────────────────────────────

test("跳过规则 · 没有文本内容（纯图 / 纯表情）", () => {
    const channel = [
        msg("a", "有字"),
        msg("img", "   ", { type: 0 }),
        msg("target", "目标")
    ]
    const w = selectContextWindow(channel, "target", { before: 2, after: 0 })

    assert.ok(!w.messages.some(m => m.id === "img"))
    assert.ok(w.skipped.some(s => s.id === "img" && s.reason.includes("没有文本")))
})

test("跳过规则 · 系统消息（type 不在 0/19/21）", () => {
    const channel = [
        msg("sys", "某某加入了服务器", { type: 7 }),
        msg("target", "目标")
    ]
    const w = selectContextWindow(channel, "target", { before: 2, after: 0 })

    assert.deepEqual(w.messages.map(m => m.id), ["target"])
    assert.ok(w.skipped.some(s => s.id === "sys" && s.reason.includes("系统消息")))
})

test("跳过规则 · 状态异常（发送中 / 失败）", () => {
    const channel = [
        msg("pending", "还在发", { state: "SENDING" }),
        msg("target", "目标")
    ]
    const w = selectContextWindow(channel, "target", { before: 2, after: 0 })

    assert.deepEqual(w.messages.map(m => m.id), ["target"])
    assert.ok(w.skipped.some(s => s.id === "pending" && s.reason.includes("状态异常")))
})

test("跳过规则 · 已屏蔽", () => {
    const channel = [
        msg("blocked", "被屏蔽的", { blocked: true }),
        msg("target", "目标")
    ]
    const w = selectContextWindow(channel, "target", { before: 2, after: 0 })

    assert.deepEqual(w.messages.map(m => m.id), ["target"])
    assert.ok(w.skipped.some(s => s.id === "blocked" && s.reason.includes("屏蔽")))
})

test("跳过规则 · 已翻译的跳过，避免重复翻译浪费", () => {
    const channel = [
        msg("done", "已经翻过了"),
        msg("fresh", "还没翻"),
        msg("target", "目标")
    ]
    const w = selectContextWindow(channel, "target", {
        before: 2,
        after: 0,
        alreadyTranslated: new Set(["done"])
    })

    assert.deepEqual(w.messages.map(m => m.id), ["fresh", "target"])
    assert.ok(w.skipped.some(s => s.id === "done" && s.reason === "已翻译"))
})

test("目标自身已翻译时，不在窗口选择层拦截（还原由调用方决定）", () => {
    // 窗口选择只管「能不能翻」，已翻译的目标仍会被选中
    const w = selectContextWindow(CHANNEL, "m4", { alreadyTranslated: new Set(["m4"]) })

    assert.equal(w.targetIndex >= 0, true)
    assert.equal(w.messages[w.targetIndex].id, "m4")
})

test("目标不可翻译时整个窗口为空并记录原因", () => {
    const channel = [msg("a", "有字"), msg("img", "", { type: 0 })]
    const w = selectContextWindow(channel, "img")

    assert.deepEqual(w.messages, [])
    assert.equal(w.targetIndex, -1)
    assert.ok(w.skipped.some(s => s.id === "img"))
})

test("跳过占位后继续外扩，凑够可用条数", () => {
    const channel = [
        msg("m1", "一"),
        msg("img1", "", { type: 0 }),
        msg("m2", "二"),
        msg("target", "目标")
    ]
    const w = selectContextWindow(channel, "target", { before: 2, after: 0 })

    // img1 被跳过，但名额由更远的 m1 补上
    assert.deepEqual(w.messages.map(m => m.id), ["m1", "m2", "target"])
})

test("untranslatableReason 对正常消息返回 null", () => {
    assert.equal(untranslatableReason(msg("a", "正常")), null)
    assert.equal(untranslatableReason(msg("a", "回复内容", { type: 19 })), null)
    assert.equal(untranslatableReason(msg("a", "帖子开头", { type: 21 })), null)
})

// ── 请求组装 ──────────────────────────────────────────────────

test("请求正文带编号，逐行对应", () => {
    const text = buildBatchRequest([
        { id: "a", text: "hello" },
        { id: "b", text: "world" }
    ])

    assert.equal(text, "1. hello\n2. world")
})

// ── 响应解析 ──────────────────────────────────────────────────

test("解析标准编号输出", () => {
    const parsed = parseNumberedItems("1. 你好\n2. 世界", 2)
    assert.deepEqual(parsed, ["你好", "世界"])
})

test("容忍多种编号写法", () => {
    assert.deepEqual(parseNumberedItems("1) 甲\n2) 乙", 2), ["甲", "乙"])
    assert.deepEqual(parseNumberedItems("[1] 甲\n[2] 乙", 2), ["甲", "乙"])
    assert.deepEqual(parseNumberedItems("#1 甲\n#2 乙", 2), ["甲", "乙"])
    assert.deepEqual(parseNumberedItems("1: 甲\n2: 乙", 2), ["甲", "乙"])
})

test("编号乱序也按编号归位", () => {
    const parsed = parseNumberedItems("2. 乙\n1. 甲", 2)
    assert.deepEqual(parsed, ["甲", "乙"])
})

test("模型合并行时按编号切分", () => {
    const parsed = parseNumberedItems("1. 甲 2. 乙 3. 丙", 3)
    // 同一行里只有一个编号，其余算作该条的续行
    assert.equal(parsed[0], "甲 2. 乙 3. 丙")
    assert.equal(parsed[1], null)
})

test("缺项返回 null，不伪造内容", () => {
    const parsed = parseNumberedItems("1. 只有第一条", 3)
    assert.deepEqual(parsed, ["只有第一条", null, null])
})

test("多行译文归入同一条", () => {
    const parsed = parseNumberedItems("1. 第一行\n第二行\n2. 下一条", 2)
    assert.equal(parsed[0], "第一行\n第二行")
    assert.equal(parsed[1], "下一条")
})

test("不把正文里的数字误判为编号", () => {
    const parsed = parseNumberedItems("1. 2024 年我们做了很多事", 1)
    assert.equal(parsed[0], "2024 年我们做了很多事")
})

test("越界编号不写入结果", () => {
    const parsed = parseNumberedItems("1. 甲\n9. 越界", 2)
    assert.deepEqual(parsed, ["甲", null])
})

// ── 端到端 ────────────────────────────────────────────────────

function windowOf(ids: string[]): ContextWindow {
    return {
        messages: ids.map(id => msg(id, `${id} 的内容`)),
        targetIndex: Math.floor(ids.length / 2),
        skipped: []
    }
}

test("translateBatch 一次请求翻译整窗，编号一一对应", async () => {
    let calls = 0
    const fake = async (prompt: string) => {
        calls += 1
        // 逐行回显编号并加前缀，模拟听话的模型
        return prompt
            .split("\n")
            .map(line => line.replace(/^(\d+)\.\s*/, "$1. 译:"))
            .join("\n")
    }

    const outcome = await translateBatch(windowOf(["a", "b", "c"]), "zh-CN", fake)

    assert.equal(calls, 1, "整窗只发一次请求")
    assert.equal(outcome.items.length, 3)
    assert.deepEqual(outcome.items.map(i => i.text), [
        "译:a 的内容",
        "译:b 的内容",
        "译:c 的内容"
    ])
    assert.equal(outcome.complete, true)
})

test("translateBatch 保护各条消息里的标记并分别还原", async () => {
    const w: ContextWindow = {
        messages: [msg("a", "hi <@1>"), msg("b", "see <#2>")],
        targetIndex: 0,
        skipped: []
    }

    // 模拟听话的模型：保留编号与占位符，只翻译文字
    const fake = async (prompt: string) =>
        prompt.split("\n").map(line => line.replace(/^(\d+\.\s*)/, "$1译:")).join("\n")

    const outcome = await translateBatch(w, "zh-CN", fake)

    assert.ok(outcome.sent.includes("[[0]]"), "请求里应是占位符而非提及语法")
    assert.ok(!outcome.sent.includes("<@1>"), "原始标记不应进入请求")
    assert.equal(outcome.items[0].text, "译:hi <@1>", "标记被还原")
    assert.equal(outcome.items[1].text, "译:see <#2>")
    assert.equal(outcome.complete, true)
})

test("translateBatch 报告某条丢失标记", async () => {
    const w: ContextWindow = {
        messages: [msg("a", "hi <@1>"), msg("b", "plain")],
        targetIndex: 1,
        skipped: []
    }

    // 模型把第一条的占位符吞了
    const fake = async () => "1. 你好\n2. 普通"

    const outcome = await translateBatch(w, "zh-CN", fake)

    assert.deepEqual(outcome.items[0].missing, [0])
    assert.deepEqual(outcome.items[1].missing, [])
    assert.equal(outcome.complete, true)
})

test("translateBatch 对没翻出来的条目给出 undefined 而非假内容", async () => {
    const fake = async () => "1. 只有第一条"

    const outcome = await translateBatch(windowOf(["a", "b", "c"]), "zh-CN", fake)

    assert.equal(outcome.items[0].text, "1. 只有第一条".replace(/^\d+\.\s*/, ""))
    assert.equal(outcome.items[1].text, undefined)
    assert.equal(outcome.items[2].text, undefined)
    assert.equal(outcome.complete, false, "有条目缺失时应标记为不完整")
})

test("translateBatch 向上传播引擎错误", async () => {
    const failing = async () => {
        throw new Error("HTTP 429")
    }

    await assert.rejects(
        () => translateBatch(windowOf(["a"]), "zh-CN", failing),
        /429/
    )
})

test("translateBatch 保留请求正文供诊断", async () => {
    const fake = async (prompt: string) => prompt
    const outcome = await translateBatch(windowOf(["a", "b"]), "zh-CN", fake)

    assert.equal(outcome.sent, "1. a 的内容\n2. b 的内容")
})
