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
  "mobile",
  "network",
  "preview",
  "runtime",
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
const LIEFLAT_META_NAMES = [
  "lieflat-template",
  "lieflat-palette",
  "lieflat-source",
] as const;
const REQUIRED_DESIGN_TOKENS = new Map([
  ["--ink", "#171716"],
  ["--line", "#d8d8d2"],
  ["--muted", "#6d6d67"],
  ["--paper", "#f5f5f2"],
]);
const HEX_COLOR_PATTERN = /#[0-9a-f]{3,8}\b/gi;
const RGB_COLOR_PATTERN =
  /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*((?:0|1)(?:\.\d+)?|\.\d+))?\s*\)/gi;
const CANVAS_BACKGROUND_PATTERN =
  /(?:^|[},])\s*(?:html\s*,\s*body|body|html)\s*\{([^}]*)\}/gi;
const BACKGROUND_DECLARATION_PATTERN =
  /(?:^|;)\s*background(?:-color)?\s*:\s*([^;}{]+)/gi;
const MOTION_DECLARATION_PATTERN =
  /(?:animation|transition)(?:-(?:duration|delay))?\s*:\s*([^;}{]+)/gi;
const TIME_PATTERN = /(\d+(?:\.\d+)?)(ms|s)\b/gi;
const ECHARTS_DURATION_PATTERN =
  /\banimation(?:Duration|Delay)(?:Update)?\s*:\s*(\d+(?:\.\d+)?)/g;
