import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Image, Link, PhrasingContent, Root, Text } from "mdast";
import type { InlineMath, Math } from "mdast-util-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";
import { visit } from "unist-util-visit";
import { artifactMarkdownPlugin } from "@/lib/artifacts";
import {
  resolveWikiRouteAlias,
  WIKI_LEGACY_REDIRECTS,
} from "@/lib/wiki-legacy-routes";

const PUBLIC_ROOTS = new Set(["learning", "tech", "writing"]);
const FRAGMENT_ROOT = "fragments";
const WIKI_LINK_PATTERN =
  /!?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
const GREEK_SYMBOL_PATTERN = /[α-ωΑ-Ω]/u;
const LATEX_COMMAND_PATTERN =
  /\\(?:alpha|beta|gamma|delta|Delta|epsilon|eta|theta|lambda|mu|nu|pi|rho|sigma|tau|phi|psi|omega|frac|sqrt|sum|prod|int|lim|log|exp|mathcal|mathbf|mathrm|text|operatorname|left|right|begin|end|cdot|times|approx|neq|leq|geq|infty|partial|nabla|hat|bar|tilde|underbrace|overbrace)\b/;
const SUBSCRIPT_OR_SUPERSCRIPT_PATTERN =
  /(?:[A-Za-z0-9)}\]])(?:_(?:[A-Za-z0-9]+|\{[^{}]+\})|\^(?:[A-Za-z0-9*+-]+|\{[^{}]+\}))/;
const MATH_OPERATOR_PATTERN = /(?:=|≈|≠|≤|≥|∑|∏|∫|√|∞|→|←|∝|±|×|·)/u;
const VARIABLE_TOKEN_PATTERN = /\b[A-Za-z][A-Za-z0-9]*\b/g;
const PUBLIC_MEDIA_TYPES = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export type WikiPageSummary = {
  excerpt: string;
  path: string;
  searchText: string;
  slug: string[];
  status: string;
  tags: string[];
  title: string;
  type: string;
  updated: string;
};

export type WikiDirectoryChild = {
  href: string;
  pageCount: number;
  segment: string;
  title: string;
};

export type WikiDirectoryListing = {
  directories: WikiDirectoryChild[];
  pages: WikiPageSummary[];
  slug: string[];
  title: string;
};

export type WikiOutlineItem = {
  depth: number;
  id: string;
  title: string;
};

export type WikiPage = WikiPageSummary & {
  cover: string;
  html: string;
  outline: WikiOutlineItem[];
};

export type AlgorithmCatalogSection = {
  questions: { id: string; title: string }[];
  slug: string;
  title: string;
};

type WikiDocument = WikiPageSummary & {
  coverSource: string;
  markdown: string;
};

type WikiLinkContext = {
  allTargets: Set<string>;
  externalSources: Map<string, string>;
  publishedRoutes: Set<string>;
};

type WikiLinkCatalog = Pick<
  WikiLinkContext,
  "allTargets" | "externalSources"
>;

export type WikiMediaAsset = {
  contentType: string;
  fileName: string;
  filePath: string;
  publicPath: string;
};

export type FragmentPage = {
  content: string;
  paragraphs: string[];
  path: string;
  slug: string;
  title: string;
  updated: string;
};

const wikiLinkCatalogCache = new Map<string, WikiLinkCatalog>();
const wikiMediaCatalogCache = new Map<string, WikiMediaAsset[]>();
const ALGORITHM_CATEGORIES = [
  ["hash", "哈希"],
  ["two-pointers", "双指针"],
  ["sliding-window", "滑动窗口"],
  ["substring", "子串"],
  ["array", "普通数组"],
  ["matrix", "矩阵"],
  ["linked-list", "链表"],
  ["binary-tree", "二叉树"],
  ["graph", "图论"],
  ["backtracking", "回溯"],
  ["binary-search", "二分查找"],
  ["stack", "栈"],
  ["heap", "堆"],
  ["greedy", "贪心算法"],
  ["dynamic-programming", "动态规划"],
  ["multi-dim-dp", "多维动态规划"],
  ["misc", "其他"],
] as const;

