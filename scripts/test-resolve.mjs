/**
 * 测试用模块解析钩子。
 *
 * 生产代码里的相对 import 不带扩展名（`from "./translation"`），
 * 这符合 bundler 的习惯，rollup 也能解析。但 Node 的原生 ESM
 * 要求显式扩展名，直接跑测试会 ERR_MODULE_NOT_FOUND。
 *
 * 这个钩子补上扩展名推断，从而让测试可以 import 生产模块本身，
 * 而不必为了可测性去改动生产代码的 import 风格。
 */
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js"]

const HAS_EXTENSION = /\.[cm]?[jt]sx?$/

export async function resolve(specifier, context, next) {
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../")

    if (isRelative && !HAS_EXTENSION.test(specifier) && context.parentURL) {
        const base = new URL(specifier, context.parentURL)

        for (const ext of EXTENSIONS) {
            const candidate = new URL(base.href + ext)
            if (existsSync(fileURLToPath(candidate))) {
                return next(candidate.href, context)
            }
        }
    }

    return next(specifier, context)
}
