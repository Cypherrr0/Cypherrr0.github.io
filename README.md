# Corepedia Website

This repository contains the presentation layer for the Corepedia LLM wiki. It
owns routing, Markdown rendering, search, and GitHub Pages deployment. Wiki
content stays in the separate `Cypherrr0/corepedia` repository.

Only the maintained `tech`, `writing`, and `learning` sections are published.
Raw sources, operation logs, ideas, and agent instructions are excluded by the
website.

## Local Development

Install dependencies and point the website at a local Corepedia checkout:

```bash
COREPEDIA_WIKI_PATH=../corepedia/wikis npm run dev
```

If `COREPEDIA_WIKI_PATH` is unset, the application looks for
`../corepedia/wikis` relative to this repository. If the directory is not
available, the personal homepage still builds and the `/wiki/` index shows a
setup message.

## Production Build

Build all public wiki pages as static HTML:

```bash
COREPEDIA_WIKI_PATH=../corepedia/wikis npm run build
```

The exported site is generated in `out/`. The build supports:

- YAML frontmatter metadata
- CommonMark and GitHub Flavored Markdown
- Obsidian `[[path|label]]` links between published pages
- Content-hashed static images referenced by published pages
- Static routes for every published Markdown file
- Browser-side search over titles, tags, paths, and text
- Single-domain browsing with collapsible topic lists
- Markdown-derived article outlines and a reduced-motion-aware knowledge graph

The wiki remains responsible for content only. This repository decides how that
content is routed and rendered. Local images are published only when a maintained
`tech`, `writing`, or `learning` page references an existing file inside the
wiki root. Missing or machine-local paths remain visible as unavailable media.

## GitHub Pages

The existing workflow deploys the `out/` directory when the website repository
changes. To build from the private Corepedia repository, extend that workflow
with an authenticated checkout and set:

```bash
COREPEDIA_WIKI_PATH=/path/to/checked-out/corepedia/wikis
```

Repository credentials and cross-repository triggers are intentionally not
configured in this codebase.

## Standard Commands

```bash
npm ci
npm run dev
npm run build
npm run lint
```

This site uses Next.js static export mode and targets the root GitHub Pages
domain, so no `basePath` is configured.