export function getWikiRoot(): string {
  const configuredPath = process.env.COREPEDIA_WIKI_PATH?.trim();

  return configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(process.cwd(), "..", "corepedia", "wikis");
}

export function getWikiPages(): WikiPageSummary[] {
  return loadWikiDocuments().map(toPageSummary);
}

export function getWikiStaticParamSlugs(): string[][] {
  const pages = getWikiPages();
  if (!pages.length) {
    return [];
  }

  const seen = new Set<string>();
  const slugs: string[][] = [];

  const add = (parts: string[]) => {
    const route = parts.join("/");
    if (!route || seen.has(route)) {
      return;
    }
    seen.add(route);
    slugs.push(parts);
  };

  for (const page of pages) {
    add(page.slug);
    for (const prefix of directoryPrefixes(page.slug)) {
      add(prefix);
    }
  }

  for (const [from, to] of Object.entries(WIKI_LEGACY_REDIRECTS)) {
    if (seen.has(to) && !seen.has(from)) {
      add(from.split("/"));
    }
  }

  return slugs;
}

export function getWikiDirectoryListing(
  slug: string[],
): WikiDirectoryListing | null {
  if (!slug.length) {
    return null;
  }

  const prefix = slug.join("/");
  const descendants = getWikiPages().filter(
    (page) =>
      page.slug.length > slug.length &&
      page.slug.slice(0, slug.length).join("/") === prefix,
  );
  if (!descendants.length) {
    return null;
  }

  const directories = new Map<string, WikiDirectoryChild>();
  const pages: WikiPageSummary[] = [];

  for (const page of descendants) {
    const segment = page.slug[slug.length];
    if (page.slug.length === slug.length + 1) {
      pages.push(page);
      continue;
    }

    const childPrefix = [...slug, segment];
    const href = `/wiki/${childPrefix.join("/")}/`;
    const existing = directories.get(segment);
    if (existing) {
      existing.pageCount += 1;
      continue;
    }

    directories.set(segment, {
      href,
      pageCount: 1,
      segment,
      title: formatWikiSlugSegment(segment),
    });
  }

  return {
    directories: [...directories.values()].sort((left, right) =>
      left.title.localeCompare(right.title, "zh-CN"),
    ),
    pages: pages.sort((left, right) =>
      left.title.localeCompare(right.title, "zh-CN"),
    ),
    slug,
    title: formatWikiSlugSegment(slug.at(-1) || prefix),
  };
}

export function getAlgorithmCatalog(): AlgorithmCatalogSection[] {
  const documents = loadWikiDocuments();

  return ALGORITHM_CATEGORIES.map(([slug, title]) => {
    const path = `learning/algorithms/${slug}.md`;
    const document = documents.find((candidate) => candidate.path === path);
    if (!document) {
      throw new Error(`Missing algorithm category page: ${path}`);
    }

    const questions = extractLeetCodeQuestions(document.markdown);
    if (!questions.length) {
      throw new Error(`Algorithm category has no LeetCode questions: ${path}`);
    }

    return { questions, slug, title };
  });
}

export function getFragmentPages(): FragmentPage[] {
  const wikiRoot = getWikiRoot();
  const fragmentDirectory = path.join(wikiRoot, FRAGMENT_ROOT);
  if (!existsSync(wikiRoot) || !existsSync(fragmentDirectory)) {
    return [];
  }

  assertFragmentIsolation(wikiRoot);

  return readMarkdownFiles(fragmentDirectory)
    .filter(
      (filePath) =>
        !["AGENTS.md", "index.md"].includes(path.basename(filePath)),
    )
    .map((filePath) => parseFragmentPage(wikiRoot, filePath))
    .filter((page): page is FragmentPage => page !== null)
    .sort((left, right) => left.path.localeCompare(right.path, "zh-CN"));
}

