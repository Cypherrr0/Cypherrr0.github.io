"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import type { WikiPageSummary } from "@/lib/wiki";

type WikiSearchProps = {
  pages: WikiPageSummary[];
};

type WikiNode = {
  children: Map<string, WikiNode>;
  directPages: WikiPageSummary[];
  path: string[];
  segment: string;
};

const LEETCODE_INDEX_PATH = "learning/algorithms/index.md";
const LEETCODE_PATH_PREFIX = "learning/algorithms/";

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
  const [activeDomain, setActiveDomain] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const searchablePages = useMemo(
    () => pages.filter((page) => !isIndexPage(page)).sort(comparePagesByUpdated),
    [pages],
  );
  const navigationPages = useMemo(() => buildNavigationPages(pages), [pages]);
  const domains = useMemo(
    () => buildWikiTree(navigationPages),
    [navigationPages],
  );
  const results = useMemo(() => {
    if (!normalizedQuery) {
      return searchablePages;
    }

    return searchablePages.filter((page) =>
      page.searchText.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
    );
  }, [normalizedQuery, searchablePages]);
  const selectedDomain =
    domains.find((domain) => domain.segment === activeDomain) || domains[0];

  return (
    <section aria-labelledby="wiki-pages" className="wiki-index">
      <div className="search-row">
        <div>
          <p className="eyebrow">Index</p>
          <h2 id="wiki-pages">知识地图</h2>
          <p aria-live="polite" className="muted">
            {normalizedQuery
              ? `找到 ${results.length} 个结果`
              : `${domainMeta(selectedDomain.segment).title}，${countPages(selectedDomain)} 页`}
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
          <KnowledgeGraph
            activeDomain={selectedDomain?.segment || activeDomain}
            pages={navigationPages}
          />

          <div aria-label="知识域" className="domain-nav" role="tablist">
            {domains.map((domain) => {
              const meta = domainMeta(domain.segment);
              const isActive = domain.segment === selectedDomain?.segment;
              return (
                <button
                  aria-controls={`domain-panel-${domain.segment}`}
                  aria-selected={isActive}
                  className={isActive ? "is-active" : undefined}
                  id={`domain-tab-${domain.segment}`}
                  key={domain.segment}
                  onKeyDown={(event) =>
                    handleDomainKeyDown(
                      event,
                      domain.segment,
                      domains,
                      setActiveDomain,
                    )
                  }
                  onClick={() => setActiveDomain(domain.segment)}
                  role="tab"
                  tabIndex={isActive ? 0 : -1}
                  type="button"
                >
                  <span>{meta.title}</span>
                  <small>{countPages(domain)}</small>
                </button>
              );
            })}
          </div>

          <div className="domain-list">
            {selectedDomain ? <DomainSection node={selectedDomain} /> : null}
          </div>
        </>
      )}
    </section>
  );
}

function DomainSection({ node }: { node: WikiNode }) {
  const meta = domainMeta(node.segment);

  return (
    <section
      aria-labelledby={`domain-tab-${node.segment}`}
      className="domain-section"
      id={`domain-panel-${node.segment}`}
      role="tabpanel"
      tabIndex={0}
    >
      <header className="domain-header">
        <div>
          <p className="eyebrow">{meta.eyebrow}</p>
          <h3>{meta.title}</h3>
          <p>{meta.description}</p>
        </div>
        <span className="page-count">{countPages(node)} 页</span>
      </header>

      <div className="domain-content">
        <PageLinkList pages={collectPages(node)} />
      </div>
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
  const sortedPages = [...pages].sort(comparePagesByUpdated);
  const visiblePages = sortedPages.slice(0, 3);
  const hiddenPages = sortedPages.slice(3);

  return (
    <div className="topic-pages">
      {title ? <p className="topic-label">{title}</p> : null}
      <ul>
        {visiblePages.map((page) => (
          <li key={page.path}>
            <PageListItem page={page} />
          </li>
        ))}
      </ul>
      {hiddenPages.length ? (
        <details className="topic-pages-more">
          <summary>
            <span className="show-more-label">展开 {hiddenPages.length} 项</span>
            <span className="show-less-label">收起</span>
          </summary>
          <ul>
            {hiddenPages.map((page) => (
              <li key={page.path}>
                <PageListItem page={page} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function PageListItem({ page }: { page: WikiPageSummary }) {
  return (
    <>
      <PageLink page={page}>{page.title}</PageLink>
      {page.updated ? (
        <time dateTime={page.updated}>{page.updated}</time>
      ) : null}
    </>
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
    const directorySegments = rest.slice(0, -1);
    let node = root;

    for (const segment of directorySegments) {
      node = getOrCreateNode(node.children, segment, node.path);
    }

    node.directPages.push(page);
  }

  return [...roots.values()].sort((left, right) => {
    return (
      latestUpdated(right).localeCompare(latestUpdated(left)) ||
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
    [...node.children.values()].reduce(
      (total, child) => total + countPages(child),
      0,
    )
  );
}

function collectPages(node: WikiNode): WikiPageSummary[] {
  return [
    ...node.directPages,
    ...[...node.children.values()].flatMap(collectPages),
  ].sort(comparePagesByUpdated);
}

function latestUpdated(node: WikiNode): string {
  return [
    ...node.directPages.map((page) => page.updated),
    ...[...node.children.values()].map(latestUpdated),
  ].reduce((latest, updated) => (updated > latest ? updated : latest), "");
}

function comparePagesByUpdated(
  left: WikiPageSummary,
  right: WikiPageSummary,
) {
  return (
    right.updated.localeCompare(left.updated) ||
    left.title.localeCompare(right.title, "zh-CN")
  );
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

function isIndexPage(page: WikiPageSummary) {
  return page.path.endsWith("/index.md");
}

function buildNavigationPages(pages: WikiPageSummary[]): WikiPageSummary[] {
  const leetCodePages = pages.filter(
    (page) =>
      page.path.startsWith(LEETCODE_PATH_PREFIX) &&
      page.path !== LEETCODE_INDEX_PATH,
  );
  const latestLeetCodeUpdate = leetCodePages.reduce(
    (latest, page) => (page.updated > latest ? page.updated : latest),
    "",
  );

  return pages
    .filter(
      (page) =>
        page.path === LEETCODE_INDEX_PATH ||
        (!isIndexPage(page) && !page.path.startsWith(LEETCODE_PATH_PREFIX)),
    )
    .map((page) =>
      page.path === LEETCODE_INDEX_PATH
        ? {
            ...page,
            title: "LeetCode 热题 100",
            updated: latestLeetCodeUpdate || page.updated,
          }
        : page,
    )
    .sort(comparePagesByUpdated);
}

function handleDomainKeyDown(
  event: React.KeyboardEvent<HTMLButtonElement>,
  currentDomain: string,
  domains: WikiNode[],
  selectDomain: (domain: string) => void,
) {
  const currentIndex = domains.findIndex(
    (domain) => domain.segment === currentDomain,
  );
  let nextIndex = currentIndex;

  if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % domains.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + domains.length) % domains.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = domains.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const nextDomain = domains[nextIndex];
  selectDomain(nextDomain.segment);
  document.getElementById(`domain-tab-${nextDomain.segment}`)?.focus();
}
