# Tufte Sidenotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render standard markdown footnotes as Tufte sidenotes — margin notes on wide screens, tap-to-expand inline on narrow screens — with no new authoring syntax and no JavaScript.

**Architecture:** A local rehype plugin rewrites remark-gfm's generated footnote HTML (inline `<sup>` references + bottom `<section data-footnotes>`) into the tufte-css `input`/`label`/`span.sidenote` triplet and deletes the footnotes section. CSS handles numbering (a counter), the wide-screen right-margin float, and the narrow-screen checkbox-hack collapse. The post column stays exactly as it is today; notes float into the existing right-hand whitespace only on viewports ≥1200px.

**Tech Stack:** Astro 5, remark-gfm (Astro default), rehype, unist-util-visit, CSS. Unit test via Node's built-in `node:test` runner driving a unified/remark/rehype pipeline.

---

### Task 1: The `rehype-sidenotes` plugin (with unit tests)

**Files:**
- Create: `src/plugins/rehype-sidenotes.js`
- Create: `test/rehype-sidenotes.test.mjs`
- Modify: `package.json` (add dependency + devDependencies + test script)

- [ ] **Step 1: Install the runtime dep and test-only deps**

`unist-util-visit` is used by the plugin at runtime; the remark/rehype packages are only needed by the unit test to reproduce Astro's footnote HTML.

Run:
```bash
npm install unist-util-visit
npm install -D remark-parse remark-gfm remark-rehype rehype-stringify unified
```
Expected: installs complete, `package.json` and `package-lock.json` updated.

- [ ] **Step 2: Add a test script to package.json**

In `package.json`, add to the `"scripts"` object:
```json
"test": "node --test"
```

- [ ] **Step 3: Write the failing unit test**

Create `test/rehype-sidenotes.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeSidenotes from '../src/plugins/rehype-sidenotes.js';

// Mirrors Astro's pipeline: GFM footnotes -> hast -> our transform -> HTML.
function render(md) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSidenotes)
    .use(rehypeStringify)
    .processSync(md)
    .toString();
}

const SAMPLE = 'A claim.[^k]\n\n[^k]: The aside.\n';

test('emits the sidenote triplet for a footnote reference', () => {
  const html = render(SAMPLE);
  assert.match(html, /<input[^>]*type="checkbox"[^>]*id="sn-k"[^>]*>/);
  assert.match(html, /class="margin-toggle sidenote-number"/);
  assert.match(html, /<span class="sidenote">The aside\.<\/span>/);
});

test('removes the bottom footnotes section', () => {
  const html = render(SAMPLE);
  assert.doesNotMatch(html, /data-footnotes/);
  assert.doesNotMatch(html, /<section/);
});

test('drops the back-reference anchor', () => {
  const html = render(SAMPLE);
  assert.doesNotMatch(html, /data-footnote-backref/);
});

test('a post with no footnotes is left untouched', () => {
  const html = render('Just a plain paragraph.\n');
  assert.doesNotMatch(html, /sidenote/);
  assert.doesNotMatch(html, /margin-toggle/);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/plugins/rehype-sidenotes.js'` (file not created yet).

- [ ] **Step 5: Implement the plugin**

Create `src/plugins/rehype-sidenotes.js`:
```js
import { visit, SKIP, EXIT } from 'unist-util-visit';

// remark-rehype's default clobber prefix for footnote ids.
const FN_PREFIX = 'user-content-fn-';

/**
 * Rewrites remark-gfm footnotes into Tufte sidenotes:
 *   <input type=checkbox class=margin-toggle id=sn-x>
 *   <label class="margin-toggle sidenote-number" for=sn-x>
 *   <span class=sidenote>...definition...</span>
 * and removes the bottom <section data-footnotes>. No-ops when there are
 * no footnotes.
 */
export default function rehypeSidenotes() {
  return (tree) => {
    // Pass 1: collect definitions, then remove the footnotes section.
    const defs = new Map();
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'section') return;
      if (!node.properties || !node.properties.dataFootnotes) return;
      const ol = findElement(node, (n) => n.tagName === 'ol');
      if (ol) {
        for (const li of ol.children) {
          if (li.type !== 'element' || li.tagName !== 'li') continue;
          const id = li.properties && li.properties.id;
          if (!id) continue;
          defs.set(id, extractInline(li));
        }
      }
      parent.children.splice(index, 1);
      return [SKIP, index];
    });

    if (defs.size === 0) return;

    // Pass 2: replace each inline reference with the triplet.
    visit(tree, 'element', (node, index, parent) => {
      if (node.tagName !== 'sup') return;
      const a = node.children.find(
        (c) =>
          c.type === 'element' &&
          c.tagName === 'a' &&
          c.properties &&
          c.properties.dataFootnoteRef
      );
      if (!a) return;
      const id = String(a.properties.href || '').replace(/^#/, '');
      const content = defs.get(id);
      if (!content) return;
      const label = id.startsWith(FN_PREFIX) ? id.slice(FN_PREFIX.length) : id;
      const sid = `sn-${label}`;
      const triplet = [
        el('input', { type: 'checkbox', id: sid, className: ['margin-toggle'] }),
        el('label', {
          htmlFor: sid,
          className: ['margin-toggle', 'sidenote-number'],
          'aria-label': 'Toggle sidenote',
        }),
        el('span', { className: ['sidenote'] }, content),
      ];
      parent.children.splice(index, 1, ...triplet);
      return [SKIP, index + triplet.length];
    });
  };
}

function el(tagName, properties, children = []) {
  return { type: 'element', tagName, properties, children };
}

function findElement(root, pred) {
  let found = null;
  visit(root, 'element', (n) => {
    if (pred(n)) {
      found = n;
      return EXIT;
    }
  });
  return found;
}

// Pull inline content out of a footnote <li>, unwrapping its <p> and dropping
// the back-reference anchor.
function extractInline(li) {
  const out = [];
  for (const child of li.children) {
    if (child.type === 'element' && child.tagName === 'p') {
      for (const c of child.children) {
        if (!isBackref(c)) out.push(c);
      }
    } else if (!isBackref(child)) {
      out.push(child);
    }
  }
  return out;
}

function isBackref(node) {
  return (
    node.type === 'element' &&
    node.properties &&
    node.properties.dataFootnoteBackref
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all four tests green.

- [ ] **Step 7: Commit**

```bash
git add src/plugins/rehype-sidenotes.js test/rehype-sidenotes.test.mjs package.json package-lock.json
git -c user.name="marti" -c user.email="z2bvxdysxt@privaterelay.appleid.com" commit -m "rehype-sidenotes plugin: rewrite gfm footnotes into Tufte sidenote markup

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wire the plugin into Astro's markdown pipeline