export function getWikiMediaAssets(): WikiMediaAsset[] {
  const wikiRoot = getWikiRoot();
  const cached = wikiMediaCatalogCache.get(wikiRoot);
  if (cached) {
    return cached;
  }

  const assets = new Map<string, WikiMediaAsset>();

  for (const document of loadWikiDocuments()) {
    const coverAsset = resolveWikiMediaAsset(
      document.path,
      document.coverSource,
    );
    if (coverAsset) {
      assets.set(coverAsset.fileName, coverAsset);
    }

    const tree = unified().use(remarkParse).parse(document.markdown);
    visit(tree, "image", (node: Image) => {
      const asset = resolveWikiMediaAsset(document.path, node.url);
      if (asset) {
        assets.set(asset.fileName, asset);
      }
    });
  }

  const catalog = [...assets.values()].sort((left, right) =>
    left.fileName.localeCompare(right.fileName),
  );
  wikiMediaCatalogCache.set(wikiRoot, catalog);
  return catalog;
}

export function getWikiMediaAsset(fileName: string): WikiMediaAsset | null {
  return (
    getWikiMediaAssets().find((asset) => asset.fileName === fileName) ?? null
  );
}

export { getWikiLegacyRedirect } from "@/lib/wiki-legacy-routes";

export async function getWikiPageBySlug(
  slug: string[],
): Promise<WikiPage | null> {
  const documents = loadWikiDocuments();
  const route = resolveWikiRouteAlias(slug.join("/"));
  const document = documents.find((candidate) => candidate.slug.join("/") === route);

  if (!document) {
    return null;
  }

  const linkContext: WikiLinkContext = {
    ...getWikiLinkCatalog(),
    publishedRoutes: publishedWikiRoutes(
      documents.map((candidate) => candidate.slug),
    ),
  };
  const { html, outline } = await renderMarkdown(
    document.markdown,
    document.path,
    linkContext,
  );
  const cover =
    resolveWikiMediaAsset(document.path, document.coverSource)?.publicPath || "";

  return { ...toPageSummary(document), cover, html, outline };
}

function loadWikiDocuments(): WikiDocument[] {
  const wikiRoot = getWikiRoot();

  if (!existsSync(wikiRoot)) {
    return [];
  }

  const documents = readMarkdownFiles(wikiRoot)
    .map((filePath) => parseWikiDocument(wikiRoot, filePath))
    .filter((document): document is WikiDocument => document !== null);
  const routes = new Set<string>();

  for (const document of documents) {
    const route = document.slug.join("/");

    if (routes.has(route)) {
      throw new Error(`Duplicate public wiki route: ${route}`);
    }

    routes.add(route);
  }

  return documents.sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path, "zh-CN");
    return pathOrder || left.title.localeCompare(right.title, "zh-CN");
  });
}

function toPageSummary(document: WikiDocument): WikiPageSummary {
  return {
    excerpt: document.excerpt,
    path: document.path,
    searchText: document.searchText,
    slug: document.slug,
    status: document.status,
    tags: document.tags,
    title: document.title,
    type: document.type,
    updated: document.updated,
  };
}

function readMarkdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return readMarkdownFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

function getWikiLinkCatalog(): WikiLinkCatalog {
  const wikiRoot = getWikiRoot();
  const cached = wikiLinkCatalogCache.get(wikiRoot);
  if (cached) {
    return cached;
  }
  if (!existsSync(wikiRoot)) {
    return {
      allTargets: new Set(),
      externalSources: new Map(),
    };
  }

  const allTargets = new Set<string>();
  const externalSources = new Map<string, string>();

  for (const filePath of readMarkdownFiles(wikiRoot)) {
    const relativePath = path
      .relative(wikiRoot, filePath)
      .split(path.sep)
      .join("/");
    const target = wikiTargetForPath(relativePath);
    allTargets.add(target);

    if (target.startsWith("sources/")) {
      const metadata = matter(readFileSync(filePath, "utf8")).data;
      const sourceUrl = publicSourceUrl(metadata);
      if (sourceUrl) {
        externalSources.set(target, sourceUrl);
      }
    }
  }

  const catalog = { allTargets, externalSources };
  wikiLinkCatalogCache.set(wikiRoot, catalog);
  return catalog;
}

