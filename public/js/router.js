// Minimal client-side router. Crossfades same-origin navigations — using the
// native View Transitions API where supported (Chromium), and a manual opacity
// fade everywhere else (Firefox/Zen) — then re-emits a `page:load` event so
// per-page scripts (clock, reading-progress) re-initialise after each swap.
//
// Only the <main> content is swapped; the persistent shell (<html data-theme>,
// nav, footer, reading-progress bar) stays put, so theme + delegated handlers
// survive navigation without re-binding.

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tracks the currently-loaded path so popstate can tell a real page change from
// a hash-only change on the same page.
let currentPath = location.pathname + location.search;

// Meta tags that change per page; everything else in <head> is shared.
const META_SELECTOR =
  'meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]';

function syncHead(doc) {
  document.title = doc.title;
  document.head.querySelectorAll(META_SELECTOR).forEach((n) => n.remove());
  doc.head
    .querySelectorAll(META_SELECTOR)
    .forEach((n) => document.head.appendChild(n.cloneNode(true)));
}

function swap(doc, href, push) {
  syncHead(doc);
  document.querySelector('main').innerHTML = doc.querySelector('main').innerHTML;
  if (push) history.pushState({}, '', href);
  currentPath = location.pathname + location.search;
  // Honor a deep-link anchor (/blog/post#note); otherwise start at the top.
  const hash = new URL(href, location.origin).hash;
  if (hash) document.querySelector(hash)?.scrollIntoView();
  else window.scrollTo(0, 0);
  document.dispatchEvent(new Event('page:load'));
}

async function navigate(href, push = true) {
  let doc;
  try {
    const res = await fetch(href);
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('text/html')) {
      location.href = href;
      return;
    }
    doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  } catch {
    location.href = href; // network error — fall back to a full navigation
    return;
  }
  if (!doc.querySelector('main')) {
    location.href = href;
    return;
  }

  if (document.startViewTransition && !reduced()) {
    document.startViewTransition(() => swap(doc, href, push));
  } else if (!reduced()) {
    const main = document.querySelector('main');
    main.style.transition = 'opacity 0.15s ease';
    main.style.opacity = '0';
    await new Promise((r) => setTimeout(r, 150));
    try {
      swap(doc, href, push);
    } catch {
      main.style.opacity = '1'; // never leave the page invisible
      location.href = href;
      return;
    }
    const fresh = document.querySelector('main');
    fresh.style.opacity = '0';
    // Two frames: let the opacity:0 paint commit before transitioning to 1,
    // otherwise the browser may batch both writes and skip the fade.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        fresh.style.transition = 'opacity 0.25s ease';
        fresh.style.opacity = '1';
      }),
    );
  } else {
    swap(doc, href, push);
  }
}

function eligible(e, a) {
  return (
    a &&
    a.href &&
    new URL(a.href).origin === location.origin &&
    a.target !== '_blank' &&
    !a.hasAttribute('download') &&
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  );
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!eligible(e, a)) return;
  const url = new URL(a.href);
  // In-page hash links scroll normally; non-page files (rss.xml, og .png) load normally.
  if (url.pathname === location.pathname && url.hash) return;
  if (/\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.endsWith('.html')) return;
  e.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});

window.addEventListener('popstate', () => {
  const path = location.pathname + location.search;
  if (path === currentPath) {
    // Hash-only change on the same page — just honor the anchor, don't refetch.
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
    return;
  }
  navigate(path + location.hash, false);
});

if (history.scrollRestoration) history.scrollRestoration = 'manual';

// Initial load fires `page:load` through the same path the router uses after a
// swap, so clock/progress have a single initialisation entry point.
document.addEventListener('DOMContentLoaded', () =>
  document.dispatchEvent(new Event('page:load')),
);
