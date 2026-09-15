/**
 * 补丁生命周期容器。
 *
 * 解决的问题：`@vendetta/patcher` 的 before/after/instead 返回一个 unpatch 函数，
 * 如果调用方用 `patches = [patchA(), patchB()]` 这样的数组字面量收集，
 * 那么 patchB() 抛错时赋值永不发生，patchA() 已注册的补丁就永久泄漏 ——
 * 卸载时遍历空数组，什么也清不掉。
 *
 * 本模块让登记发生在创建处：每个 patch 创建后立刻 track()，
 * 此后无论后续步骤是否失败，teardown() 都能收回它。
 */

export type Disposer = () => unknown

export interface TeardownReport {
    /** 成功执行的 disposer 数量 */
    released: number
    /** 执行时抛错的数量 */
    failed: number
    /** 失败原因，按发生顺序 */
    errors: unknown[]
}

export interface DisposerBox {
    /** 当前已登记但尚未释放的数量 */
    readonly pending: number
    /** 登记一个 disposer。应在补丁创建处立即调用。 */
    track(disposer: Disposer): void
    /** 逐个隔离释放全部已登记项，随后清空。可重复调用。 */
    teardown(): TeardownReport
}

export function createDisposerBox(): DisposerBox {
    let tracked: Disposer[] = []

    return {
        get pending() {
            return tracked.length
        },

        track(disposer: Disposer): void {
            tracked.push(disposer)
        },

        teardown(): TeardownReport {
            const report: TeardownReport = { released: 0, failed: 0, errors: [] }

            // 先取快照再清空：若某个 disposer 内部又 track 了新项，
            // 那些新项属于下一轮，不应被本次释放。
            const batch = tracked
            tracked = []

            for (const dispose of batch) {
                try {
                    dispose()
                    report.released += 1
                } catch (e) {
                    // 单个失败不阻断其余，否则一处抛错会让后面全部泄漏
                    report.failed += 1
                    report.errors.push(e)
                }
            }

            return report
        }
    }
}
