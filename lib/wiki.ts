import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type {
  Link,
  PhrasingContent,
  Root,
  Text,
} from "mdast";
import type { InlineMath, Math } from "mdast-util-math";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";
import { visit } from "unist-util-visit";

const PUBLIC_ROOTS = new Set(["learning", "tech", "writing"]);
const WIKI_LINK_PATTERN =
  /!?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
const GREEK_SYMBOL_PATTERN = /[α-ωΑ-Ω]/u;
const LATEX_COMMAND_PATTERN =
  /\\(?:alpha|beta|gamma|delta|Delta|epsilon|eta|theta|lambda|mu|nu|pi|rho|sigma|tau|phi|psi|omega|frac|sqrt|sum|prod|int|lim|log|exp|mathcal|mathbf|mathrm|text|operatorname|left|right|begin|end|cdot|times|approx|neq|leq|geq|infty|partial|nabla|hat|bar|tilde|underbrace|overbrace)\b/;
const SUBSCRIPT_OR_SUPERSCRIPT_PATTERN =
  /(?:[A-Za-z0-9)}\]])(?:_(?:[A-Za-z0-9]+|\{[^{}]+\})|\^(?:[A-Za-z0-9*+-]+|\{[^{}]+\}))/;
const MATH_OPERATOR_PATTERN = /(?:=|≈|≠|≤|≥|∑|∏|∫|√|∞|→|←|∝|±|×|·)/u;
const VARIABLE_TOKEN_PATTERN = /\b[A-Za-z][A-Za-z0-9]*\b/g;

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

export type WikiPage = WikiPageSummary & {
  html: string;
};

type WikiDocument = WikiPageSummary & {
  markdown: string;
};

export function getWikiRoot(): string {
  const configuredPath = process.env.COREPEDIA_WIKI_PATH?.trim();

  return configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(process.cwd(), "..", "corepedia", "wikis");
}

export function getWikiPages(): WikiPageSummary[] {
  return loadWikiDocuments().map(toPageSummary);
}

export async function getWikiPageBySlug(
  slug: string[],
): Promise<WikiPage | null> {
  const documents = loadWikiDocuments();
  const route = slug.join("/");
  const document = documents.find((candidate) => candidate.slug.join("/") === route);

  if (!document) {
    return null;
  }

  const publishedRoutes = new Set(
    documents.map((candidate) => candidate.slug.join("/")),
  );
  const html = await renderMarkdown(document.markdown, publishedRoutes);

  return { ...toPageSummary(document), html };
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

function parseWikiDocument(
  wikiRoot: string,
  filePath: string,
): WikiDocument | null {
  const relativePath = path.relative(wikiRoot, filePath).split(path.sep).join("/");
  const [root] = relativePath.split("/");

  if (!PUBLIC_ROOTS.has(root)) {
    return null;
  }

  const source = readFileSync(filePath, "utf8");
  const parsed = matter(source);
  const slug = routeSlugForPath(relativePath);
  const title = stringValue(parsed.data.title) || titleFromPath(relativePath);
  const searchText = markdownToSearchText(parsed.content);

  return {
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

function routeSlugForPath(relativePath: string): string[] {
  const withoutExtension = relativePath.replace(/\.md$/i, "");
  const segments = withoutExtension.split("/");

  if (segments.at(-1) === "index") {
    segments.pop();
  }

  return segments;
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

function wikiLinkPlugin(publishedRoutes: Set<string>): Plugin<[], Root> {
  return () => (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (typeof index !== "number" || !parent) {
        return;
      }

      const replacements = replaceWikiLinks(node, publishedRoutes);

      if (replacements.length === 1 && replacements[0].type === "text") {
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
  publishedRoutes: Set<string>,
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

    if (!isEmbed && target && publishedRoutes.has(target)) {
      const link: Link = {
        children: [{ type: "text", value: label }],
        type: "link",
        url: `/wiki/${target}/${heading ? `#${headingToId(heading)}` : ""}`,
      };
      replacements.push(link);
    } else {
      replacements.push({ type: "text", value: label });
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
  publishedRoutes: Set<string>,
): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(formulaCodePlugin())
    .use(wikiLinkPlugin(publishedRoutes))
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeSlug)
    .use(rehypeStringify)
    .process(markdown);

  return String(result);
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
