# Tufte sidenotes — design

**Date:** 2026-06-13
**Status:** Approved, ready for implementation plan

## Goal

Add Tufte-style sidenotes to blog posts: an aside appears in the right margin,
vertically aligned with the sentence that references it, instead of being exiled
to a footnotes block at the bottom of the page. On narrow screens (no margin)
the note collapses behind a tappable number and expands inline.

## Authoring

Authors write **standard GFM footnotes** — no new syntax, no MDX:

```markdown
The book surprised me a little.[^kindle]

[^kindle]: It's a Kindle, loaded from a Calibre library I drift through.
```

- Named (`[^kindle]`) or numeric (`[^1]`) labels both work.
- Posts stay plain `.md`. The content collection and pipeline are unchanged.
- **Graceful degradation:** if the sidenote transform is ever removed or fails,
  the content is still valid markdown footnotes and renders as a normal
  footnotes section.

## Rendering — `rehype-sidenotes` plugin

A small local rehype plugin at `src/plugins/rehype-sidenotes.js`, wired into
`astro.config.mjs` under `markdown.rehypePlugins` (runs after remark-gfm has
produced the standard footnote HTML). It transforms the generated footnote HTML
into Tufte sidenote markup:

1. **Collect definitions.** Find the `<section data-footnotes>` and build a map
   of `footnote id → hast content nodes` from its `<li>` items. Strip the
   back-reference `↩` anchors from each definition.
2. **Replace each reference.** For every inline footnote reference
   (`<sup><a data-footnote-ref href="#user-content-fn-...">`), replace it in
   place with the tufte-css triplet:
   ```html
   <label for="sn-<id>" class="margin-toggle sidenote-number"></label>
   <input type="checkbox" id="sn-<id>" class="margin-toggle" />
   <span class="sidenote"><!-- definition content --></span>
   ```
   The `id` is derived from the footnote id and is unique per note.
3. **Remove** the now-empty `<section data-footnotes>`.
4. **No-op safety:** if a post has no footnotes, the plugin makes no changes and
   the page is byte-for-byte what it is today.

**Numbering** is automatic via a CSS counter on `.post-body`
(`counter-reset: sidenote-counter`), incremented by each `.sidenote-number`.
The marker (`.sidenote-number::after`) and the margin note prefix
(`.sidenote::before`) both render `counter(sidenote-counter)`. Numbering is
therefore independent of the author's label names and always sequential.

## Layout & styling

All styles live in `src/styles/global.css` alongside the existing `.post` rules,
using the existing warm custom properties (`--accent`, `--muted`, `--border`,
Newsreader body type).

### Wide viewport (min-width: 1200px)

- True margin notes. `.sidenote { float: right; clear: right; }` pulled into the
  right-hand whitespace via negative `margin-right`, so the note sits beside its
  sentence and following text flows past it.
- **The post column does not change.** It stays at today's 700px centered width
  (so the title stays aligned with the nav and footer); notes float into the
  existing whitespace to the right of that column. The float rule is gated by
  `.post:has(.sidenote)`, so note-less posts are byte-for-byte unchanged.
- This is why the breakpoint is 1200px rather than ~1024px: the centered 700px
  column needs a viewport that wide before the right whitespace is large enough
  to hold a ~200px note without clipping at the edge.
- Target metrics (final values tuned during implementation): note width ~200px,
  pulled ~228px right of the text column (≈28px gap).
- On wide screens the checkbox/toggle is irrelevant: notes are always visible in
  the margin, and the `<input>`/toggle affordance is hidden.

### Narrow viewport (max-width: 1199px)

- No gutter. `.sidenote` is hidden by default.
- The `.sidenote-number` label shows the superscript number inline and acts as
  the tap target (`for` the checkbox).
- Checking the box (`.margin-toggle:checked ~ .sidenote`) reveals the note inline
  as a block — smaller, muted, indented — directly after the paragraph. Tapping
  again collapses it. **Pure CSS, no JavaScript.**

### Look

- Superscript marker in `--accent`.
- Margin note in muted type, slightly smaller than body, Newsreader.
- Toggle is keyboard-focusable with an accessible name (e.g. visually-hidden
  text or `aria-label` on the label) so it is operable without a pointer.
- Any expand/collapse transition respects `prefers-reduced-motion` (instant when
  reduced motion is requested).

## Demonstration content

Add two genuine sidenotes to the existing post
`src/content/blog/a-keyboard-headphones-a-book.md` — both are already asides in
the prose:

- The Kindle / Calibre library line.
- The dormant 3D-printer line.

This ships the feature in real use rather than with placeholder content. Slug
and date are unchanged.

## Known trade-off — RSS

The full-content RSS endpoint (`src/pages/rss.xml.js`) renders posts through the
same markdown pipeline, so footnotes become sidenote markup in the feed too. In
a reader without our CSS, the `<input>`/`<label>` are stripped by the existing
`sanitize-html` allowlist and the note text appears inline immediately after its
sentence — readable, just without a margin or marker. This is acceptable for now
and can be refined later (e.g. a feed-specific rendering) if it ever matters.

## Out of scope

- Unnumbered margin notes (the symbol-marked Tufte "margin note" variant).
- Rich/block content inside notes beyond what inline footnote definitions allow.
- Feed-specific sidenote rendering.

## Verification

1. `npm run build` completes green.
2. Headless Firefox screenshots:
   - **≥1200px wide** (e.g. 1320px) — margin note rendered in the right gutter,
     aligned with its sentence; a note-less post still 700px centered.
   - **390px wide** — number inline, note hidden; then checked state showing the
     note expanded inline.
3. Confirm a note-less post is visually unchanged from current `main`.
