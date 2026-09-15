/**
 * 界面文案。
 *
 * 原先 14 条面向用户的字符串散在 5 个文件、3 个目录里
 * （patches/、settings/、api/），改一处措辞要跨文件找。
 * 汉化时尤其难受：漏改一条就出现中英混排，而且不容易发现。
 *
 * 集中到这里之后：
 *   - 汉化 = 改这一个文件
 *   - 以后要接多语言，这里就是现成的接缝
 */

export const Strings = {
    // ── 长按消息菜单 ──────────────────────────────────────────
    TRANSLATE_MESSAGE: "翻译消息",
    REVERT_MESSAGE: "还原消息",

    // ── 斜杠命令 ──────────────────────────────────────────────
    COMMAND_DESC: "翻译文本并以消息发送",
    COMMAND_OPT_TEXT: "要翻译的文本",
    COMMAND_OPT_TEXT_DESC: "交给 Dislate 翻译的内容",
    COMMAND_OPT_LANG: "目标语言",
    COMMAND_OPT_LANG_DESC: "翻译成哪种语言",
    CONFIRM_SEND_TITLE: "确认要发送吗？",
    CONFIRM_SEND_YES: "发送",
    CONFIRM_SEND_NO: "取消",

    // ── 设置主页 ──────────────────────────────────────────────
    IMMERSIVE: "沉浸式翻译",
    IMMERSIVE_DESC: "同时显示原文与译文",
    BATCH: "批量翻译",
    BATCH_DESC: (before: number, after: number) =>
        `连带上下文一起翻（上 ${before} 条 / 下 ${after} 条），已翻译的自动跳过`,
    TRANSLATE_TO: "翻译为",
    ENGINE: "翻译引擎",
    LLM_SETTINGS: "LLM 设置",
    LLM_SETTINGS_DESC: "接口地址 / 密钥 / 模型",
    DIAGNOSTICS: "诊断日志",
    DIAGNOSTICS_DESC: "查看最近的错误与环境信息，可复制",

    // ── 语言选择 ──────────────────────────────────────────────
    SEARCH_LANGUAGE: "搜索语言",
    TARGET_LANG_SAVED: (name: string) => `目标语言已设为 ${name}`,

    // ── 引擎选择 ──────────────────────────────────────────────
    ENGINE_SAVED: (name: string) => `翻译引擎已设为 ${name}`,

    // ── LLM 配置 ──────────────────────────────────────────────
    LLM_BASE_URL: "接口地址",
    LLM_BASE_URL_DESC: "OpenAI 兼容端点，不含末尾的 /chat/completions",
    LLM_KEY: "API 密钥",
    LLM_KEY_DESC: "仅存本机；建议用限额专用密钥",
    LLM_MODEL: "模型名",
    LLM_MODEL_DESC: "例如 deepseek-chat / gpt-4o-mini / qwen2.5",
    LLM_TEST: "测试连接",
    LLM_TEST_DESC: "发一条短文本给接口，确认配置可用",
    LLM_TEST_OK: (sample: string) => `连接成功：${sample}`,
    LLM_TEST_FAIL: (reason: string) => `连接失败：${reason}`,
    LLM_PROVIDERS_HINT:
        "DeepSeek: https://api.deepseek.com/v1 · OpenAI: https://api.openai.com/v1",

    // ── 诊断页 ────────────────────────────────────────────────
    DIAGNOSTICS_SECTION: "诊断日志",
    DIAGNOSTICS_COPY: "复制全部",
    DIAGNOSTICS_COPY_DESC: "粘贴给维护者即可定位问题",
    DIAGNOSTICS_REFRESH: "刷新",
    DIAGNOSTICS_CLEAR: "清空记录",
    DIAGNOSTICS_COPIED: "已复制到剪贴板",
    DIAGNOSTICS_CLEARED: "已清空",

    // ── 运行期提示 ────────────────────────────────────────────
    TRANSLATE_FAILED: "翻译失败，可在设置 → 诊断日志查看原因"
} as const
