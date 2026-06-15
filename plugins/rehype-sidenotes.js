import { visit, SKIP, EXIT } from 'unist-util-visit';

// remark-rehype's default clobber prefix for footnote ids.
const FN_PREFIX = 'user-content-fn-';

/**
 * Rewrites remark-gfm footnotes into Tufte sidenotes:
 *   <input type=checkbox class=margin-toggle id=sn-x>   (visually hidden)
 *   <label class="sidenote-number" for=sn-x>            (the visible in-text marker)
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

    // Pass 2: replace each inline reference with the triplet. GFM allows a
    // footnote label to be referenced more than once; track emissions per
    // label so reused references get unique ids (sn-a, sn-a-2, sn-a-3, ...).
    const counts = new Map();
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
      const n = (counts.get(label) || 0) + 1;
      counts.set(label, n);
      const sid = n === 1 ? `sn-${label}` : `sn-${label}-${n}`;
      const triplet = [
        el('input', { type: 'checkbox', id: sid, className: ['margin-toggle'] }),
        el('label', {
          htmlFor: sid,
          className: ['sidenote-number'],
          'aria-label': 'Toggle sidenote',
        }),
        el('span', { className: ['sidenote'] }, cloneNodes(content)),
      ];
      parent.children.splice(index, 1, ...triplet);
      return [SKIP, index + triplet.length];
    });
  };
}

function el(tagName, properties, children = []) {
  return { type: 'element', tagName, properties, children };
}

// Deep-clone hast nodes so a reused definition's content isn't shared across
// multiple positions in the tree.
function cloneNodes(nodes) {
  return nodes.map((node) => structuredClone(node));
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
// the back-reference anchor. Leading/trailing whitespace-only text nodes are trimmed.
// Multi-paragraph definitions are joined with a single space so the inlined
// span doesn't fuse the paragraphs (e.g. "First.Second.").
function extractInline(li) {
  const out = [];
  let emittedGroup = false;
  for (const child of li.children) {
    if (child.type === 'element' && child.tagName === 'p') {
      if (emittedGroup) out.push({ type: 'text', value: ' ' });
      for (const c of child.children) {
        if (!isBackref(c)) out.push(c);
      }
      emittedGroup = true;
    } else if (child.type === 'text' && child.value.trim() === '') {
      // Skip whitespace-only text nodes between <li> and its <p> children.
    } else if (!isBackref(child)) {
      if (emittedGroup) out.push({ type: 'text', value: ' ' });
      out.push(child);
      emittedGroup = true;
    }
  }
  // Trim trailing whitespace-only text nodes (left by stripping the backref anchor).
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last.type === 'text' && last.value.trim() === '') {
      out.pop();
    } else {
      break;
    }
  }
  // Trim trailing whitespace from the last text node if it ends with spaces.
  if (out.length > 0) {
    const last = out[out.length - 1];
    if (last.type === 'text') {
      last.value = last.value.trimEnd();
    }
  }
  return out;
}

function isBackref(node) {
  return (
    node.type === 'element' &&
    node.properties &&
    'dataFootnoteBackref' in node.properties
  );
}
