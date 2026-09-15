/**
 * 环境快照：诊断模块的 adapter。
 *
 * diagnostics.ts 本身不依赖运行环境，环境信息从这个薄 adapter 注入。
 */
import { getDebugInfo } from "@vendetta/debug"

interface DebugInfo {
    vendetta?: { version?: string; loader?: string }
    bunny?: {
        version?: string
        loader?: { name?: string; version?: string }
    }
    discord?: { version?: string; build?: string }
    react?: { version?: string }
    hermes?: { version?: string }
    os?: { name?: string; version?: string }
    platform?: { name?: string; version?: string }
}

/**
 * 采集一行可读的环境快照，用于诊断输出。
 *
 * 注意：vendetta-types 把 getDebugInfo 声明成 `() => void`，
 * 但 Revenge 运行时实际返回结构化对象，所以这里显式补上真实类型。
 */
export function collectEnvironment(): string {
    try {
        const info = (getDebugInfo as unknown as () => DebugInfo)() ?? {}

        const revengeVersion =
            info.bunny?.version ?? info.vendetta?.version ?? undefined

        const loaderName =
            info.bunny?.loader?.name ?? info.vendetta?.loader ?? undefined

        const discordVersion = info.discord?.version
        const discordBuild = info.discord?.build

        const osName = info.os?.name ?? info.platform?.name
        const osVersion = info.os?.version ?? info.platform?.version

        const parts: string[] = []

        if (revengeVersion) {
            parts.push(loaderName ? `Revenge ${revengeVersion} (${loaderName})` : `Revenge ${revengeVersion}`)
        }

        if (discordVersion) {
            parts.push(discordBuild && discordBuild !== discordVersion
                ? `Discord ${discordVersion}/${discordBuild}`
                : `Discord ${discordVersion}`)
        }

        if (osName) {
            parts.push(osVersion ? `${osName} ${osVersion}` : osName)
        }

        if (info.react?.version) parts.push(`React ${info.react.version}`)

        return parts.length > 0 ? parts.join(" · ") : "环境信息不可用"
    } catch {
        return "环境信息采集失败"
    }
}