function publicSourceUrl(metadata: Record<string, unknown>): string | null {
  for (const field of [
    "source_url",
    "original_url",
    "source_html",
    "source_pdf",
  ]) {
    const value = metadata[field];
    if (typeof value !== "string") {
      continue;
    }

    try {
      const url = new URL(value);
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !isPrivateSourceHost(url.hostname)
      ) {
        return url.toString();
      }
    } catch {}
  }

  return null;
}

function isPrivateSourceHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return [
    "bytedance.com",
    "bytedance.net",
    "byted.org",
    "doubao.com",
    "feishu.cn",
    "larksuite.com",
    "larkoffice.com",
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function parseWikiDocument(
  wikiRoot: string,
  filePath: string,
): WikiDocument | null {
  const relativePath = path.relative(wikiRoot, filePath).split(path.sep).join("/");
  const [root] = relativePath.split("/");

  if (!PUBLIC_ROOTS.has(root)) {
    return null;
  }
  if (path.basename(relativePath) === "index.md") {
    return null;
  }

  const source = readFileSync(filePath, "utf8");
  const parsed = matter(source);
  const slug = routeSlugForPath(relativePath);
  const title = stringValue(parsed.data.title) || titleFromPath(relativePath);
  const searchText = markdownToSearchText(parsed.content);
  const coverSource = stringValue(parsed.data.cover);

  return {
    coverSource,
    excerpt: createExcerpt(searchText),
    markdown: parsed.content,
    path: relativePath,
    searchText: [title, ...stringArray(parsed.data.tags), searchText].join(" "),
    slug,
    status: stringValue(parsed.data.status),
    tags: stringArray(parsed.data.tags),
    title,
    type: stringValue(parsed.data.type),
    updated: dateValue(parsed.data.updated),
  };
}

function parseFragmentPage(
  wikiRoot: string,
  filePath: string,
): FragmentPage | null {
  const relativePath = path.relative(wikiRoot, filePath).split(path.sep).join("/");
  if (!relativePath.startsWith(`${FRAGMENT_ROOT}/`)) {
    return null;
  }

  const parsed = matter(readFileSync(filePath, "utf8"));
  const title = stringValue(parsed.data.title) || titleFromPath(relativePath);
  const content = parsed.content
    .trim()
    .replace(/^#\s+.+(?:\r?\n)+/, "")
    .trim();
  const paragraphs = content
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return {
    content,
    paragraphs,
    path: relativePath,
    slug: wikiTargetForPath(relativePath).split("/").at(-1) || "",
    title,
    updated: dateValue(parsed.data.updated),
  };
}

function assertFragmentIsolation(wikiRoot: string): void {
  const fragmentDirectory = path.join(wikiRoot, FRAGMENT_ROOT);
  if (!existsSync(fragmentDirectory)) {
    return;
  }

  const markdownLinkPattern = /!?\[[^\]]+\]\([^)]+\)/;
  const fragmentReferencePattern =
    /!?\[\[\s*(?:\.?\/)?fragments(?:\/|#|\]|\|)/i;

  for (const filePath of readMarkdownFiles(wikiRoot)) {
    const relativePath = path
      .relative(wikiRoot, filePath)
      .split(path.sep)
      .join("/");
    const source = readFileSync(filePath, "utf8");
    const parsed = matter(source);
    const isFragment = relativePath.startsWith(`${FRAGMENT_ROOT}/`);

    if (isFragment) {
      if (path.basename(filePath) === "AGENTS.md") {
        continue;
      }

      const related = stringArray(parsed.data.related);
      const sourceRefs = stringArray(parsed.data.source_refs);
      if (
        related.length ||
        sourceRefs.length ||
        WIKI_LINK_PATTERN.test(parsed.content) ||
        markdownLinkPattern.test(parsed.content)
      ) {
        WIKI_LINK_PATTERN.lastIndex = 0;
        throw new Error(
          `Fragment pages must remain link-isolated: ${relativePath}`,
        );
      }
      WIKI_LINK_PATTERN.lastIndex = 0;
      continue;
    }

    if (fragmentReferencePattern.test(source)) {
      throw new Error(
        `Public wiki pages must not reference fragments: ${relativePath}`,
      );
    }
  }
}

function directoryPrefixes(slug: string[]): string[][] {
  const prefixes: string[][] = [];
  for (let length = 1; length < slug.length; length += 1) {
    prefixes.push(slug.slice(0, length));
  }
  return prefixes;
}

function publishedWikiRoutes(slugs: string[][]): Set<string> {
  const routes = new Set<string>();
  for (const slug of slugs) {
    routes.add(slug.join("/"));
    for (const prefix of directoryPrefixes(slug)) {
      routes.add(prefix.join("/"));
    }
  }
  return routes;
}

function formatWikiSlugSegment(segment: string): string {
  return segment
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function routeSlugForPath(relativePath: string): string[] {
  return wikiTargetForPath(relativePath).split("/");
}

function wikiTargetForPath(relativePath: string): string {
  const withoutExtension = relativePath.replace(/\.md$/i, "");
  const segments = withoutExtension.split("/");

  if (segments.at(-1) === "index") {
    segments.pop();
  }

  return segments.join("/");
}

function resolvePublishedWikiTarget(
  target: string,
  publishedRoutes: Set<string>,
): string | null {
  const aliased = resolveWikiRouteAlias(target);
  if (publishedRoutes.has(aliased)) {
    return aliased;
  }
  if (publishedRoutes.has(target)) {
    return target;
  }
  return null;
}

function normalizeWikiTarget(target: string): string | null {
  const normalized = target
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.?\//, "")
    .replace(/\.md$/i, "")
    .replace(/\/index$/, "");

  if (
    !normalized ||
    normalized.split("/").some((segment) => segment === ".." || segment === "")
  ) {
    return null;
  }

  return normalized;
}

function wikiLinkPlugin(linkContext: WikiLinkContext): Plugin<[], Root> {
  return () => (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (typeof index !== "number" || !parent) {
        return;
      }

      const replacements = replaceWikiLinks(node, linkContext);

      if (replacements.length === 1 && replacements[0] === node) {
        return;
      }

      parent.children.splice(index, 1, ...replacements);
      return index + replacements.length;
    });
  };
}

function formulaCodePlugin(): Plugin<[], Root> {
  return () => (tree) => {
    visit(tree, "paragraph", (node, index, parent) => {
      if (
        typeof index !== "number" ||
        !parent ||
        node.children.length !== 1 ||
        node.children[0].type !== "inlineCode" ||
        !isFormulaLikeInlineCode(node.children[0].value)
      ) {
        return;
      }

      const value = normalizeFormula(node.children[0].value);
      const mathNode: Math = {
        type: "math",
        meta: null,
        value,
        data: {
          hName: "pre",
          hChildren: [
            {
              type: "element",
              tagName: "code",
              properties: {
                className: ["language-math", "math-display"],
              },
              children: [{ type: "text", value }],
            },
          ],
        },
      };
      parent.children.splice(index, 1, mathNode);
    });

    visit(tree, "inlineCode", (node, index, parent) => {
      if (
        typeof index !== "number" ||
        !parent ||
        !isFormulaLikeInlineCode(node.value)
      ) {
        return;
      }

      const value = normalizeFormula(node.value);
      const mathNode: InlineMath = {
        type: "inlineMath",
        value,
        data: {
          hName: "code",
          hProperties: {
            className: ["language-math", "math-inline"],
          },
          hChildren: [{ type: "text", value }],
        },
      };
      parent.children.splice(index, 1, mathNode);
    });
  };
}

function isFormulaLikeInlineCode(value: string): boolean {
  const formula = value.trim();
  if (!formula || formula.includes("\n") || formula.length > 500) {
    return false;
  }
  if (
    /(?:https?:\/\/|\/[A-Za-z0-9._-]+|--[A-Za-z-]+|[A-Za-z0-9_-]+\.(?:md|tsx?|jsx?|json|ya?ml|py|go|rs|sh|css|html))/.test(
      formula,
    )
  ) {
    return false;
  }

  const hasGreek = GREEK_SYMBOL_PATTERN.test(formula);
  const hasLatexCommand = LATEX_COMMAND_PATTERN.test(formula);
  const hasScript = SUBSCRIPT_OR_SUPERSCRIPT_PATTERN.test(formula);
  const hasMathOperator = MATH_OPERATOR_PATTERN.test(formula);
  const hasCompleteGroup = /\{[^{}]+\}/.test(formula);
  const variableCount = formula.match(VARIABLE_TOKEN_PATTERN)?.length ?? 0;

  return (
    (hasLatexCommand && (hasMathOperator || hasScript || hasCompleteGroup)) ||
    (hasGreek && hasScript) ||
    (hasMathOperator && (hasGreek || hasScript)) ||
    (hasMathOperator && hasScript && variableCount >= 2)
  );
}

function normalizeFormula(value: string): string {
  return value
    .trim()
    .replace(
      /\b([A-Za-z]{2,})(?=_(?:[A-Za-z0-9]+|\{))/g,
      "\\operatorname{$1}",
    )
    .replace(/([α-ωΑ-Ω])/gu, (symbol) => GREEK_TO_LATEX[symbol] || symbol)
    .replaceAll("ᵀ", "^{\\mathsf T}")
    .replaceAll("−", "-")
    .replaceAll("×", "\\times ")
    .replaceAll("≈", "\\approx ")
    .replaceAll("≤", "\\leq ")
    .replaceAll("≥", "\\geq ")
    .replaceAll("≠", "\\neq ");
}

const GREEK_TO_LATEX: Record<string, string> = {
  α: "\\alpha",
  β: "\\beta",
  γ: "\\gamma",
  δ: "\\delta",
  Δ: "\\Delta",
  ε: "\\epsilon",
  η: "\\eta",
  θ: "\\theta",
  λ: "\\lambda",
  μ: "\\mu",
  ν: "\\nu",
  π: "\\pi",
  ρ: "\\rho",
  σ: "\\sigma",
  τ: "\\tau",
  φ: "\\phi",
  ψ: "\\psi",
  ω: "\\omega",
};

function replaceWikiLinks(
  node: Text,
  linkContext: WikiLinkContext,
): PhrasingContent[] {
  const replacements: PhrasingContent[] = [];
  let cursor = 0;

  for (const match of node.value.matchAll(WIKI_LINK_PATTERN)) {
    const offset = match.index ?? 0;

    if (offset > cursor) {
      replacements.push({
        type: "text",
        value: node.value.slice(cursor, offset),
      });
    }

    const target = normalizeWikiTarget(match[1]);
    const heading = match[2]?.trim();
    const label = match[3]?.trim() || target?.split("/").at(-1) || match[1];
    const isEmbed = match[0].startsWith("!");

    const publishedTarget = target
      ? resolvePublishedWikiTarget(target, linkContext.publishedRoutes)
      : null;

    if (!isEmbed && publishedTarget) {
      const link: Link = {
        children: [{ type: "text", value: label }],
        data: {
          hProperties: {
            className: ["wiki-link", "wiki-link-internal"],
            title: `内部页面：${publishedTarget}`,
          },
        },
        type: "link",
        url: `/wiki/${publishedTarget}/${heading ? `#${headingToId(heading)}` : ""}`,
      };
      replacements.push(link);
    } else if (
      !isEmbed &&
      target &&
      linkContext.externalSources.has(target)
    ) {
      const link: Link = {
        children: [{ type: "text", value: label }],
        data: {
          hProperties: {
            className: ["wiki-link", "wiki-link-source"],
            title: `原始来源：${target}`,
          },
        },
        type: "link",
        url: linkContext.externalSources.get(target) as string,
      };
      replacements.push(link);
    } else {
      const exists = Boolean(target && linkContext.allTargets.has(target));
      replacements.push({
        data: {
          hName: "span",
          hProperties: {
            className: [
              "wiki-link-status",
              exists ? "wiki-link-unpublished" : "wiki-link-missing",
            ],
            title: exists
              ? `页面存在，但未在公开网站发布：${target}`
              : `Wiki 中未找到目标：${target || match[1]}`,
          },
        },
        type: "text",
        value: label,
      });
    }

    cursor = offset + match[0].length;
  }

  if (cursor < node.value.length) {
    replacements.push({ type: "text", value: node.value.slice(cursor) });
  }

  return replacements.length ? replacements : [node];
}

async function renderMarkdown(
  markdown: string,
  documentPath: string,
  linkContext: WikiLinkContext,
): Promise<{ html: string; outline: WikiOutlineItem[] }> {
  const outline: WikiOutlineItem[] = [];
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(formulaCodePlugin())
    .use(wikiLinkPlugin(linkContext))
    .use(artifactMarkdownPlugin(documentPath))
    .use(localMediaPlugin(documentPath))
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeHighlight, { detect: true })
    .use(linkMetadataPlugin())
    .use(mediaStatusPlugin())
    .use(rehypeSlug)
    .use(outlinePlugin(outline))
    .use(rehypeStringify)
    .process(protectWikiLinkPipesInTables(markdown));

  return { html: String(result), outline };
}

function outlinePlugin(
  outline: WikiOutlineItem[],
): Plugin<[], import("hast").Root> {
  return () => (tree) => {
    visit(tree, "element", (node) => {
      const match = /^h([2-4])$/.exec(node.tagName);
      const id = String(node.properties.id || "");
      if (!match || !id) {
        return;
      }

      outline.push({
        depth: Number(match[1]),
        id,
        title: hastText(node).trim(),
      });
    });
  };
}

function hastText(node: import("hast").ElementContent): string {
  if (node.type === "text") {
    return node.value;
  }
  if ("children" in node) {
    return node.children.map(hastText).join("");
  }
  return "";
}

function localMediaPlugin(documentPath: string): Plugin<[], Root> {
  return () => (tree) => {
    visit(tree, "image", (node: Image) => {
      const asset = resolveWikiMediaAsset(documentPath, node.url);
      if (asset) {
        node.url = asset.publicPath;
      }
    });
  };
}

function resolveWikiMediaAsset(
  documentPath: string,
  source: string,
): WikiMediaAsset | null {
  const normalizedSource = source.trim();
  if (
    !normalizedSource ||
    /^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(normalizedSource)
  ) {
    return null;
  }

  const sourcePath = normalizedSource.split(/[?#]/, 1)[0];
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(sourcePath);
  } catch {
    return null;
  }

  const wikiRoot = realpathSync(getWikiRoot());
  const documentFilePath = path.resolve(wikiRoot, documentPath);
  const candidatePath = path.resolve(path.dirname(documentFilePath), decodedPath);

  if (!existsSync(candidatePath) || !statSync(candidatePath).isFile()) {
    return null;
  }

  const filePath = realpathSync(candidatePath);
  const relativePath = path.relative(wikiRoot, filePath);
  if (
    !relativePath ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = PUBLIC_MEDIA_TYPES.get(extension);
  if (!contentType) {
    return null;
  }

  const content = readFileSync(filePath);
  if (extension === ".svg" && !isSafeSvg(content.toString("utf8"))) {
    return null;
  }

  const digest = createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 24);
  const fileName = `${digest}${extension}`;

  return {
    contentType,
    fileName,
    filePath,
    publicPath: `/media/${fileName}`,
  };
}

function isSafeSvg(source: string): boolean {
  return ![
    /<\s*(?:embed|foreignObject|iframe|object|script)\b/i,
    /\bon[a-z]+\s*=/i,
    /\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)/i,
  ].some((pattern) => pattern.test(source));
}

function protectWikiLinkPipesInTables(markdown: string): string {
  let inFence = false;

  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence || !/^\s*\|.*\|\s*$/.test(line)) {
        return line;
      }

      return line.replace(
        /(!?\[\[[^\]\n|]+)\|([^\]\n]+\]\])/g,
        "$1\\|$2",
      );
    })
    .join("\n");
}

