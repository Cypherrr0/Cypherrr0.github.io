import type { Metadata } from "next";
import Link from "next/link";
import { WikiSearch } from "@/components/wiki-search";
import { getWikiPages } from "@/lib/wiki";

export const metadata: Metadata = {
  description: "技术、学习与写作的个人知识索引。",
  title: "Wiki",
};

export default function WikiIndex() {
  const pages = getWikiPages();

  return (
    <main className="wiki-shell" id="main-content" tabIndex={-1}>
      <nav aria-label="Wiki 导航" className="wiki-nav">
        <Link className="site-mark" href="/" aria-label="返回首页">
          C<span aria-hidden="true">/</span>P
        </Link>
        <a
          className="quiet-link"
          href="https://github.com/Cypherrr0"
          rel="noreferrer"
          target="_blank"
        >
          GitHub
          <span aria-hidden="true">↗</span>
        </a>
      </nav>

      <header className="wiki-hero">
        <p className="eyebrow">Corepedia / Public index</p>
        <h1>Notes worth keeping.</h1>
        <p>技术、学习与写作。不是结论仓库，而是一份持续修订的思考记录。</p>
      </header>

      {pages.length ? (
        <WikiSearch pages={pages} />
      ) : (
        <section className="empty-state" aria-labelledby="wiki-unavailable">
          <h2 id="wiki-unavailable">Wiki 内容尚未接入</h2>
          <p>
            构建时设置 <code>COREPEDIA_WIKI_PATH</code> 指向 Corepedia 的
            <code>wikis</code> 目录即可生成页面。
          </p>
        </section>
      )}
    </main>
  );
}
