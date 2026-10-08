// Report page: loads the events, mounts rrweb-player, and keeps the side
// panel (console, navigations, tab changes) in step with playback.
(async function () {
  const root = document.getElementById('report');
  const log = document.getElementById('log');
  const mount = document.getElementById('player');
  const id = root.dataset.id;

  document.getElementById('delete').addEventListener('click', async () => {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    if (res.status === 204) location.href = '/';
    else alert('Could not delete the report.');
  });

  const fail = (msg) => { mount.textContent = msg; };

  let events;
  try {
    const res = await fetch(`/api/reports/${id}/events`);
    if (!res.ok) return fail('This recording is no longer available.');
    ({ events } = await res.json());
  } catch {
    return fail('Could not load the recording.');
  }
  // rrweb needs a Meta + FullSnapshot pair to draw anything.
  if (!Array.isArray(events) || events.length < 2) return fail('This recording is empty.');

  const vw = Number(root.dataset.vw) || 1280;
  const vh = Number(root.dataset.vh) || 720;
  const width = mount.clientWidth;
  const height = Math.round(Math.min(window.innerHeight * 0.7, width * (vh / vw)));

  const Player = window.rrwebPlayer.default || window.rrwebPlayer.Player || window.rrwebPlayer;
  const player = new Player({
    target: mount,
    props: { events, width, height, autoPlay: false, skipInactive: false, showController: true },
  });

  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const entries = window.ReportEntries.build(events);
  const items = entries.map((entry) => {
    const li = document.createElement('li');
    li.className = `entry ${entry.kind} lvl-${entry.level}`;
    const time = document.createElement('time');
    time.textContent = fmt(entry.offset);
    const text = document.createElement('span');
    text.textContent = entry.text;
    li.append(time, text);
    li.addEventListener('click', () => player.goto(entry.offset));
    log.append(li);
    return li;
  });
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'entry empty';
    li.textContent = 'No console output or navigation in this recording.';
    log.append(li);
  }

  let lastShown = -1;
  player.addEventListener('ui-update-current-time', (e) => {
    const now = e.payload;
    let current = -1;
    for (let i = 0; i < entries.length; i++) {
      const past = entries[i].offset <= now;
      items[i].classList.toggle('past', past);
      if (past) current = i;
    }
    if (current !== lastShown && current >= 0) {
      items[current].scrollIntoView({ block: 'nearest' });
      lastShown = current;
    }
  });
})();
