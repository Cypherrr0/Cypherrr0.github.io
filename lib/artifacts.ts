import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import type { Code, Root, RootContent } from "mdast";
import remarkParse from "remark-parse";
import { unified, type Plugin } from "unified";
import { visit } from "unist-util-visit";

const PUBLIC_ROOTS = ["learning", "tech", "writing"] as const;
const ARTIFACT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_ROLES = new Set([
  "calculator",
  "demo",
  "diagram",
  "explorer",
  "game",
  "model",
  "simulation",
  "timeline",
]);
const ALLOWED_CAPABILITIES = new Set([
  "audio",
  "fullscreen",
  "pointer-lock",
  "wasm",
  "worker",
]);
const ALLOWED_MANIFEST_FIELDS = new Set([
  "activation",
  "artifactRole",
  "aspectRatio",
  "budget",
  "capabilities",
  "concept",
  "description",
  "entry",
  "height",
  "id",
  "interaction",
  "kind",
  "network",
  "preview",
  "schemaVersion",
  "title",
]);
const REQUIRED_PROTOCOL_TOKENS = [
  "artifact:ready",
  "corepedia:init",
  "corepedia:motion",
  "corepedia:pause",
  "corepedia:reset",
  "corepedia:resume",
  "corepedia:visibility",
];
const FORBIDDEN_HTML_PATTERNS = [
  /<\s*(?:base|embed|footer|form|header|iframe|nav|object)\b/i,
  /<\s*(?:link|script)\b[^>]+\b(?:href|src)\s*=/i,
  /\bhttp-equiv\s*=\s*["']?refresh/i,
  /\bon[a-z]+\s*=/i,
  /\b(?:href|src|srcset|action|formaction)\s*=\s*["']\s*(?!data:image\/)/i,
];
const FORBIDDEN_SCRIPT_PATTERNS = [
  /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/,
  /\b(?:localStorage|sessionStorage|indexedDB|caches|cookieStore)\b/,
  /\bserviceWorker\b/,
  /\bdocument\s*\.\s*cookie\b/,
  /\bwindow\s*\.\s*open\b/,
  /\b(?:window\s*\.\s*)?(?:top|opener|location)\b\s*(?:=|\.)/,
  /\b(?:eval|Function)\s*\(/,
  /\bimport\s*\(/,
];
const FORBIDDEN_STYLE_PATTERNS = [
  /\b(?:linear|radial|conic)-gradient\s*\(/i,
  /\bbox-shadow\s*:/i,
  /\btext-shadow\s*:/i,
  /\bbackdrop-filter\s*:/i,
  /\bfilter\s*:\s*blur\s*\(/i,
  /@font-face/i,
];
const ALLOWED_COLORS = new Set([
  "#171716",
  "#6d6d67",
  "#b8b8b1",
  "#d8d8d2",
  "#ecece7",
  "#f5f5f2",
]);
const REQUIRED_DESIGN_TOKENS = new Map([
  ["--ink", "#171716"],
  ["--line", "#d8d8d2"],
  ["--muted", "#6d6d67"],
  ["--paper", "#f5f5f2"],
]);
const HEX_COLOR_PATTERN = /#[0-9a-f]{3,8}\b/gi;
const SAFE_SVG_PATTERNS = [
  /<\s*(?:embed|foreignObject|iframe|object|script)\b/i,
  /\bon[a-z]+\s*=/i,
  /\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|javascript:|data:text\/html)/i,
];

type ArtifactHeight = {
  inline: number;
  stage: number;
};

type ArtifactBudget = {
  maxBytes: number;
  maxControls: number;
  maxDomNodes: number;
};

type ArtifactManifest = {
  activation: "click";
  artifactRole: string;
  aspectRatio: string;
  budget: ArtifactBudget;
  capabilities: string[];
  concept: string;
  description: string;
  entry: string;
  height: ArtifactHeight;
  id: string;
  interaction: string;
  kind: "h5";
  network: [];
  preview: string;
  schemaVersion: 1;
  title: string;
};

export type PublishedArtifact = ArtifactManifest & {
  html: string;
  manifestPath: string;
  previewContent: Buffer;
  previewContentType: "image/png" | "image/svg+xml";
  sourceDocumentPath: string;
};

type ArtifactReference = {
  documentPath: string;
  id: string;
};

let artifactCatalogCache: PublishedArtifact[] | null = null;

export function getPublishedArtifacts(): PublishedArtifact[] {
  if (artifactCatalogCache) {
    return artifactCatalogCache;
  }

  const wikiRoot = getWikiRoot();
  if (!existsSync(wikiRoot)) {
    artifactCatalogCache = [];
    return artifactCatalogCache;
  }

  const references = PUBLIC_ROOTS.flatMap((root) =>
    readMarkdownFiles(path.join(wikiRoot, root)).flatMap((filePath) => {
      const documentPath = path
        .relative(wikiRoot, filePath)
        .split(path.sep)
        .join("/");
      const markdown = readFileSync(filePath, "utf8");
      return extractArtifactIds(markdown).map((id) => ({ documentPath, id }));
    }),
  );

  const artifacts = references.map((reference) =>
    loadArtifactForReference(wikiRoot, reference),
  );
  const ids = new Set<string>();

  for (const artifact of artifacts) {
    if (ids.has(artifact.id)) {
      throw new Error(`Duplicate published artifact id: ${artifact.id}`);
    }
    ids.add(artifact.id);
  }

  artifactCatalogCache = artifacts.sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  return artifactCatalogCache;
}

export function getPublishedArtifact(id: string): PublishedArtifact | null {
  return getPublishedArtifacts().find((artifact) => artifact.id === id) ?? null;
}

export function artifactMarkdownPlugin(
  documentPath: string,
): Plugin<[], Root> {
  return () => (tree) => {
    visit(tree, "code", (node: Code, index, parent) => {
      if (
        node.lang !== "artifact" ||
        typeof index !== "number" ||
        !parent ||
        !("children" in parent)
      ) {
        return;
      }

      const id = parseArtifactBlock(node.value, documentPath);
      const artifact = getPublishedArtifact(id);
      if (!artifact || artifact.sourceDocumentPath !== documentPath) {
        throw new Error(
          `Artifact ${id} is not published for ${documentPath}`,
        );
      }

      const artifactNode = {
        type: "text",
        value: "",
        data: {
        hName: "figure",
        hProperties: {
          className: ["wiki-artifact"],
          dataArtifactId: artifact.id,
        },
        hChildren: [
          {
            type: "element",
            tagName: "div",
            properties: {
              className: ["wiki-artifact-stage"],
              style: `--artifact-inline-height: ${artifact.height.inline}px; aspect-ratio: ${artifact.aspectRatio}`,
            },
            children: [
              {
                type: "element",
                tagName: "img",
                properties: {
                  alt: "",
                  ariaHidden: "true",
                  className: ["wiki-artifact-preview"],
                  decoding: "async",
                  loading: "lazy",
                  src: `/artifacts/${artifact.id}/preview`,
                },
                children: [],
              },
              {
                type: "element",
                tagName: "iframe",
                properties: {
                  allow: artifact.capabilities.includes("fullscreen")
                    ? "fullscreen"
                    : "",
                  className: ["wiki-artifact-frame"],
                  loading: "lazy",
                  src: `/artifacts/${artifact.id}/embed/`,
                  title: artifact.title,
                },
                children: [],
              },
            ],
          },
          {
            type: "element",
            tagName: "figcaption",
            properties: {
              className: ["wiki-artifact-caption"],
            },
            children: [
              {
                type: "element",
                tagName: "span",
                properties: {},
                children: [{ type: "text", value: artifact.description }],
              },
              {
                type: "element",
                tagName: "a",
                properties: {
                  className: ["wiki-artifact-open"],
                  href: `/artifacts/${artifact.id}/`,
                  rel: ["noopener"],
                  target: "_blank",
                },
                children: [{ type: "text", value: "单独打开 ↗" }],
              },
            ],
          },
        ],
        },
      } as RootContent;

      parent.children.splice(index, 1, artifactNode);
    });
  };
}

function getWikiRoot(): string {
  const configuredPath = process.env.COREPEDIA_WIKI_PATH?.trim();
  return configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(process.cwd(), "..", "corepedia", "wikis");
}

function readMarkdownFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return readMarkdownFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

function extractArtifactIds(markdown: string): string[] {
  const tree = unified().use(remarkParse).parse(markdown);
  const ids: string[] = [];
  visit(tree, "code", (node: Code) => {
    if (node.lang === "artifact") {
      ids.push(parseArtifactBlock(node.value, "artifact catalog"));
    }
  });
  return ids;
}

function parseArtifactBlock(value: string, documentPath: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(
      `Artifact block in ${documentPath} must contain only "id: <artifact-id>"`,
    );
  }

  const match = /^id:\s*([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(lines[0]);
  if (!match) {
    throw new Error(`Invalid artifact block in ${documentPath}`);
  }
  return match[1];
}

function loadArtifactForReference(
  wikiRoot: string,
  reference: ArtifactReference,
): PublishedArtifact {
  const documentFile = path.resolve(wikiRoot, reference.documentPath);
  const artifactDirectory = path.resolve(
    documentFile.replace(/\.md$/i, ""),
    "artifacts",
    reference.id,
  );
  const manifestPath = path.join(artifactDirectory, "artifact.json");
  const safeArtifactDirectory = realpathInside(
    wikiRoot,
    artifactDirectory,
    `artifact ${reference.id}`,
  );
  const safeManifestPath = realpathInside(
    safeArtifactDirectory,
    manifestPath,
    `manifest ${reference.id}`,
  );

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(readFileSync(safeManifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid artifact manifest ${manifestPath}: ${error}`);
  }

  const manifest = validateManifest(rawManifest, reference.id, manifestPath);
  const entryPath = realpathInside(
    safeArtifactDirectory,
    path.resolve(safeArtifactDirectory, manifest.entry),
    `entry ${reference.id}`,
  );
  const previewPath = realpathInside(
    safeArtifactDirectory,
    path.resolve(safeArtifactDirectory, manifest.preview),
    `preview ${reference.id}`,
  );
  const html = readFileSync(entryPath, "utf8");
  const previewContent = readFileSync(previewPath);
  const totalBytes = directorySize(safeArtifactDirectory);

  if (totalBytes > manifest.budget.maxBytes) {
    throw new Error(
      `Artifact ${reference.id} exceeds ${manifest.budget.maxBytes} bytes`,
    );
  }
  validateArtifactHtml(html, manifest);

  const previewExtension = path.extname(previewPath).toLowerCase();
  if (previewExtension === ".svg") {
    const source = previewContent.toString("utf8");
    if (SAFE_SVG_PATTERNS.some((pattern) => pattern.test(source))) {
      throw new Error(`Unsafe artifact preview SVG: ${reference.id}`);
    }
  } else if (
    previewExtension !== ".png" ||
    !previewContent.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    throw new Error(`Artifact preview must be a valid SVG or PNG: ${reference.id}`);
  }

  return {
    ...manifest,
    html,
    manifestPath: path
      .relative(wikiRoot, safeManifestPath)
      .split(path.sep)
      .join("/"),
    previewContent,
    previewContentType:
      previewExtension === ".svg" ? "image/svg+xml" : "image/png",
    sourceDocumentPath: reference.documentPath,
  };
}

function validateManifest(
  value: unknown,
  expectedId: string,
  manifestPath: string,
): ArtifactManifest {
  if (!isRecord(value)) {
    throw new Error(`Artifact manifest must be an object: ${manifestPath}`);
  }

  const fields = Object.keys(value);
  const unknownFields = fields.filter(
    (field) => !ALLOWED_MANIFEST_FIELDS.has(field),
  );
  const missingFields = [...ALLOWED_MANIFEST_FIELDS].filter(
    (field) => !(field in value),
  );
  if (unknownFields.length || missingFields.length) {
    throw new Error(
      `Artifact manifest fields invalid (${manifestPath}); unknown=${unknownFields.join(",")}; missing=${missingFields.join(",")}`,
    );
  }
  if (
    value.schemaVersion !== 1 ||
    value.kind !== "h5" ||
    value.id !== expectedId ||
    !ARTIFACT_ID_PATTERN.test(expectedId)
  ) {
    throw new Error(`Artifact identity invalid: ${manifestPath}`);
  }
  if (
    typeof value.artifactRole !== "string" ||
    !ALLOWED_ROLES.has(value.artifactRole)
  ) {
    throw new Error(`Artifact role invalid: ${manifestPath}`);
  }

  for (const [field, maxLength] of [
    ["title", 80],
    ["description", 180],
    ["concept", 120],
    ["interaction", 160],
  ] as const) {
    if (
      typeof value[field] !== "string" ||
      !value[field].trim() ||
      value[field].length > maxLength
    ) {
      throw new Error(`Artifact ${field} invalid: ${manifestPath}`);
    }
  }

  if (
    value.activation !== "click" ||
    typeof value.aspectRatio !== "string" ||
    !/^\d{1,2}\s*\/\s*\d{1,2}$/.test(value.aspectRatio) ||
    !Array.isArray(value.network) ||
    value.network.length !== 0
  ) {
    throw new Error(`Artifact display policy invalid: ${manifestPath}`);
  }
  if (
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every(
      (capability) =>
        typeof capability === "string" &&
        ALLOWED_CAPABILITIES.has(capability),
    )
  ) {
    throw new Error(`Artifact capabilities invalid: ${manifestPath}`);
  }
  if (
    typeof value.entry !== "string" ||
    value.entry !== "dist/index.html" ||
    typeof value.preview !== "string" ||
    !/^preview\.(?:png|svg)$/.test(value.preview)
  ) {
    throw new Error(`Artifact files invalid: ${manifestPath}`);
  }
  if (
    !isRecord(value.height) ||
    Object.keys(value.height).sort().join(",") !== "inline,stage" ||
    !integerBetween(value.height.inline, 320, 720) ||
    !integerBetween(value.height.stage, 600, 1080)
  ) {
    throw new Error(`Artifact height invalid: ${manifestPath}`);
  }
  if (
    !isRecord(value.budget) ||
    Object.keys(value.budget).sort().join(",") !==
      "maxBytes,maxControls,maxDomNodes" ||
    !integerBetween(value.budget.maxBytes, 1, 1_048_576) ||
    !integerBetween(value.budget.maxControls, 1, 8) ||
    !integerBetween(value.budget.maxDomNodes, 1, 500)
  ) {
    throw new Error(`Artifact budget invalid: ${manifestPath}`);
  }

  return value as ArtifactManifest;
}

function validateArtifactHtml(
  source: string,
  manifest: ArtifactManifest,
): void {
  if (!/<meta\b[^>]+http-equiv=["']Content-Security-Policy["']/i.test(source)) {
    throw new Error(`Artifact ${manifest.id} is missing a CSP meta tag`);
  }
  if (FORBIDDEN_HTML_PATTERNS.some((pattern) => pattern.test(source))) {
    throw new Error(`Artifact ${manifest.id} contains forbidden HTML`);
  }
  if (FORBIDDEN_SCRIPT_PATTERNS.some((pattern) => pattern.test(source))) {
    throw new Error(`Artifact ${manifest.id} contains forbidden script APIs`);
  }
  if (FORBIDDEN_STYLE_PATTERNS.some((pattern) => pattern.test(source))) {
    throw new Error(`Artifact ${manifest.id} violates the visual policy`);
  }
  for (const [token, color] of REQUIRED_DESIGN_TOKENS) {
    if (!new RegExp(`${token}\\s*:\\s*${color}\\b`, "i").test(source)) {
      throw new Error(`Artifact ${manifest.id} is missing design token ${token}`);
    }
  }
  const unknownColors = [...new Set(source.match(HEX_COLOR_PATTERN) ?? [])]
    .map((color) => color.toLowerCase())
    .filter((color) => !ALLOWED_COLORS.has(color));
  if (unknownColors.length) {
    throw new Error(
      `Artifact ${manifest.id} uses colors outside the Corepedia palette: ${unknownColors.join(", ")}`,
    );
  }
  if (
    REQUIRED_PROTOCOL_TOKENS.some((token) => !source.includes(token)) ||
    !source.includes("window.parent.postMessage")
  ) {
    throw new Error(`Artifact ${manifest.id} does not implement the host protocol`);
  }
  if (!source.includes("prefers-reduced-motion")) {
    throw new Error(`Artifact ${manifest.id} must respect reduced motion`);
  }
}

function realpathInside(root: string, candidate: string, label: string): string {
  if (
    !existsSync(candidate) ||
    (!statSync(candidate).isFile() && !statSync(candidate).isDirectory())
  ) {
    throw new Error(`Missing ${label}: ${candidate}`);
  }
  const realRoot = realpathSync(root);
  const realCandidate = realpathSync(candidate);
  const relative = path.relative(realRoot, realCandidate);
  if (
    !relative ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} escapes its allowed root`);
  }
  return realCandidate;
}

function directorySize(directory: string): number {
  return readdirSync(directory, { withFileTypes: true }).reduce(
    (total, entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Artifact contains a symlink: ${entryPath}`);
      }
      if (entry.isDirectory()) {
        return total + directorySize(entryPath);
      }
      return entry.isFile() ? total + statSync(entryPath).size : total;
    },
    0,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
