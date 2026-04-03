# Personal Website

This repository contains a personal website built with Next.js App Router and prepared for deployment to GitHub Pages.

## Local Development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Production Build

This project uses Next.js static export mode.

```bash
npm run build
```

The exported static site will be generated in the `out/` directory.

## GitHub Pages Deployment

This repository is configured for GitHub Pages deployment through GitHub Actions.

To enable publishing:

1. Push this repository to a GitHub repository named `<username>.github.io`.
2. In GitHub, open `Settings` -> `Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to the default branch and let the workflow deploy the `out/` directory.

## Notes

- This setup targets the root GitHub Pages domain, so no `basePath` is configured.
- The current homepage is a placeholder and can be replaced later without changing the deployment setup.
