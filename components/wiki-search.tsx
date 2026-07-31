"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { WikiPageSummary } from "@/lib/wiki";

type WikiSearchProps = {
  pages: WikiPageSummary[];
};

type WikiNode = {
  children: Map<string, WikiNode>;
  directPages: WikiPageSummary[];
  indexPage?: WikiPageSummary;
  path: string[];
  segment: string;
};

const DOMAIN_ORDER = ["learning", "tech", "writing"];
const DOMAIN_META: Record<
  string,
  { description: string; eyebrow: string; title: string }
> = {
  learning: {
    description: "学习路径、算法练习、金融基础与思想材料。",
    eyebrow: "Learning",
    title: "学习",
  },
  tech: {
    description: "LLM、软件架构、发布工程与技术概念。",
    eyebrow: "Tech",
    title: "技术",
  },
  writing: {
    description: "技术写作、表达规范与可复用写作系统。",
    eyebrow: "Writing",
    title: "写作",
  },
};

export function WikiSearch({ pages }: WikiSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const domains = useMemo(() => buildWikiTree(pages), [pages]);
  const results = useMemo(() => {
    if (!normalizedQuery) {
      return pages;
    }

    return pages.filter((page) =>
      page.searchText.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
    );
  }, [normalizedQuery, pages]);

  return (
    <section aria-labelledby="wiki-pages" className="wiki-index">
      <div className="search-row">
        <div>
          <p className="eyebrow">Index</p>
          <h2 id="wiki-pages">知识地图</h2>
          <p aria-live="polite" className="muted">
            {normalizedQuery
              ? `找到 ${results.length} 个结果`
              : `${domains.length} 个知识域，共 ${pages.length} 个公开页面`}
          </p>
        </div>
        <label className="search">
          <span>Search</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="标题、标签或正文"
            type="search"
            value={query}
          />
        </label>
      </div>

      {normalizedQuery ? (
        results.length ? (
          <ul className="page-list">
            {results.map((page) => (
              <li key={page.path}>
                <SearchResult page={page} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">没有匹配的页面。</p>
        )
      ) : (
        <>
          <nav aria-label="知识域" className="domain-nav">
            {domains.map((domain) => {
              const meta = domainMeta(domain.segment);
              return (
                <a href={`#domain-${domain.segment}`} key={domain.segment}>
                  <span>{meta.title}</span>
                  <small>{countPages(domain)}</small>
                </a>
              );
            })}
          </nav>

          <div className="domain-list">
            {domains.map((domain) => (
              <DomainSection key={domain.segment} node={domain} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function DomainSection({ node }: { node: WikiNode }) {
  const meta = domainMeta(node.segment);

  return (
    <section className="domain-section" id={`domain-${node.segment}`}>
      <header className="domain-header">
        <div>
          <p className="eyebrow">{meta.eyebrow}</p>
          <h3>
            {node.indexPage ? (
              <PageLink page={node.indexPage}>{meta.title}</PageLink>
            ) : (
              meta.title
            )}
          </h3>
          <p>{meta.description}</p>
        </div>
        <span className="page-count">{countPages(node)} 页</span>
      </header>

      <div className="domain-content">
        {node.directPages.length ? (
          <PageLinkList pages={node.directPages} title="本域专题" />
        ) : null}
        {sortedChildren(node).map((child) => (
          <TopicSection depth={1} key={child.segment} node={child} />
        ))}
      </div>
    </section>
  );
}

function TopicSection({ depth, node }: { depth: number; node: WikiNode }) {
  const title = node.indexPage?.title || formatSegment(node.segment);
  const Heading = depth === 1 ? "h4" : "h5";

  return (
    <section className={`topic-section topic-depth-${depth}`}>
      <header className="topic-header">
        <Heading>
          {node.indexPage ? (
            <PageLink page={node.indexPage}>{title}</PageLink>
          ) : (
            title
          )}
        </Heading>
        <span>{countPages(node)} 页</span>
      </header>
      {node.directPages.length ? <PageLinkList pages={node.directPages} /> : null}
      {sortedChildren(node).map((child) => (
        <TopicSection depth={depth + 1} key={child.segment} node={child} />
      ))}
    </section>
  );
}

function PageLinkList({
  pages,
  title,
}: {
  pages: WikiPageSummary[];
  title?: string;
}) {
  return (
    <div className="topic-pages">
      {title ? <p className="topic-label">{title}</p> : null}
      <ul>
        {pages.map((page) => (
          <li key={page.path}>
            <PageLink page={page}>{page.title}</PageLink>
            {page.updated ? (
              <time dateTime={page.updated}>{page.updated}</time>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchResult({ page }: { page: WikiPageSummary }) {
  return (
    <article className="page-card">
      <div className="page-card-header">
        <div>
          <p className="eyebrow">{page.type || page.slug[0]}</p>
          <h3>
            <PageLink page={page}>{page.title}</PageLink>
          </h3>
        </div>
        {page.updated ? <time dateTime={page.updated}>{page.updated}</time> : null}
      </div>
      {page.excerpt ? <p>{page.excerpt}</p> : null}
      {page.tags.length ? (
        <ul className="tag-list" aria-label={`${page.title} 标签`}>
          {page.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function PageLink({
  children,
  page,
}: {
  children: React.ReactNode;
  page: WikiPageSummary;
}) {
  return <Link href={`/wiki/${page.slug.join("/")}/`}>{children}</Link>;
}

function buildWikiTree(pages: WikiPageSummary[]): WikiNode[] {
  const roots = new Map<string, WikiNode>();

  for (const page of pages) {
    const [domain, ...rest] = page.slug;
    if (!domain) {
      continue;
    }

    const root = getOrCreateNode(roots, domain, []);
    const isIndex = page.path.endsWith("/index.md");
    const directorySegments = isIndex ? rest : rest.slice(0, -1);
    let node = root;

    for (const segment of directorySegments) {
      node = getOrCreateNode(node.children, segment, node.path);
    }

    if (isIndex) {
      node.indexPage = page;
    } else {
      node.directPages.push(page);
    }
  }

  return [...roots.values()].sort((left, right) => {
    const leftIndex = DOMAIN_ORDER.indexOf(left.segment);
    const rightIndex = DOMAIN_ORDER.indexOf(right.segment);
    return (
      (leftIndex === -1 ? DOMAIN_ORDER.length : leftIndex) -
        (rightIndex === -1 ? DOMAIN_ORDER.length : rightIndex) ||
      left.segment.localeCompare(right.segment, "zh-CN")
    );
  });
}

function getOrCreateNode(
  nodes: Map<string, WikiNode>,
  segment: string,
  parentPath: string[],
): WikiNode {
  const existing = nodes.get(segment);
  if (existing) {
    return existing;
  }

  const node: WikiNode = {
    children: new Map(),
    directPages: [],
    path: [...parentPath, segment],
    segment,
  };
  nodes.set(segment, node);
  return node;
}

function countPages(node: WikiNode): number {
  return (
    node.directPages.length +
    (node.indexPage ? 1 : 0) +
    [...node.children.values()].reduce(
      (total, child) => total + countPages(child),
      0,
    )
  );
}

function sortedChildren(node: WikiNode): WikiNode[] {
  return [...node.children.values()].sort((left, right) => {
    const leftTitle = left.indexPage?.title || left.segment;
    const rightTitle = right.indexPage?.title || right.segment;
    return leftTitle.localeCompare(rightTitle, "zh-CN");
  });
}

function domainMeta(segment: string) {
  return (
    DOMAIN_META[segment] || {
      description: "Corepedia 公开知识域。",
      eyebrow: segment,
      title: formatSegment(segment),
    }
  );
}

function formatSegment(segment: string): string {
  return segment
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