function linkMetadataPlugin(): Plugin<[], import("hast").Root> {
  return () => (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "a") {
        return;
      }

      const href = String(node.properties.href || "");
      const classes = Array.isArray(node.properties.className)
        ? node.properties.className.map(String)
        : [];

      if (isPrivateHref(href) && typeof index === "number" && parent) {
        let hostname = "内部文档";
        try {
          hostname = new URL(href).hostname;
        } catch {}
        parent.children.splice(index, 1, {
          type: "element",
          tagName: "span",
          properties: {
            className: ["wiki-link-status", "wiki-link-private"],
            title: "内部链接未在公开网站开放",
          },
          children: [{ type: "text", value: hostname }],
        });
        return;
      }

      if (!classes.includes("wiki-link")) {
        classes.push("wiki-link");
      }
      if (/^https?:\/\//.test(href)) {
        classes.push("wiki-link-external");
        node.properties.target = "_blank";
        node.properties.rel = ["noopener", "noreferrer"];
        node.properties.title ||= "外部链接（新窗口打开）";
      } else if (href.startsWith("/") || href.startsWith("#")) {
        classes.push("wiki-link-internal");
        node.properties.title ||= "站内链接";
      }

      node.properties.className = [...new Set(classes)];
    });
  };
}

function isPrivateHref(href: string): boolean {
  try {
    return isPrivateSourceHost(new URL(href).hostname);
  } catch {
    return false;
  }
}