**Files:**
- Modify: `astro.config.mjs`

- [ ] **Step 1: Import and register the plugin**

In `astro.config.mjs`, add the import at the top (after the existing imports):
```js
import rehypeSidenotes from './src/plugins/rehype-sidenotes.js';
```
Then add `rehypePlugins` inside the existing `markdown` block, as a sibling of `shikiConfig`:
```js
  markdown: {
    rehypePlugins: [rehypeSidenotes],
    shikiConfig: {
      // Warm dual themes; defaultColor:false emits CSS vars we switch by data-theme.
      themes: { light: 'rose-pine-dawn', dark: 'rose-pine-moon' },
      defaultColor: false,
      wrap: true,
    },
  },
```

- [ ] **Step 2: Build to verify the pipeline still works**

Run: `npm run build`
Expected: build completes green (no footnote content yet, so no visible change).

- [ ] **Step 3: Commit**

```bash
git add astro.config.mjs
git -c user.name="marti" -c user.email="z2bvxdysxt@privaterelay.appleid.com" commit -m "Wire rehype-sidenotes into Astro markdown pipeline

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Sidenote styling (counter, wide-screen margin float, mobile collapse)

**Files:**
- Modify: `src/styles/global.css` (append a new block after the existing `.post` rules, before the closing media queries — placement is not critical, append at end of file is fine)

- [ ] **Step 1: Add the sidenote CSS**

Append to `src/styles/global.css`:
```css
/* ── Tufte sidenotes ───────────────────────────────────────────────────── */
.post-body { counter-reset: sidenote-counter; }

/* Focusable but visually-hidden toggle (drives the mobile collapse). */
.margin-toggle {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  opacity: 0;
  clip: rect(0 0 0 0);
}

/* Inline superscript marker; also the tap target on narrow screens. */
.sidenote-number {
  counter-increment: sidenote-counter;
  cursor: pointer;
}
.sidenote-number::after {
  content: counter(sidenote-counter);
  font-size: 0.68em;
  vertical-align: super;
  line-height: 0;
  margin-left: 1px;
  color: var(--accent);
}
/* Visible focus ring on the marker when its hidden checkbox is focused. */
.margin-toggle:focus-visible + .sidenote-number::after {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

.sidenote {
  font-family: var(--font-body);
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--muted);
}
.sidenote::before {
  content: counter(sidenote-counter) " ";
  color: var(--accent);
}

/* Narrow screens: collapsed until the marker is tapped, then inline. */
@media (max-width: 1199px) {
  .sidenote { display: none; }
  .margin-toggle:checked ~ .sidenote {
    display: block;
    margin: 0.6rem 0 0.9rem;
    padding-left: 1rem;
    border-left: 2px solid var(--border);
  }
}

