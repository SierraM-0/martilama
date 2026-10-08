// Report page: loads the events, mounts rrweb-player, and keeps the console
// panel and the timeline markers in step with playback.
(async function () {
  const root = document.getElementById('report');
  const log = document.getElementById('log');
  const mount = document.getElementById('player');
  const filters = document.getElementById('filters');
  const id = root.dataset.id;

  document.getElementById('delete').addEventListener('click', async () => {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    if (res.status === 204) location.href = '/';
    else alert('Could not delete the report.');
  });

  // Stepping between reports works even when this recording fails to load.
  let player = null;
  let step = () => {};
  let jump = () => {};
  document.addEventListener('keydown', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const action = window.ReportEntries.shortcut({
      key: e.key, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey,
      typing: !!el?.closest('input, textarea, select, [contenteditable]'),
      onControl: !!el?.closest('button, a, summary, [tabindex]'),
    });
    if (!action) return;
    if (action === 'newer' || action === 'older') document.getElementById(action)?.click();
    else if (action === 'next') step(1);
    else if (action === 'previous') step(-1);
    else if (player) {
      e.preventDefault(); // keep Space from scrolling the page
      player.toggle();
    }
  });

  const fail = (msg) => {
    mount.textContent = msg;
    filters.hidden = true;
  };

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

  // The split between replay and console is adjustable and remembered.
  const stage = document.querySelector('.stage');
  const divider = document.getElementById('divider');
  const SIDE_KEY = 'reports.sideWidth';
  const SIDE_MIN = 260;
  const MAIN_MIN = 380;
  const setSide = (px) => {
    const max = Math.max(SIDE_MIN, stage.clientWidth - MAIN_MIN);
    const width = Math.round(Math.min(max, Math.max(SIDE_MIN, px)));
    stage.style.setProperty('--side', `${width}px`);
    return width;
  };
  let saved = NaN;
  try { saved = Number(localStorage.getItem(SIDE_KEY)); } catch { /* storage blocked */ }
  if (saved > 0) setSide(saved);

  // Fit the replay and its controls in the window without scrolling.
  const CONTROLLER = 80; // rrweb-player's control bar
  const vw = Number(root.dataset.vw) || 1280;
  const vh = Number(root.dataset.vh) || 720;
  // Height taken by what sits under the replay: the note and the key hints.
  const below = () => [...mount.parentElement.children]
    .filter((el) => el !== mount)
    .reduce((h, el) => h + el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).marginTop), 16);
  const fit = () => {
    const width = mount.clientWidth;
    const room = window.innerHeight - mount.getBoundingClientRect().top - window.scrollY - CONTROLLER - below();
    return { width, height: Math.round(Math.max(240, Math.min(room, width * (vh / vw)))) };
  };
  const { width, height } = fit();

  const Player = window.rrwebPlayer.default || window.rrwebPlayer.Player || window.rrwebPlayer;
  player = new Player({
    target: mount,
    // maxScale 0 lifts the player's default cap of 1, so the replay grows to
    // fill a larger frame (fullscreen, or a big window) instead of stopping
    // at the visitor's own window size.
    props: { events, width, height, maxScale: 0, autoPlay: false, skipInactive: false, showController: true },
  });
  const total = Math.max(1, events[events.length - 1].timestamp - events[0].timestamp);

  // Re-fit the replay whenever its column changes size.
  let pending = 0;
  const refit = () => {
    // In fullscreen the player sizes itself to the screen; leave it alone.
    if (document.fullscreenElement) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      player.$set(fit());
      player.triggerResize();
    });
  };
  window.addEventListener('resize', () => {
    // A split saved on a wide window may not fit a narrower one.
    if (stage.style.getPropertyValue('--side')) setSide(parseFloat(stage.style.getPropertyValue('--side')));
    refit();
  });
  // The note and key hints change height when the web fonts swap in.
  document.fonts?.ready.then(refit);
  document.addEventListener('fullscreenchange', () => setTimeout(refit, 50));
  document.getElementById('details').addEventListener('toggle', refit);

  // Clicking the replay itself plays or pauses, like a video.
  mount.querySelector('.rr-player__frame')?.addEventListener('click', () => player.toggle());

  const sideWidth = () => document.querySelector('.side').getBoundingClientRect().width;
  const resize = (px) => {
    const applied = setSide(px);
    refit();
    return applied;
  };
  const persist = (px) => {
    try { localStorage.setItem(SIDE_KEY, String(px)); } catch { /* storage blocked */ }
  };
  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);
    stage.classList.add('dragging'); // lets the pointer pass over the replay iframe
    const right = stage.getBoundingClientRect().right;
    let applied = null;
    const move = (ev) => { applied = resize(right - ev.clientX - divider.offsetWidth / 2); };
    const stop = () => {
      stage.classList.remove('dragging');
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', stop);
      divider.removeEventListener('pointercancel', stop);
      if (applied !== null) persist(applied); // once, not on every movement
    };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', stop);
    divider.addEventListener('pointercancel', stop);
  });
  divider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') persist(resize(sideWidth() + 32));
    else if (e.key === 'ArrowRight') persist(resize(sideWidth() - 32));
    else return;
    e.preventDefault();
  });
  divider.addEventListener('dblclick', () => {
    stage.style.removeProperty('--side');
    refit();
    try { localStorage.removeItem(SIDE_KEY); } catch { /* storage blocked */ }
  });

  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const { build, group, counts } = window.ReportEntries;
  const entries = build(events).map((entry) => ({ ...entry, group: group(entry) }));

  // console panel
  const items = entries.map((entry) => {
    const li = document.createElement('li');
    li.className = `entry ${entry.group}`;
    const time = document.createElement('time');
    time.textContent = fmt(entry.offset);
    const text = document.createElement('span');
    text.textContent = entry.text;
    li.append(time, text);
    li.addEventListener('click', () => jump(entries.indexOf(entry)));
    log.append(li);
    return li;
  });
  const none = document.createElement('li');
  none.className = 'entry none';
  log.append(none);

  // markers: one tick per error, warning and navigation, drawn on the
  // player's own progress bar
  const marks = document.createElement('div');
  marks.className = 'marks';
  mount.querySelector('.rr-progress')?.append(marks);
  const ticks = entries.map((entry) => {
    if (entry.group === 'log') return null;
    const tick = document.createElement('button');
    tick.type = 'button';
    tick.className = `mark ${entry.group}`;
    tick.style.left = `${(entry.offset / total) * 100}%`;
    tick.title = `${fmt(entry.offset)}  ${entry.text}`;
    tick.addEventListener('click', (e) => {
      e.stopPropagation(); // the bar's own click would seek to the pointer instead
      jump(entries.indexOf(entry));
    });
    marks.append(tick);
    return tick;
  });

  // filters
  const shown = new Set(['error', 'warning', 'log', 'nav']);
  const tally = counts(entries);
  const applyFilters = () => {
    let visible = 0;
    entries.forEach((entry, i) => {
      const on = shown.has(entry.group);
      items[i].hidden = !on;
      if (ticks[i]) ticks[i].hidden = !on;
      if (on) visible += 1;
    });
    none.hidden = visible > 0;
    none.textContent = entries.length ? 'Nothing matches the filters.' : 'No console output or navigation in this recording.';
  };
  filters.querySelectorAll('button').forEach((btn) => {
    const key = btn.dataset.filter;
    btn.querySelector('.n').textContent = tally[key];
    btn.disabled = tally[key] === 0;
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      if (on) shown.add(key); else shown.delete(key);
      applyFilters();
      sync(now);
    });
  });
  applyFilters();

  // follow playback: highlight the latest visible entry at or before now
  let now = 0;
  let current = -1;
  let pinned = -1; // the entry last jumped to; see ReportEntries.currentIndex
  const offsets = entries.map((entry) => entry.offset);
  function sync(time) {
    now = time;
    const latest = window.ReportEntries.currentIndex(
      offsets, entries.map((entry) => shown.has(entry.group)), time, pinned,
    );
    if (latest !== pinned) pinned = -1;
    if (latest === current) return;
    if (current >= 0) {
      items[current].classList.remove('current');
      ticks[current]?.classList.remove('on');
    }
    current = latest;
    if (current >= 0) {
      items[current].classList.add('current');
      ticks[current]?.classList.add('on');
      // Scroll the console list only; scrollIntoView would move the page too.
      const box = log.getBoundingClientRect();
      const row = items[current].getBoundingClientRect();
      if (row.top < box.top) log.scrollTop -= box.top - row.top;
      else if (row.bottom > box.bottom) log.scrollTop += row.bottom - box.bottom;
    }
  }
  player.addEventListener('ui-update-current-time', (e) => sync(e.payload));
  // Go to an entry and show it as current, even if others share its moment.
  jump = (i) => {
    pinned = i;
    player.goto(entries[i].offset);
    sync(entries[i].offset);
  };
  sync(0);

  // J / K: jump to the next or previous visible entry, by position
  step = (dir) => {
    const visible = entries.map((entry, i) => (shown.has(entry.group) ? i : -1)).filter((i) => i >= 0);
    const since = current >= 0 ? now - entries[current].offset : 0;
    const target = window.ReportEntries.stepIndex(visible, current, dir, since);
    if (target >= 0) jump(target);
  };
})();
