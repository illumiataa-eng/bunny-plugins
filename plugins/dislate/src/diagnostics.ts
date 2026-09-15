/**
 * 诊断记录。
 *
 * 解决的问题：插件的错误原先只有一个出口 —— logger.error()，
 * 而它走的是 Discord 自己的 Logger，只进 logcat，必须接电脑跑 adb 才能看。
 * 用户在设备上能看到的只有一句 "Failed to translate message"，
 * 而被指向的 "Debug Logs" 在设备上根本不存在。
 *
 * 现在错误落在应用内的环形缓冲里，设置页可读、可复制。
 *
 * 本模块不依赖任何运行环境：环境快照与时钟都由调用方注入，
 * 因此全部行为都能从 record/list/format 三个方法穿过（可测）。
 */

export type DiagnosticLevel = "error" | "warn" | "info"

export type DiagnosticSource =
    | "translate"
    | "engine"
    | "patch"
    | "config"
    | "unknown"

export interface DiagnosticEntry {
    at: number
    level: DiagnosticLevel
    source: DiagnosticSource
    message: string
    detail?: string
    /** 归一化后的错误类别，例如「鉴权失败」 */
    errorKind?: string
    /** 针对该类别给出的可操作提示 */
    errorHint?: string
    /** 原始错误文本，便于排查 */
    errorText?: string
}

export interface RecordInput {
    source: DiagnosticSource
    message: string
    level?: DiagnosticLevel
    detail?: string
    error?: unknown
}

export interface Diagnostics {
    readonly size: number
    record(input: RecordInput): void
    list(): DiagnosticEntry[]
    clear(): void
    /** 渲染成可直接复制粘贴的文本 */
    format(): string
}

export interface DiagnosticsOptions {
    /** 环形缓冲容量，默认 50 */
    capacity?: number
    /** 环境快照提供者（生产环境注入 getDebugInfo 的结果） */
    environment?: () => string
    /** 时钟，便于测试 */
    now?: () => number
}

export const DEFAULT_CAPACITY = 50

/** 把任意抛出物转成可读文本。 */
export function describeError(e: unknown): string {
    if (e instanceof Error) return e.message || String(e)
    if (typeof e === "string") return e
    if (e === null) return "null"
    if (e === undefined) return "undefined"
    if (typeof e === "object") {
        try {
            return JSON.stringify(e)
        } catch {
            return String(e)
        }
    }
    return String(e)
}

/**
 * 把错误归类，并给出可操作的提示。
 * 这张表是诊断模块的主要价值：让用户知道下一步该改什么，
 * 而不只是看到一串栈。
 */
export function classifyError(e: unknown): { kind: string; hint?: string } {
    const msg = describeError(e)

    if (/\b(401|403)\b|unauthorized|forbidden|invalid.?(api.?)?key|鉴权/i.test(msg)) {
        return { kind: "鉴权失败", hint: "检查设置里的 API 密钥是否正确、是否过期" }
    }
    if (/\b429\b|rate.?limit|too many requests/i.test(msg)) {
        return { kind: "请求过于频繁", hint: "稍后重试，或降低翻译频率" }
    }
    if (/\b5\d\d\b|internal server error|bad gateway|service unavailable/i.test(msg)) {
        return { kind: "服务端错误", hint: "翻译服务暂时不可用，稍后重试" }
    }
    if (/timeout|timed out|abort/i.test(msg)) {
        return { kind: "请求超时", hint: "检查网络，或换用响应更快的模型" }
    }
    if (/failed to fetch|network|enotfound|econnrefused|econnreset|无法连接/i.test(msg)) {
        return { kind: "网络不可达", hint: "检查接口地址与网络连通性" }
    }
    if (/json|unexpected token|parse/i.test(msg)) {
        return { kind: "响应解析失败", hint: "该接口可能不是 OpenAI 兼容格式" }
    }
    if (/no such|not found|\b404\b/i.test(msg)) {
        return { kind: "接口不存在", hint: "检查 base URL 与模型名是否正确" }
    }
    return { kind: "未知错误" }
}

function formatTime(ts: number): string {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function createDiagnostics(options: DiagnosticsOptions = {}): Diagnostics {
    const capacity = Math.max(1, options.capacity ?? DEFAULT_CAPACITY)
    const now = options.now ?? (() => Date.now())
    const environment = options.environment

    let entries: DiagnosticEntry[] = []

    return {
        get size() {
            return entries.length
        },

        record(input: RecordInput): void {
            const entry: DiagnosticEntry = {
                at: now(),
                level: input.level ?? "error",
                source: input.source,
                message: input.message,
                detail: input.detail
            }

            if (input.error !== undefined) {
                const { kind, hint } = classifyError(input.error)
                entry.errorKind = kind
                entry.errorHint = hint
                entry.errorText = describeError(input.error)
            }

            entries.push(entry)

            // 环形：超出容量时丢最旧的
            if (entries.length > capacity) {
                entries.splice(0, entries.length - capacity)
            }
        },

        list(): DiagnosticEntry[] {
            // 返回副本，避免调用方改动内部状态
            return entries.map(e => ({ ...e }))
        },

        clear(): void {
            entries = []
        },

        format(): string {
            if (entries.length === 0) return "（暂无记录）"

            const lines: string[] = []

            // 最新的排在最前，方便直接读到最近一次失败
            for (const e of [...entries].reverse()) {
                lines.push(`[${formatTime(e.at)}] ${e.source} · ${e.message}`)

                if (e.detail) lines.push(`  ${e.detail}`)

                if (e.errorKind) {
                    const hint = e.errorHint ? ` · 建议：${e.errorHint}` : ""
                    lines.push(`  ${e.errorKind}${hint}`)
                }

                if (e.errorText && e.errorText !== e.message) {
                    lines.push(`  原始：${e.errorText}`)
                }
            }

            if (environment) {
                lines.push("")
                lines.push(`环境：${environment()}`)
            }

            return lines.join("\n")
        }
    }
}
