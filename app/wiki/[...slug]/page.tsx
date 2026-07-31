import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWikiPageBySlug, getWikiPages } from "@/lib/wiki";

export const dynamicParams = false;
const UNAVAILABLE_SLUG = ["unavailable"];

type WikiPageProps = {
  params: Promise<{ slug: string[] }>;
};

export function generateStaticParams() {
  const pages = getWikiPages();

  return pages.length
    ? pages.map((page) => ({ slug: page.slug }))
    : [{ slug: UNAVAILABLE_SLUG }];
}

export async function generateMetadata({
  params,
}: WikiPageProps): Promise<Metadata> {
  const page = await getWikiPageBySlug((await params).slug);

  if (!page) {
    return {};
  }

  return {
    description: page.excerpt,
    title: page.title,
  };
}

export default async function WikiPage({ params }: WikiPageProps) {
  const { slug } = await params;
  const page = await getWikiPageBySlug(slug);

  if (!page) {
    if (slug.join("/") === UNAVAILABLE_SLUG.join("/") && !getWikiPages().length) {
      return (
        <main className="article-shell" id="main-content" tabIndex={-1}>
          <nav aria-label="面包屑" className="breadcrumbs">
            <Link href="/">C/P</Link>
            <span aria-hidden="true">/</span>
            <Link href="/wiki/">Wiki</Link>
          </nav>
          <section className="empty-state">
            <h1>Wiki 内容尚未接入</h1>
            <p>
              构建时设置 <code>COREPEDIA_WIKI_PATH</code> 指向 Corepedia 的
              <code>wikis</code> 目录即可生成公开页面。
            </p>
          </section>
        </main>
      );
    }

    notFound();
  }

  return (
    <main className="article-shell" id="main-content" tabIndex={-1}>
      <nav aria-label="面包屑" className="breadcrumbs">
        <Link href="/">C/P</Link>
        <span aria-hidden="true">/</span>
        <Link href="/wiki/">Wiki</Link>
        <span aria-hidden="true">/</span>
        <span>{page.slug[0]}</span>
      </nav>

      <article className="wiki-article">
        <header className="article-header">
          <p className="eyebrow">{page.type || page.slug[0]}</p>
          <h1>{page.title}</h1>
          <dl className="page-meta">
            {page.status ? (
              <div>
                <dt>状态</dt>
                <dd>{page.status}</dd>
              </div>
            ) : null}
            {page.updated ? (
              <div>
                <dt>更新</dt>
                <dd>
                  <time dateTime={page.updated}>{page.updated}</time>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>路径</dt>
              <dd>
                <code>{page.path}</code>
              </dd>
            </div>
          </dl>
          {page.tags.length ? (
            <ul className="tag-list" aria-label="标签">
              {page.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          ) : null}
        </header>

        <div className="article-grid">
          <aside className="article-rail" aria-label="文章信息">
            <span>{page.slug[0]}</span>
            {page.updated ? (
              <time dateTime={page.updated}>{page.updated}</time>
            ) : null}
          </aside>
          <div
            className="wiki-content"
            dangerouslySetInnerHTML={{ __html: page.html }}
          />
        </div>
      </article>
    </main>
  );
}