function mediaStatusPlugin(): Plugin<[], import("hast").Root> {
  return () => (tree) => {
    visit(tree, "element", (node, index, parent) => {
      if (
        node.tagName !== "img" ||
        typeof index !== "number" ||
        !parent ||
        !("children" in parent)
      ) {
        return;
      }

      const source = String(node.properties.src || "");
      node.properties.decoding = "async";
      node.properties.loading = "lazy";

      if (/^(?:https?:|data:|\/\/|\/media\/|\/artifacts\/)/.test(source)) {
        return;
      }

      const label = String(node.properties.alt || "图片");
      parent.children.splice(index, 1, {
        type: "element",
        tagName: "span",
        properties: {
          className: ["wiki-media-status", "wiki-media-unavailable"],
          title: `图片资源未发布：${source}`,
        },
        children: [{ type: "text", value: label }],
      });
    });
  };
}

function markdownToSearchText(markdown: string): string {
  return markdown
    .replace(WIKI_LINK_PATTERN, (_match, target: string, _heading, label) => {
      return label || target.split("/").at(-1) || target;
    })
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_[\](){|}\\~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createExcerpt(text: string): string {
  return text.length > 180 ? `${text.slice(0, 180).trim()}…` : text;
}

function extractLeetCodeQuestions(
  markdown: string,
): AlgorithmCatalogSection["questions"] {
  const headings = [...markdown.matchAll(/^##[ \t]+(.+?)\s*$/gm)];

  return headings.flatMap((heading, index) => {
    const sectionStart = (heading.index ?? 0) + heading[0].length;
    const sectionEnd = headings[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(sectionStart, sectionEnd);
    if (!/https:\/\/leetcode\.cn\/problems\//.test(section)) {
      return [];
    }

    const title = heading[1].trim();
    return [{ id: headingToId(title), title }];
  });
}

function headingToId(heading: string): string {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

function titleFromPath(relativePath: string): string {
  const basename = relativePath.split("/").at(-1)?.replace(/\.md$/i, "") || "";
  return basename === "index"
    ? relativePath.split("/").at(-2) || "Wiki"
    : basename;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function dateValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return stringValue(value);
}
