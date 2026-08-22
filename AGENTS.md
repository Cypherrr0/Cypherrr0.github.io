<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Wiki 发布规则

- **永远禁止把 `index.md` 显示到前端。** 不要把任何 `index.md` 编进公开页面、搜索、知识图谱或静态路由。目录页只存在于 Corepedia 仓库，给 Obsidian 用。
- 目录 URL（例如 `/wiki/tech/llm/agent-harness/`、`/wiki/tech/llm/agent-harness/claude-code/`）必须按**当前层级**生成：只列出这一层的子目录和本层叶子页，不要渲染该目录下的 `index.md` 正文。
- 叶子 Markdown（非 `index.md`）才是文章。旧叶子路径可以重定向到新叶子路径；不要为了兼容去发布 `index.md`。
