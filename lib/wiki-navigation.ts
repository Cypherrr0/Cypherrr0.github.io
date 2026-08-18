import type { WikiPageSummary } from "@/lib/wiki";

const LEETCODE_INDEX_PATH = "learning/algorithms/index.md";
const LEETCODE_PATH_PREFIX = "learning/algorithms/";

export function buildWikiNavigationPages(
  pages: WikiPageSummary[],
): WikiPageSummary[] {
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
