// Turns an rrweb event stream into the viewer's side-panel entries: console
// lines, navigations and tab hidden/visible moments. Pure, so it runs as a
// classic script in the viewer and is imported directly by node:test.
(function (g) {
  const CUSTOM = 5;
  const PLUGIN = 6;
  const CONSOLE_PLUGIN = 'rrweb/console@1';

  // The console plugin JSON-stringifies each argument; show strings unquoted.
  function show(arg) {
    try {
      const v = JSON.parse(arg);
      return typeof v === 'string' ? v : arg;
    } catch {
      return String(arg);
    }
  }

  function build(events) {
    if (!events.length) return [];
    const t0 = events[0].timestamp;
    const out = [];
    for (const ev of events) {
      const d = ev.data;
      if (!d) continue;
      const offset = ev.timestamp - t0;
      if (ev.type === PLUGIN && d.plugin === CONSOLE_PLUGIN && d.payload && Array.isArray(d.payload.payload)) {
        out.push({ offset, kind: 'console', level: String(d.payload.level), text: d.payload.payload.map(show).join(' ') });
      } else if (ev.type === CUSTOM) {
        const p = d.payload || {};
        if (d.tag === 'early-console' && Array.isArray(p.args)) {
          out.push({ offset: Math.max(0, p.time - t0), kind: 'console', level: String(p.level), text: p.args.join(' ') });
        } else if (d.tag === 'navigate') {
          out.push({ offset, kind: 'nav', level: 'info', text: `Navigated to ${p.path}` });
        } else if (d.tag === 'tab-hidden') {
          out.push({ offset, kind: 'tab', level: 'info', text: 'Tab hidden' });
        } else if (d.tag === 'tab-visible') {
          out.push({ offset, kind: 'tab', level: 'info', text: 'Tab visible again' });
        } else if (d.tag === 'report-click') {
          out.push({ offset, kind: 'report', level: 'info', text: 'Clicked "report a problem"' });
        }
      }
    }
    return out.sort((a, b) => a.offset - b.offset);
  }

  // The four console filters. Tab and report-click markers count as navigation.
  function group(entry) {
    if (entry.kind !== 'console') return 'nav';
    if (entry.level === 'error') return 'error';
    if (entry.level === 'warn') return 'warning';
    return 'log';
  }

  function counts(entries) {
    const out = { error: 0, warning: 0, log: 0, nav: 0 };
    for (const e of entries) out[group(e)] += 1;
    return out;
  }

  // Which viewer action a key press means, or null. Pure so it can be tested:
  // the caller says whether focus is in a text field (typing), on a control
  // that uses Space itself (onControl), or on the split divider (onSeparator).
  function shortcut({ key, ctrlKey, altKey, metaKey, shiftKey, onControl, onSeparator, typing }) {
    if (typing || metaKey) return null;
    // Arrow keys do the same jobs as the letter keys, for browsers where an
    // extension (Vim-style navigation, say) takes J, K and the brackets.
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      // With Ctrl or Alt they belong to the browser (Alt+Left is Back).
      if (ctrlKey || altKey) return null;
      // Shift: newer or older report, Left being Newer like the buttons.
      if (shiftKey) return key === 'ArrowLeft' ? 'newer' : 'older';
      // On the divider, plain Left and Right resize the split.
      if (onSeparator) return null;
      return key === 'ArrowRight' ? 'next' : 'previous';
    }
    if (key === '[' || key === ']') {
      // On many layouts brackets need AltGr (reported as Ctrl+Alt) or Option
      // (Alt). Only a bare Ctrl is someone else's shortcut.
      if (ctrlKey && !altKey) return null;
      return key === '[' ? 'newer' : 'older';
    }
    if (ctrlKey || altKey) return null;
    if (key === 'j' || key === 'J') return 'next';
    if (key === 'k' || key === 'K') return 'previous';
    if (key === ' ' && !onControl) return 'toggle';
    return null;
  }

  // Which entry J or K should jump to, by position rather than by time, so
  // entries logged a few milliseconds apart are each reachable. `visible` is
  // the sorted indices passing the filters; `current` the entry playback is on
  // (-1 before the first). Stepping back from well inside an entry restarts it.
  function stepIndex(visible, current, dir, sinceCurrentMs) {
    if (dir > 0) {
      const next = visible.find((i) => i > current);
      return next === undefined ? -1 : next;
    }
    if (current >= 0 && sinceCurrentMs > 1000 && visible.includes(current)) return current;
    const before = visible.filter((i) => i < current);
    return before.length ? before[before.length - 1] : -1;
  }

  // Which entry to highlight at a playback time: the latest visible one at or
  // before it. `pinned` is the entry the viewer last jumped to; it wins over
  // entries logged at (almost) the same moment, so each can be shown in turn.
  const SAME_MOMENT_MS = 100;
  function currentIndex(offsets, visible, time, pinned) {
    if (pinned >= 0 && visible[pinned] && time >= offsets[pinned] && time - offsets[pinned] < SAME_MOMENT_MS) {
      return pinned;
    }
    let latest = -1;
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] <= time && visible[i]) latest = i;
    }
    return latest;
  }

  g.ReportEntries = { build, group, counts, shortcut, stepIndex, currentIndex };
})(globalThis);
