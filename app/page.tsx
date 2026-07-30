import { WikiSearch } from "@/components/wiki-search";
import { getWikiPages } from "@/lib/wiki";

export default function Home() {
  const pages = getWikiPages();

  return (
    <main className="site-shell">
      <header className="hero">
        <p className="eyebrow">Corepedia</p>
        <h1>LLM Wiki</h1>
        <p>
          内容来自独立的 Corepedia 仓库。这个仓库只负责读取、渲染、搜索与静态发布。
        </p>
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
