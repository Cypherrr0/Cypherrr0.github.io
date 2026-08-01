import type { WikiOutlineItem } from "@/lib/wiki";

type ArticleOutlineProps = {
  items: WikiOutlineItem[];
};

export function ArticleOutline({ items }: ArticleOutlineProps) {
  if (!items.length) {
    return null;
  }

  return (
    <details className="article-outline">
      <summary>
        <span>
          <small>Outline</small>
          <strong>文章大纲</strong>
        </span>
        <span className="article-outline-count">{items.length} 节</span>
      </summary>
      <nav aria-label="文章大纲">
        <ol>
          {items.map((item) => (
            <li
              className={`outline-depth-${item.depth}`}
              key={`${item.id}-${item.depth}`}
            >
              <a href={`#${item.id}`}>{item.title}</a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}
