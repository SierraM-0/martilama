# martilama.com

Personal site built with [Astro](https://astro.build/) — home, about, a
lightweight work page, and the blog. Lives under
`Yggdrasil/Asgard/Bragi/site/`. Deployed to Cloudflare, live at
[martilama.com](https://martilama.com).

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # static build to ./dist
npm run preview  # preview the built site
```

## Content

- Posts: Markdown files in `src/content/blog/`. Frontmatter: `title`,
  `description`, `date`, optional `cover`. No tags.
- Photos: drop full-res files in `src/assets/` and import them; the build
  optimises them via `astro:assets`. Replace `src/assets/portrait.png` with a
  real photo.

## Deploy (Cloudflare)

- Connect this GitHub repo (`SierraM-0/site`) to a Cloudflare Pages/Workers
  Builds project.
- Build command: `npm run build`. Output directory: `dist`.
- `public/_redirects` redirects the old `/atom.xml` to `/rss.xml`.
- **Subdomain redirect:** configure a Cloudflare redirect rule so
  `blog.martilama.com/*` → `https://martilama.com/blog/$1` (301). This is a
  dashboard/DNS-level rule, not part of the static build.

## Migration note

Supersedes the old Zola blog at `Asgard/Bragi/blog/`. That repo is kept as an
archive; post slugs/dates were preserved so existing links keep working behind
the subdomain redirect.
