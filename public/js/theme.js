// Theme toggle — delegated click so it works regardless of when the button mounts.
document.addEventListener('click', (e) => {
  if (!e.target.closest('#theme-toggle')) return;
  const root = document.documentElement;
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('theme', next);
});
