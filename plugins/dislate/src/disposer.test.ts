import { test } from "node:test"
import assert from "node:assert/strict"
import { createDisposerBox } from "./disposer.ts"

test("teardown 释放全部已登记项，并按登记顺序执行", () => {
    const box = createDisposerBox()
    const order: string[] = []

    box.track(() => { order.push("first") })
    box.track(() => { order.push("second") })

    const report = box.teardown()

    assert.equal(report.released, 2)
    assert.equal(report.failed, 0)
    assert.deepEqual(order, ["first", "second"])
    assert.equal(box.pending, 0)
})

test("缺陷 2 · 单个 disposer 抛错不阻断其余", () => {
    const box = createDisposerBox()
    const ran: string[] = []

    box.track(() => { ran.push("first") })
    box.track(() => { throw new Error("boom") })
    box.track(() => { ran.push("third") })

    const report = box.teardown()

    assert.deepEqual(ran, ["first", "third"], "抛错的不阻断邻居")
    assert.equal(report.released, 2)
    assert.equal(report.failed, 1)
    assert.equal(report.errors.length, 1)
    assert.match(String((report.errors[0] as Error).message), /boom/)
})

test("缺陷 1 · 创建即登记：后续步骤失败也不丢已登记项", () => {
    const box = createDisposerBox()
    let firstReleased = false

    // 第一步：补丁已注册，立刻登记（新写法）
    box.track(() => { firstReleased = true })

    // 第二步：模拟 patchCommands() 抛错（registerCommand 的空数组路径）
    const patchCommands = () => { throw new Error("lastCommand.id of undefined") }
    assert.throws(patchCommands)

    // 关键：因为登记发生在创建处，teardown 仍能收回第一步。
    // 旧写法 `patches = [patchActionSheet(), patchCommands()]` 在这里会丢失引用。
    const report = box.teardown()

    assert.equal(firstReleased, true, "第一步的补丁被正确回收")
    assert.equal(report.released, 1)
    assert.equal(report.failed, 0)
})

test("缺陷 3 · teardown 幂等，可重复调用", () => {
    const box = createDisposerBox()
    let calls = 0
    box.track(() => { calls += 1 })

    const first = box.teardown()
    const second = box.teardown()

    assert.equal(first.released, 1)
    assert.equal(second.released, 0, "第二次已无待释放项")
    assert.equal(calls, 1, "disposer 不被重复调用")
})

test("teardown 执行期间新登记的项留到下一轮", () => {
    const box = createDisposerBox()
    let innerRan = false

    box.track(() => {
        // 释放过程中又登记了一个（模拟 disposer 内部创建补丁）
        box.track(() => { innerRan = true })
    })

    const report = box.teardown()

    assert.equal(report.released, 1, "本轮只释放快照里的")
    assert.equal(box.pending, 1, "新登记的留待下一轮")
    assert.equal(innerRan, false)

    box.teardown()
    assert.equal(innerRan, true)
})

test("空容器 teardown 安全", () => {
    const box = createDisposerBox()
    const report = box.teardown()

    assert.deepEqual(report, { released: 0, failed: 0, errors: [] })
    assert.equal(box.pending, 0)
})
