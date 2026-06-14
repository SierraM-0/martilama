// Reading-progress bar — fills only on pages that contain a .post article.
function updateProgress() {
  const bar = document.getElementById('reading-progress');
  if (!bar) return;
  const article = document.querySelector('.post');
  if (!article) { bar.style.width = '0'; return; }
  const scrollable = article.offsetTop + article.offsetHeight - window.innerHeight;
  const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
  bar.style.width = Math.min(100, Math.max(0, progress * 100)) + '%';
}
// Window listeners bind once; `page:load` re-checks after each router swap.
window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('resize', updateProgress);
document.addEventListener('page:load', updateProgress);
