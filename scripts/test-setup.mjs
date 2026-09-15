/**
 * 测试入口：注册解析钩子。
 * 用法见 package.json 的 test 脚本。
 */
import { register } from "node:module"

register(new URL("./test-resolve.mjs", import.meta.url))
