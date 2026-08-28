import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArticleOutline } from "@/components/article-outline";
import {
  getAlgorithmCatalog,
  getWikiDirectoryListing,
  getWikiLegacyRedirect,
  getWikiPageBySlug,
  getWikiPages,
  getWikiStaticParamSlugs,
  type AlgorithmCatalogSection,
  type WikiDirectoryListing,
} from "@/lib/wiki";

export const dynamicParams = false;
const UNAVAILABLE_SLUG = ["unavailable"];
const ALGORITHM_INDEX_ROUTE = "learning/algorithms";
const DOMAIN_TITLES: Record<string, string> = {
  learning: "学习",
  tech: "技术",
  writing: "写作",
};

type WikiPageProps = {
  params: Promise<{ slug: string[] }>;
};

export function generateStaticParams() {
  const slugs = getWikiStaticParamSlugs();

  return slugs.length
    ? slugs.map((slug) => ({ slug }))
    : [{ slug: UNAVAILABLE_SLUG }];
}

export async function generateMetadata({
  params,
}: WikiPageProps): Promise<Metadata> {
  const { slug } = await params;
  const legacyTarget = getWikiLegacyRedirect(slug);
  if (legacyTarget) {
    redirect(`/wiki/${legacyTarget}/`);
  }

  if (slug.length === 1 && DOMAIN_TITLES[slug[0]]) {
    return {
      description: `${DOMAIN_TITLES[slug[0]]}知识目录。`,
      title: DOMAIN_TITLES[slug[0]],
    };
  }

  if (slug.join("/") === ALGORITHM_INDEX_ROUTE) {
    return {
      description: "LeetCode 热题 100，按 17 个算法章节整理。",
      title: "LeetCode 热题 100",
    };
  }

  const page = await getWikiPageBySlug(slug);
  if (page) {
    return {
      description: page.excerpt,
      title: page.title,
    };
  }

  const listing = getWikiDirectoryListing(slug);
  if (listing) {
    return {
      description: `${listing.title}目录。`,
      title: listing.title,
    };
  }

  return {};
}

export default async function WikiPage({ params }: WikiPageProps) {
  const { slug } = await params;
  const legacyTarget = getWikiLegacyRedirect(slug);
  if (legacyTarget) {
    redirect(`/wiki/${legacyTarget}/`);
  }
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

  if (slug.length === 1 && DOMAIN_TITLES[slug[0]]) {
    const listing = getWikiDirectoryListing(slug);
    if (listing) {
      return (
        <DirectoryIndex listing={listing} title={DOMAIN_TITLES[slug[0]]} />
      );
    }
  }

  if (slug.join("/") === ALGORITHM_INDEX_ROUTE) {
    return <AlgorithmIndex sections={getAlgorithmCatalog()} />;
  }

  const page = await getWikiPageBySlug(slug);
  if (page) {
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
        <header
          className={
            page.cover ? "article-header has-cover" : "article-header"
          }
        >
          <div className="article-header-copy">
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
          </div>
          {page.cover ? (
            <figure className="article-cover">
              <Image
                alt=""
                aria-hidden="true"
                height={1024}
                priority
                src={page.cover}
                unoptimized
                width={1024}
              />
            </figure>
          ) : null}
        </header>

        <div className="article-grid">
          <aside className="article-rail" aria-label="文章导航">
            <div className="article-rail-meta">
              <span>{page.slug[0]}</span>
              {page.updated ? (
                <time dateTime={page.updated}>{page.updated}</time>
              ) : null}
            </div>
            <ArticleOutline items={page.outline} />
          </aside>
          <div className="article-main">
            <div
              className="wiki-content"
              dangerouslySetInnerHTML={{ __html: page.html }}
            />
          </div>
        </div>
      </article>
    </main>
    );
  }

  const listing = getWikiDirectoryListing(slug);
  if (listing) {
    return <DirectoryIndex listing={listing} />;
  }

  notFound();
}

function DirectoryIndex({
  listing,
  title,
}: {
  listing: WikiDirectoryListing;
  title?: string;
}) {
  const childCount = listing.directories.length + listing.pages.length;

  return (
    <main className="article-shell" id="main-content" tabIndex={-1}>
      <nav aria-label="面包屑" className="breadcrumbs">
        <Link href="/">C/P</Link>
        <span aria-hidden="true">/</span>
        <Link href="/wiki/">Wiki</Link>
        {listing.slug.map((segment, index) => {
          const href = `/wiki/${listing.slug.slice(0, index + 1).join("/")}/`;
          const label = index === 0 ? segment : formatDirectoryLabel(segment);
          const isLast = index === listing.slug.length - 1;

          return (
            <span key={href}>
              <span aria-hidden="true">/</span>
              {isLast ? <span>{title ?? label}</span> : <Link href={href}>{label}</Link>}
            </span>
          );
        })}
      </nav>

      <article className="wiki-article">
        <header className="article-header">
          <div className="article-header-copy">
            <p className="eyebrow">Corepedia / Directory</p>
            <h1>{title ?? listing.title}</h1>
          </div>
        </header>

        <div className="article-grid">
          <aside className="article-rail" aria-label="目录信息">
            <div className="article-rail-meta">
              <span>{listing.slug.join(" / ")}</span>
              <span>{childCount} entries</span>
            </div>
          </aside>
          <div className="article-main">
            {listing.directories.length ? (
              <div className="topic-pages">
                <h2>子目录</h2>
                <ul>
                  {listing.directories.map((directory) => (
                    <li key={directory.href}>
                      <Link href={directory.href}>{directory.title}</Link>
                      <span>{directory.pageCount}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {listing.pages.length ? (
              <div className="topic-pages">
                <h2>本层页面</h2>
                <ul>
                  {listing.pages.map((item) => (
                    <li key={item.path}>
                      <Link href={`/wiki/${item.slug.join("/")}/`}>
                        {item.title}
                      </Link>
                      {item.updated ? (
                        <time dateTime={item.updated}>{item.updated}</time>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </main>
  );
}

function formatDirectoryLabel(segment: string) {
  return segment
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function AlgorithmIndex({ sections }: { sections: AlgorithmCatalogSection[] }) {
  const questionCount = sections.reduce(
    (total, section) => total + section.questions.length,
    0,
  );

  return (
    <main className="article-shell" id="main-content" tabIndex={-1}>
      <nav aria-label="面包屑" className="breadcrumbs">
        <Link href="/">C/P</Link>
        <span aria-hidden="true">/</span>
        <Link href="/wiki/">Wiki</Link>
        <span aria-hidden="true">/</span>
        <span>learning / algorithms</span>
      </nav>

      <article className="algorithm-index">
        <header className="algorithm-index-header">
          <p className="eyebrow">Learning / Algorithms</p>
          <h1>LeetCode 热题 100</h1>
          <p className="algorithm-index-count">
            <span>17 章</span>
            <span>{questionCount} 题</span>
          </p>
        </header>

        <div className="algorithm-chapters">
          {sections.map((section, index) => {
            const route = `/wiki/learning/algorithms/${section.slug}/`;

            return (
              <section className="algorithm-chapter" key={section.slug}>
                <header className="algorithm-chapter-header">
                  <span aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2>
                    <Link href={route}>{section.title}</Link>
                  </h2>
                  <small>{section.questions.length} 题</small>
                </header>
                <ul>
                  {section.questions.map((question) => (
                    <li key={question.id}>
                      <Link href={`${route}#${question.id}`}>
                        {question.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </article>
    </main>
  );
}
