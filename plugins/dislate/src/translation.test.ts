import { test } from "node:test"
import assert from "node:assert/strict"
import {
    extractPlaceholders,
    restorePlaceholders,
    translateWithProtection,
    PLACEHOLDER_SOURCES,
    type TranslateFn
} from "./translation.ts"

// ── 覆盖度：这是 C2 的验收标准 ────────────────────────────────

test("十类 Discord 标记全部被抽取", () => {
    const cases: Array<[string, string]> = [
        ["自定义表情", "<:kappa:123456789>"],
        ["动画表情", "<a:dance:123456789>"],
        ["角色提及", "<@&123456789>"],          // 原先漏掉
        ["用户提及", "<@123456789>"],
        ["昵称提及", "<@!123456789>"],
        ["频道提及", "<#123456789>"],
        ["时间戳", "<t:1737000000:R>"],         // 原先漏掉
        ["斜杠命令", "</ping:123456789>"],      // 原先漏掉
        ["服务器导引", "<id:browse>"],          // 原先漏掉
        ["行内代码", "`npm install`"]
    ]

    for (const [name, marker] of cases) {
        const { values, text } = extractPlaceholders(`前 ${marker} 后`)
        assert.equal(values.length, 1, `${name} 应被抽取`)
        assert.equal(values[0], marker, `${name} 原值应保留`)
        assert.ok(text.includes("[[0]]"), `${name} 应替换为占位符`)
        assert.ok(!text.includes(marker), `${name} 不应留在待译文本里`)
    }
})

test("时间戳无样式后缀也能抽取", () => {
    const { values } = extractPlaceholders("<t:1737000000>")
    assert.deepEqual(values, ["<t:1737000000>"])
})

test("代码块可跨行抽取", () => {
    const block = "```js\nconst a = 1\n```"
    const { values, text } = extractPlaceholders(`看看 ${block} 这段`)

    assert.equal(values.length, 1)
    assert.equal(values[0], block)
    assert.ok(text.includes("[[0]]"))
})

test("Markdown 链接只保护地址，保留可翻译的文字与链接语法", () => {
    const { values, text } = extractPlaceholders("见 [文档](https://example.com/a?b=1)")

    assert.deepEqual(values, ["https://example.com/a?b=1"])
    assert.ok(text.includes("[文档]"), "链接文字应留给翻译")
    assert.ok(text.includes("([[0]])"), "链接语法应完整保留")
    assert.ok(!text.includes("example.com"), "地址应被保护")
})

test("裸 URL 也被保护，不送进翻译引擎", () => {
    const { values, text } = extractPlaceholders("看这个 https://example.com/x?y=1 吧")

    assert.deepEqual(values, ["https://example.com/x?y=1"])
    assert.ok(text.includes("[[0]]"))
})

// ── 往返一致性 ────────────────────────────────────────────────

test("抽取后还原可完全复原原文（无标记损耗）", () => {
    const original = "hey <@123> 看 <#456> 和 <@&789> 再跑 `npm test` 谢谢"

    const { text, values } = extractPlaceholders(original)
    const result = restorePlaceholders(text, values)

    assert.equal(result.text, original)
    assert.deepEqual(result.missing, [])
    assert.equal(result.restored, values.length)
})

test("多个相同标记各自独立，不互相串位", () => {
    const original = "<@1> 和 <@1> 还有 <@2>"
    const { values } = extractPlaceholders(original)

    assert.deepEqual(values, ["<@1>", "<@1>", "<@2>"])
})

test("无标记的文本原样通过", () => {
    const { text, values } = extractPlaceholders("就是一句普通的话")

    assert.equal(text, "就是一句普通的话")
    assert.deepEqual(values, [])
})

// ── 还原的健壮性 ──────────────────────────────────────────────

test("容忍模型在占位符内部加的空格", () => {
    const result = restorePlaceholders("你好 [[ 0 ]] 世界", ["<@123>"])
    assert.equal(result.text, "你好 <@123> 世界")
    assert.equal(result.restored, 1)
})

test("模型吞掉占位符时报告缺失索引", () => {
    const result = restorePlaceholders("译文里没有标记", ["<@1>", "<@2>"])

    assert.deepEqual(result.missing, [0, 1])
    assert.equal(result.restored, 0)
    assert.equal(result.text, "译文里没有标记")
})

test("越界编号不被当成占位符替换", () => {
    const result = restorePlaceholders("这里 [[9]] 越界了", ["<@1>"])

    assert.equal(result.text, "这里 [[9]] 越界了")
    assert.deepEqual(result.missing, [0])
})

test("模型调换占位符顺序时按编号正确还原", () => {
    const result = restorePlaceholders("[[1]] 然后 [[0]]", ["<@甲>", "<@乙>"])
    assert.equal(result.text, "<@乙> 然后 <@甲>")
})

// ── 端到端：两条触发路径共用的入口 ────────────────────────────

test("translateWithProtection 保护标记并还原", async () => {
    // 假引擎：模拟「翻译文字但原样保留 [[n]]」的模型行为
    const fake: TranslateFn = async text => `译:${text}`

    const outcome = await translateWithProtection("hello <@123> world", "zh-CN", fake)

    assert.equal(outcome.text, "译:hello <@123> world")
    assert.equal(outcome.placeholders, 1)
    assert.deepEqual(outcome.missing, [])
})

test("translateWithProtection 把待译文本单独交给引擎（标记不在其中）", async () => {
    let seen = ""
    const spy: TranslateFn = async text => {
        seen = text
        return text
    }

    await translateWithProtection("hi <@123>", "zh-CN", spy)

    assert.equal(seen, "hi [[0]]", "引擎看到的应当是占位符，而不是提及语法")
})

test("translateWithProtection 报告被吞掉的标记", async () => {
    // 模拟不听话的模型：把占位符丢了
    const bad: TranslateFn = async () => "只有译文"

    const outcome = await translateWithProtection("a <@1> b <#2>", "zh-CN", bad)

    assert.deepEqual(outcome.missing, [0, 1])
    assert.equal(outcome.sent, "a [[0]] b [[1]]")
})

test("translateWithProtection 对无标记文本不做多余处理", async () => {
    const fake: TranslateFn = async text => text.toUpperCase()

    const outcome = await translateWithProtection("plain text", "zh-CN", fake)

    assert.equal(outcome.text, "PLAIN TEXT")
    assert.equal(outcome.placeholders, 0)
    assert.deepEqual(outcome.missing, [])
})

test("translateWithProtection 向上传播引擎错误", async () => {
    const failing: TranslateFn = async () => {
        throw new Error("HTTP 401")
    }

    await assert.rejects(
        () => translateWithProtection("hi", "zh-CN", failing),
        /401/
    )
})

test("模式表非空且每条都是合法正则", () => {
    assert.ok(PLACEHOLDER_SOURCES.length >= 10)
    for (const source of PLACEHOLDER_SOURCES) {
        assert.doesNotThrow(() => new RegExp(source), source)
    }
})
