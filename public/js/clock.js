// Local Tallinn time in the home hero, updated on each minute boundary.
const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Tallinn' });
let timer;
function tick() {
  const el = document.getElementById('localtime');
  if (!el) return;
  el.textContent = fmt.format(new Date());
  const now = new Date();
  const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  clearTimeout(timer);
  timer = setTimeout(tick, ms + 50);
}
document.addEventListener('DOMContentLoaded', tick);
