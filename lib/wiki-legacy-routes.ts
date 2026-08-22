/**
 * Old public wiki routes after pages moved under tech/llm/agent-harness/.
 * Keys and values are slug paths without a leading slash or trailing slash.
 */
export const WIKI_LEGACY_REDIRECTS: Record<string, string> = {
  "tech/llm/agent-harness-complete-exit":
    "tech/llm/agent-harness/deepseek-harness/complete-exit",
  "tech/llm/claude-code-subagent-lifecycle":
    "tech/llm/agent-harness/claude-code/subagent-lifecycle",
  "tech/llm/codex-claude-code-subagent-mechanisms":
    "tech/llm/agent-harness/codex-claude-code-subagent-mechanisms",
  "tech/llm/codex-goal-runtime": "tech/llm/agent-harness/codex/goal-runtime",
  "tech/llm/codex-multi-agent-control-plane":
    "tech/llm/agent-harness/codex/multi-agent-control-plane",
  "tech/llm/codex-subagent-lifecycle":
    "tech/llm/agent-harness/codex/subagent-lifecycle",
  "tech/llm/deepseek-agi-strategy":
    "tech/llm/agent-harness/deepseek-harness/agi-strategy",
  "tech/llm/pi-agent-harness": "tech/llm/agent-harness/pi-agent/harness",
};

export function getWikiLegacyRedirect(slug: string[]): string | null {
  return WIKI_LEGACY_REDIRECTS[slug.join("/")] ?? null;
}

export function resolveWikiRouteAlias(target: string): string {
  return WIKI_LEGACY_REDIRECTS[target] ?? target;
}
