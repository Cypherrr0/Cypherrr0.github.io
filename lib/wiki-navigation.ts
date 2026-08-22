import type { WikiPageSummary } from "@/lib/wiki";

const LEETCODE_PATH_PREFIX = "learning/algorithms/";

export function buildWikiNavigationPages(
  pages: WikiPageSummary[],
): WikiPageSummary[] {
  const leetCodePages = pages.filter((page) =>
    page.path.startsWith(LEETCODE_PATH_PREFIX),
  );
  const latestLeetCodeUpdate = leetCodePages.reduce(
    (latest, page) => (page.updated > latest ? page.updated : latest),
    "",
  );

  const navigationPages = pages.filter(
    (page) => !isIndexPage(page) && !page.path.startsWith(LEETCODE_PATH_PREFIX),
  );

  if (leetCodePages.length) {
    navigationPages.push({
      excerpt: "",
      path: "learning/algorithms/",
      searchText: "LeetCode 热题 100",
      slug: ["learning", "algorithms"],
      status: "",
      tags: [],
      title: "LeetCode 热题 100",
      type: "",
      updated: latestLeetCodeUpdate,
    });
  }

  return navigationPages.sort(comparePagesByUpdated);
}

export function isIndexPage(page: WikiPageSummary): boolean {
  return page.path.endsWith("/index.md");
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
