import Link from "next/link";
import { RollingWords } from "@/components/rolling-words";
import { getWikiPages } from "@/lib/wiki";

export default function Home() {
  const pages = getWikiPages();
  const publicNotes = pages.filter(
    (page) => !page.path.endsWith("/index.md"),
  ).length;

  return (
    <main className="home-shell" id="main-content" tabIndex={-1}>
      <nav aria-label="主导航" className="home-nav">
        <span className="site-mark" aria-label="Corepedia">
          C<span aria-hidden="true">/</span>P
        </span>
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

      <section aria-labelledby="home-title" className="home-hero">
        <p className="home-kicker">A personal index</p>
        <h1 id="home-title">
          <span>no coding,</span>
          <RollingWords />
        </h1>
        <p className="home-note">
          把读过的、想过的和仍然不确定的，留下来。
        </p>
      </section>

      <footer className="home-footer">
        <Link className="primary-link" href="/wiki/">
          <span>Read the wiki</span>
          <span aria-hidden="true">→</span>
        </Link>
        <p>
          <span>{publicNotes}</span>
          <span>public notes</span>
        </p>
      </footer>
    </main>
  );
}
