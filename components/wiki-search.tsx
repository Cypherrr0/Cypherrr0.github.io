"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { WikiPageSummary } from "@/lib/wiki";

type WikiSearchProps = {
  pages: WikiPageSummary[];
};

export function WikiSearch({ pages }: WikiSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const results = useMemo(() => {
    if (!normalizedQuery) {
      return pages;
    }

    return pages.filter((page) =>
      page.searchText.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
    );
  }, [normalizedQuery, pages]);

  return (
    <section aria-labelledby="wiki-pages">
      <div className="search-row">
        <div>
          <h2 id="wiki-pages">Wiki 页面</h2>
          <p className="muted">
            {normalizedQuery
              ? `找到 ${results.length} 个结果`
              : `共 ${pages.length} 个公开页面`}
          </p>
        </div>
        <label className="search">
          <span className="sr-only">搜索 Wiki</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、标签或正文"
            type="search"
            value={query}
          />
        </label>
      </div>

      {results.length ? (
        <ul className="page-list">
          {results.map((page) => (
            <li key={page.path}>
              <article className="page-card">
                <div className="page-card-header">
                  <div>
                    <p className="eyebrow">{page.type || page.slug[0]}</p>
                    <h3>
                      <Link href={`/wiki/${page.slug.join("/")}/`}>
                        {page.title}
                      </Link>
                    </h3>
                  </div>
                  {page.updated ? (
                    <time dateTime={page.updated}>{page.updated}</time>
                  ) : null}
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">没有匹配的页面。</p>
      )}
    </section>
  );
}