const DYNAMIC_MOTION_PATTERN =
  /(?:animation|transition)(?:-(?:duration|delay))?\s*:[^;}{]*\$\{/i;
const CANVAS_SCRIPT_MUTATION_PATTERN =
  /(?:document\s*\.\s*(?:body|documentElement)|document\s*\.\s*querySelector\s*\(\s*["'](?:body|html)["']\s*\))[\s\S]{0,100}?\.\s*(?:style\s*\.\s*)?background(?:Color)?\s*=/i;
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

export type ArtifactRuntimeIdentity = {
  name: string;
  profile: string;
  version: string;
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
  mobile: "desktop-only" | "supported";
  network: [];
  preview: string;
  runtime?: ArtifactRuntimeIdentity | null;
  schemaVersion: 1;
  title: string;
};

type ArtifactReference = {
  documentPath: string;
  id: string;
};

type LieflatRegistry = {
  approvedTemplates: string[];
  generator: "lieflat-charts";
  paper: "#f5f5f2";
  profiles: Record<string, { colors: string[] }>;
  schemaVersion: 1;
  source: {
    profileRevision: string;
    upstreamRevision: string;
  };
};

type LieflatProfile = {
  colors: Set<string>;
  palette: string;
  source: string;
  template: string;
};

export type PublishedArtifactRuntime = ArtifactRuntimeIdentity & {
  bytes: number;
  global: string;
  maxBytes: number;
  publicPath: string;
  sha256: string;
};

type RuntimeRegistry = {
  runtimes: Array<
    PublishedArtifactRuntime & {
      allowedLieflatPalettes: string[];
      allowedLieflatTemplates: string[];
      license: string;
      packageFile: string;
    }
  >;
  schemaVersion: 1;
};

export type PublishedArtifact = ArtifactManifest & {
  html: string;
  manifestPath: string;
  previewContent: Buffer;
  previewContentType: "image/png" | "image/svg+xml";
  resolvedRuntime: PublishedArtifactRuntime | null;
  sourceDocumentPath: string;
};

let artifactCatalogCache: PublishedArtifact[] | null = null;
let lieflatRegistryCache: LieflatRegistry | null = null;
let runtimeRegistryCache: RuntimeRegistry | null = null;

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
          className: [
            "wiki-artifact",
            artifact.mobile === "desktop-only" ? "is-desktop-only" : "",
          ].filter(Boolean),
          dataArtifactId: artifact.id,
        },
        hChildren: [
          ...(artifact.mobile === "desktop-only"
            ? [
                {
                  type: "element" as const,
                  tagName: "div",
                  properties: {
                    className: ["wiki-artifact-mobile-notice"],
                  },
                  children: [
                    {
                      type: "element" as const,
                      tagName: "strong",
                      properties: {},
                      children: [
                        {
                          type: "text" as const,
                          value: "请使用电脑端打开",
                        },
                      ],
                    },
                    {
                      type: "element" as const,
                      tagName: "span",
                      properties: {},
                      children: [
                        {
                          type: "text" as const,
                          value: "此交互图依赖横向空间关系，手机端仅保留正文说明。",
                        },
                      ],
                    },
                  ],
                },
              ]
            : []),
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
  const lieflatProfile = validateArtifactHtml(html, manifest);
  const resolvedRuntime = resolveArtifactRuntime(
    manifest,
    lieflatProfile,
    html,
  );

  const previewExtension = path.extname(previewPath).toLowerCase();
  if (previewExtension === ".svg") {
    const source = previewContent.toString("utf8");
    if (SAFE_SVG_PATTERNS.some((pattern) => pattern.test(source))) {
      throw new Error(`Unsafe artifact preview SVG: ${reference.id}`);
    }
    const allowedPreviewColors = new Set(ALLOWED_COLORS);
    lieflatProfile?.colors.forEach((color) => allowedPreviewColors.add(color));
    const unknownPreviewColors = [...collectColors(source)].filter(
      (color) => !allowedPreviewColors.has(color),
    );
    if (unknownPreviewColors.length) {
      throw new Error(
        `Artifact preview ${reference.id} uses unapproved colors: ${unknownPreviewColors.join(", ")}`,
      );
    }
    if (
      lieflatProfile &&
      !/<rect\b(?=[^>]*\bfill=["']#f5f5f2["'])(?=[^>]*\b(?:width=["'](?:100%|1600)["']))(?=[^>]*\b(?:height=["'](?:100%|900)["']))[^>]*>/i.test(
        source,
      )
    ) {
      throw new Error(
        `Lieflat preview ${reference.id} must keep a full #f5f5f2 paper background`,
      );
    }
  } else if (
    previewExtension !== ".png" ||
    lieflatProfile ||
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
    resolvedRuntime,
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
    (field) => field !== "runtime" && !(field in value),
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
    (value.mobile !== "desktop-only" && value.mobile !== "supported") ||
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
    value.runtime !== undefined &&
    value.runtime !== null &&
    (!isRecord(value.runtime) ||
      Object.keys(value.runtime).sort().join(",") !== "name,profile,version" ||
      typeof value.runtime.name !== "string" ||
      !value.runtime.name ||
      typeof value.runtime.profile !== "string" ||
      !value.runtime.profile ||
      typeof value.runtime.version !== "string" ||
      !value.runtime.version)
  ) {
    throw new Error(`Artifact runtime identity invalid: ${manifestPath}`);
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
): LieflatProfile | null {
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
  const lieflatProfile = parseLieflatProfile(source, manifest.id);
  const allowedColors = new Set(ALLOWED_COLORS);
  lieflatProfile?.colors.forEach((color) => allowedColors.add(color));
  const unknownColors = [...collectColors(source)].filter(
    (color) => !allowedColors.has(color),
  );
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
  validateCanvasPaper(source, manifest.id);
  if (lieflatProfile) {
    validateLieflatMotion(source, manifest.id);
    if (CANVAS_SCRIPT_MUTATION_PATTERN.test(source)) {
      throw new Error(
        `Artifact ${manifest.id} may not change the html/body paper at runtime`,
      );
    }
    const lowerSource = source.toLowerCase();
    for (const token of ["tabindex", "aria-label", "keydown"]) {
      if (!lowerSource.includes(token)) {
        throw new Error(
          `Artifact ${manifest.id} is missing Lieflat keyboard path token ${token}`,
        );
      }
    }
  }
  return lieflatProfile;
}

function normalizeColor(literal: string): string {
  const value = literal.toLowerCase().replace(/\s+/g, "");
  if (value.startsWith("#")) {
    if (value.length === 4) {
      return `#${[...value.slice(1)].map((channel) => channel + channel).join("")}`;
    }
    return value;
  }

  const match =
    /^rgba?\((\d+),(\d+),(\d+)(?:,((?:0|1)(?:\.\d+)?|\.\d+))?\)$/.exec(
      value,
    );
  if (!match) {
    throw new Error(`Unsupported artifact color: ${literal}`);
  }
  const channels = match.slice(1, 4).map(Number);
  if (channels.some((channel) => channel > 255)) {
    throw new Error(`Artifact RGB channel exceeds 255: ${literal}`);
  }
  return match[4] === undefined
    ? `rgb(${channels.join(",")})`
    : `rgba(${channels.join(",")},${Number(match[4])})`;
}

function collectColors(source: string): Set<string> {
  const colors = new Set<string>();
  for (const match of source.matchAll(HEX_COLOR_PATTERN)) {
    colors.add(normalizeColor(match[0]));
  }
  for (const match of source.matchAll(RGB_COLOR_PATTERN)) {
    colors.add(normalizeColor(match[0]));
  }
  return colors;
}

function loadLieflatRegistry(): LieflatRegistry {
  if (lieflatRegistryCache) {
    return lieflatRegistryCache;
  }
  const registryPath = path.join(
    getWikiRoot(),
    "..",
    ".trae",
    "skills",
    "corepedia-h5-artifact",
    "references",
    "lieflat-palettes.json",
  );
  const raw = JSON.parse(readFileSync(registryPath, "utf8")) as unknown;
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== 1 ||
    raw.generator !== "lieflat-charts" ||
    raw.paper !== "#f5f5f2" ||
    !Array.isArray(raw.approvedTemplates) ||
    !isRecord(raw.profiles) ||
    !isRecord(raw.source) ||
    typeof raw.source.profileRevision !== "string" ||
    typeof raw.source.upstreamRevision !== "string"
  ) {
    throw new Error(`Invalid Lieflat profile registry: ${registryPath}`);
  }
  lieflatRegistryCache = raw as LieflatRegistry;
  return lieflatRegistryCache;
}

function loadRuntimeRegistry(): RuntimeRegistry {
  if (runtimeRegistryCache) {
    return runtimeRegistryCache;
  }
  const registryPath = path.join(
    getWikiRoot(),
    "..",
    ".trae",
    "skills",
    "corepedia-h5-artifact",
    "references",
    "runtime-registry.json",
  );
  const raw = JSON.parse(readFileSync(registryPath, "utf8")) as unknown;
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== 1 ||
    !Array.isArray(raw.runtimes)
  ) {
    throw new Error(`Invalid artifact runtime registry: ${registryPath}`);
  }
  const identities = new Set<string>();
  for (const runtime of raw.runtimes) {
    if (
      !isRecord(runtime) ||
      Object.keys(runtime).sort().join(",") !==
        [
          "allowedLieflatPalettes",
          "allowedLieflatTemplates",
          "bytes",
          "global",
          "license",
          "maxBytes",
          "name",
          "packageFile",
          "profile",
          "publicPath",
          "sha256",
          "version",
        ]
          .sort()
          .join(",") ||
      typeof runtime.name !== "string" ||
      typeof runtime.version !== "string" ||
      typeof runtime.profile !== "string" ||
      typeof runtime.global !== "string" ||
      !runtime.global ||
      typeof runtime.license !== "string" ||
      !runtime.license ||
      typeof runtime.packageFile !== "string" ||
      !runtime.packageFile ||
      typeof runtime.publicPath !== "string" ||
      !/^\/artifact-runtimes\/[a-z0-9.-]+\.js$/.test(runtime.publicPath) ||
      typeof runtime.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(runtime.sha256) ||
      !integerBetween(runtime.bytes, 1, 1_048_576) ||
      !integerBetween(runtime.maxBytes, runtime.bytes, 1_048_576) ||
      !Array.isArray(runtime.allowedLieflatTemplates) ||
      !runtime.allowedLieflatTemplates.every(
        (value) => typeof value === "string",
      ) ||
      !Array.isArray(runtime.allowedLieflatPalettes) ||
      !runtime.allowedLieflatPalettes.every(
        (value) => typeof value === "string",
      )
    ) {
      throw new Error(`Invalid artifact runtime entry: ${registryPath}`);
    }
    const identity = `${runtime.name}/${runtime.version}/${runtime.profile}`;
    if (identities.has(identity)) {
      throw new Error(`Duplicate artifact runtime identity: ${identity}`);
    }
    identities.add(identity);
  }
  runtimeRegistryCache = raw as RuntimeRegistry;
  return runtimeRegistryCache;
}

function resolveArtifactRuntime(
  manifest: ArtifactManifest,
  profile: LieflatProfile | null,
  source: string,
): PublishedArtifactRuntime | null {
  const registry = loadRuntimeRegistry();
  const runtimeIdentity = manifest.runtime ?? null;
  const requiredTemplates = new Set(
    registry.runtimes.flatMap(
      (runtime) => runtime.allowedLieflatTemplates,
    ),
  );
  if (!runtimeIdentity) {
    if (profile && requiredTemplates.has(profile.template)) {
      throw new Error(
        `Artifact ${manifest.id} requires a registered runtime for ${profile.template}`,
      );
    }
    if (/\becharts\b/.test(source)) {
      throw new Error(
        `Artifact ${manifest.id} uses echarts without declaring a runtime`,
      );
    }
    return null;
  }
  const runtime = registry.runtimes.find(
    (candidate) =>
      candidate.name === runtimeIdentity.name &&
      candidate.version === runtimeIdentity.version &&
      candidate.profile === runtimeIdentity.profile,
  );
  if (!runtime) {
    throw new Error(
      `Artifact ${manifest.id} requests an unregistered runtime`,
    );
  }
  if (!profile) {
    throw new Error(
      `Artifact ${manifest.id} runtime is limited to registered Lieflat charts`,
    );
  }
  if (!runtime.allowedLieflatTemplates.includes(profile.template)) {
    throw new Error(
      `Artifact ${manifest.id} runtime is not approved for ${profile.template}`,
    );
  }
  if (!runtime.allowedLieflatPalettes.includes(profile.palette)) {
    throw new Error(
      `Artifact ${manifest.id} runtime is not approved for ${profile.palette}`,
    );
  }
  if (!new RegExp(`\\b${runtime.global}\\b`).test(source)) {
    throw new Error(
      `Artifact ${manifest.id} does not use runtime global ${runtime.global}`,
    );
  }
  for (const token of [
    "__corepediaSetChartPaused",
    "__corepediaSetChartReducedMotion",
    "getInstanceByDom",
  ]) {
    if (!source.includes(token)) {
      throw new Error(
        `Artifact ${manifest.id} is missing runtime lifecycle hook ${token}`,
      );
    }
  }
  return {
    bytes: runtime.bytes,
    global: runtime.global,
    maxBytes: runtime.maxBytes,
    name: runtime.name,
    profile: runtime.profile,
    publicPath: runtime.publicPath,
    sha256: runtime.sha256,
    version: runtime.version,
  };
}

function parseLieflatProfile(
  source: string,
  artifactId: string,
): LieflatProfile | null {
  const values = new Map<string, string[]>();
  for (const name of LIEFLAT_META_NAMES) {
    const pattern = new RegExp(
      `<meta\\b(?=[^>]*\\bname=["']${name}["'])(?=[^>]*\\bcontent=["']([^"']*)["'])[^>]*>`,
      "gi",
    );
    values.set(name, [...source.matchAll(pattern)].map((match) => match[1]));
  }
  const present = [...values.entries()].filter(([, found]) => found.length > 0);
  if (!present.length) {
    return null;
  }
  const invalid = [...values.entries()].filter(([, found]) => found.length !== 1);
  if (invalid.length) {
    throw new Error(
      `Artifact ${artifactId} has incomplete or duplicate Lieflat provenance`,
    );
  }

  const registry = loadLieflatRegistry();
  const template = values.get("lieflat-template")![0];
  const palette = values.get("lieflat-palette")![0];
  const revision = values.get("lieflat-source")![0];
  if (!registry.approvedTemplates.includes(template)) {
    throw new Error(`Artifact ${artifactId} uses unapproved Lieflat template ${template}`);
  }
  const profile = registry.profiles[palette];
  if (!profile || !Array.isArray(profile.colors)) {
    throw new Error(`Artifact ${artifactId} uses unregistered Lieflat palette ${palette}`);
  }
  if (revision !== registry.source.profileRevision) {
    throw new Error(`Artifact ${artifactId} uses an unapproved Lieflat revision`);
  }
  return {
    colors: new Set(profile.colors),
    palette,
    source: revision,
    template,
  };
}

function validateCanvasPaper(source: string, artifactId: string): void {
  const paperVariables = new Set(
    [...source.matchAll(/(--[a-z0-9-]+)\s*:\s*#f5f5f2\b/gi)].map(
      (match) => match[1].toLowerCase(),
    ),
  );
  const allowedBackgrounds = new Set([
    "#f5f5f2",
    ...[...paperVariables].map((name) => `var(${name})`),
  ]);
  const blocks = [...source.matchAll(CANVAS_BACKGROUND_PATTERN)].map(
    (match) => match[1],
  );
  const backgrounds = blocks.flatMap((block) =>
    [...block.matchAll(BACKGROUND_DECLARATION_PATTERN)].map((match) =>
      match[1]
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/!important$/, ""),
    ),
  );
  if (!backgrounds.length) {
    throw new Error(`Artifact ${artifactId} must declare the html/body canvas paper`);
  }
  if (
    backgrounds.some((background) => !allowedBackgrounds.has(background))
  ) {
    throw new Error(
      `Artifact ${artifactId} must keep the html/body canvas on #f5f5f2`,
    );
  }
  for (const match of source.matchAll(/<(?:html|body)\b[^>]*\bstyle=["']([^"']*)["']/gi)) {
    const inlineBackgrounds = [...match[1].matchAll(BACKGROUND_DECLARATION_PATTERN)].map(
      (background) =>
        background[1]
          .toLowerCase()
          .replace(/\s+/g, "")
          .replace(/!important$/, ""),
    );
    if (
      !inlineBackgrounds.length ||
      inlineBackgrounds.some(
        (background) => !allowedBackgrounds.has(background),
      )
    ) {
      throw new Error(
        `Artifact ${artifactId} has an invalid inline html/body paper`,
      );
    }
  }
}

function validateLieflatMotion(source: string, artifactId: string): void {
  if (DYNAMIC_MOTION_PATTERN.test(source)) {
    throw new Error(
      `Artifact ${artifactId} has a dynamic Lieflat motion duration or delay`,
    );
  }
  const excessive = new Set<string>();
  for (const declaration of source.matchAll(MOTION_DECLARATION_PATTERN)) {
    for (const duration of declaration[1].matchAll(TIME_PATTERN)) {
      const milliseconds =
        Number(duration[1]) * (duration[2].toLowerCase() === "s" ? 1000 : 1);
      if (milliseconds > 420) {
        excessive.add(duration[0]);
      }
    }
  }
  for (const duration of source.matchAll(ECHARTS_DURATION_PATTERN)) {
    if (Number(duration[1]) > 420) {
      excessive.add(`${duration[1]}ms`);
    }
  }
  if (excessive.size) {
    throw new Error(
      `Artifact ${artifactId} has Lieflat motion over 420ms: ${[...excessive].join(", ")}`,
    );
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
