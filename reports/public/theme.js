// Light or dark, as on martilama.com: a saved choice if there is one,
// otherwise the system setting. Loaded in <head> before the stylesheet so the
// page never flashes the wrong palette. The choice is kept for this site only;
// the main site keeps its own.
(function (g) {
  function pick(stored, prefersDark) {
    if (stored === 'dark' || stored === 'light') return stored;
    return prefersDark ? 'dark' : 'light';
  }
  g.ReportTheme = { pick };
  if (typeof document === 'undefined') return; // imported by a test

  const KEY = 'theme';
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  const root = document.documentElement;
  root.dataset.theme = pick(stored, matchMedia('(prefers-color-scheme: dark)').matches);

  // Delegated, so it works whenever the button is parsed.
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('#theme-toggle')) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
  });
})(globalThis);