/* Wide screens: float into the right-hand whitespace, only when present. */
@media (min-width: 1200px) {
  .post:has(.sidenote) .sidenote {
    float: right;
    clear: right;
    width: 200px;
    margin-right: -228px;
    margin-top: 0.25rem;
    margin-bottom: 0.6rem;
    position: relative;
  }
}
```

- [ ] **Step 2: Build to confirm CSS is valid and bundles**

Run: `npm run build`
Expected: build completes green.

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git -c user.name="marti" -c user.email="z2bvxdysxt@privaterelay.appleid.com" commit -m "Sidenote styles: counter numbering, wide-screen margin float, mobile collapse

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Ship two real sidenotes in the keyboard post

**Files:**
- Modify: `src/content/blog/a-keyboard-headphones-a-book.md`

- [ ] **Step 1: Add footnote references and definitions**

In `src/content/blog/a-keyboard-headphones-a-book.md`, make these two edits in the body.

Edit A — the Kindle/Calibre sentence. Change:
```
the answer. It's a Kindle, technically, loaded from a Calibre library I drift
through most evenings to pick what's next. I count it as a book because that's
what the hands and the eyes are doing.
```
to:
```
the answer.[^kindle] I count it as a book because that's
what the hands and the eyes are doing.
```
and append the definition at the very end of the file (after the final paragraph), on its own line:
```
[^kindle]: It's a Kindle, technically, loaded from a Calibre library I drift through most evenings to pick what's next.
```

Edit B — the 3D-printer sentence. Change:
```
3D printer that hasn't run in more than eight months, a small shelf of board
games, a drawer of cables I keep meaning to sort. None of that made the list.
```
to:
```
3D printer that hasn't run in more than eight months,[^printer] a small shelf of board
games, a drawer of cables I keep meaning to sort. None of that made the list.
```
and append its definition after the `[^kindle]` one:
```
[^printer]: Wanting to use a thing isn't the same as reaching for it — the printer is pure intention.
```

- [ ] **Step 2: Build and confirm the sidenote markup renders into the post**

Run:
```bash
npm run build && grep -c 'class="sidenote"' dist/blog/a-keyboard-headphones-a-book/index.html
```
Expected: build green, and the count is `2`.

- [ ] **Step 3: Confirm the footnotes section is gone**

Run: `grep -c 'data-footnotes' dist/blog/a-keyboard-headphones-a-book/index.html || echo 0`
Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add src/content/blog/a-keyboard-headphones-a-book.md
git -c user.name="marti" -c user.email="z2bvxdysxt@privaterelay.appleid.com" commit -m "Use sidenotes in the keyboard post (Kindle/Calibre + dormant 3D printer)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Visual verification (wide margin note + mobile collapse/expand)

**Files:** none (verification only)

- [ ] **Step 1: Serve the built site**

Run (background): `npm run preview` (note the port, typically 4321).

- [ ] **Step 2: Wide-screen screenshot (margin note in the gutter)**

Run:
```bash
TMP=$(mktemp -d); printf 'user_pref("ui.prefersReducedMotion", 1);\n' > "$TMP/prefs.js"
firefox --headless --no-remote --profile "$TMP" --window-size 1320,1000 \
  --screenshot /tmp/sidenote-wide.png \
  http://localhost:4321/blog/a-keyboard-headphones-a-book/
```
Then read `/tmp/sidenote-wide.png`.
Expected: superscript ¹/² markers inline in the prose, and the note text sitting in the right-hand whitespace beside its sentence.

- [ ] **Step 3: Narrow-screen screenshot (collapsed)**

Run:
```bash
TMP=$(mktemp -d); printf 'user_pref("ui.prefersReducedMotion", 1);\n' > "$TMP/prefs.js"
firefox --headless --no-remote --profile "$TMP" --window-size 390,900 \
  --screenshot /tmp/sidenote-narrow.png \
  http://localhost:4321/blog/a-keyboard-headphones-a-book/
```
Then read `/tmp/sidenote-narrow.png`.
Expected: inline ¹/² markers, note text hidden (no margin column).

- [ ] **Step 4: Confirm a note-less post is unchanged**

Run:
```bash
TMP=$(mktemp -d); printf 'user_pref("ui.prefersReducedMotion", 1);\n' > "$TMP/prefs.js"
firefox --headless --no-remote --profile "$TMP" --window-size 1320,1000 \
  --screenshot /tmp/noteless.png \
  http://localhost:4321/blog/hello-world/
```
Then read `/tmp/noteless.png`.
Expected: identical 700px centered layout as before (no widening, no stray markers).

- [ ] **Step 5: Stop the preview server.**

- [ ] **Step 6: Mark task #11 complete** and report results with the screenshots.

Note: the checked/expanded mobile state is driven purely by the checkbox `:checked` selector and cannot be triggered in a static headless screenshot without interaction; it is covered structurally by the CSS rule and the Task 1 unit tests. Visual confirmation of the expanded state, if desired, is a manual click in a real browser.

---

## Notes for the implementer

- **Do not** change `--maxw` or the `.container`/`.post` widths. The wide-screen layout deliberately keeps today's 700px centered column and floats notes into the existing outer whitespace, gated by `.post:has(.sidenote)` so note-less posts are untouched.
- The RSS feed runs the same pipeline; in a reader without our CSS the `<input>`/`<label>` are stripped by the existing sanitize-html allowlist and the note text reads inline after its sentence. This is the documented, accepted trade-off — no action needed.
- Author syntax is plain GFM footnotes; named labels (`[^kindle]`) are preferred for readability.
