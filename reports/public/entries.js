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

  const FULL = 2;
  const INCREMENTAL = 3;
  const MUTATION = 0;
  const MOUSE_INTERACTION = 2;
  const CLICK = 2;
  const ELEMENT_NODE = 2;
  const TEXT_NODE = 3;
  const CLICK_TEXT_MAX = 60;

  // Every node the recording ever mentions, by rrweb id, from the full
  // snapshots and the mutations that add nodes. Ids are never reused within a
  // recording, so a click's target can be described whenever it happened.
  function indexNodes(events) {
    const nodes = new Map();
    const add = (node, parent) => {
      if (!node || typeof node.id !== 'number') return;
      nodes.set(node.id, {
        tag: node.type === ELEMENT_NODE ? String(node.tagName).toLowerCase() : null,
        text: node.type === TEXT_NODE ? String(node.textContent ?? '') : null,
        parent,
        children: [],
      });
      for (const child of node.childNodes || []) add(child, node.id);
    };
    for (const ev of events) {
      const d = ev.data;
      if (!d) continue;
      if (ev.type === FULL && d.node) add(d.node, null);
      else if (ev.type === INCREMENTAL && d.source === MUTATION && Array.isArray(d.adds)) {
        for (const a of d.adds) add(a.node, a.parentId);
      }
    }
    // Mutations can list a child before its parent, so link children last.
    for (const [id, node] of nodes) nodes.get(node.parent)?.children.push(id);
    return nodes;
  }

  const tidy = (text) => {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length > CLICK_TEXT_MAX ? `${t.slice(0, CLICK_TEXT_MAX)}…` : t;
  };
  function allText(nodes, id) {
    const node = nodes.get(id);
    if (!node) return '';
    if (node.text !== null) return node.text;
    return node.children.map((child) => allText(nodes, child)).join(' ');
  }
  const ownText = (nodes, node) => node.children
    .map((child) => nodes.get(child))
    .filter((child) => child && child.text !== null)
    .map((child) => child.text)
    .join(' ');

  // "Clicked link "blog"", "Clicked button "Send"", "Clicked "some text"",
  // or "Clicked <div>" for an element with no text of its own.
  function describeClick(nodes, id) {
    const hit = nodes.get(id);
    if (!hit) return 'Clicked';
    const at = hit.tag ? id : hit.parent; // a text node: use its element
    let cur = at;
    for (let depth = 0; depth < 6 && cur != null; depth++) {
      const node = nodes.get(cur);
      if (!node) break;
      if (node.tag === 'a' || node.tag === 'button') {
        const what = node.tag === 'a' ? 'link' : 'button';
        const label = tidy(allText(nodes, cur));
        return label ? `Clicked ${what} "${label}"` : `Clicked ${what}`;
      }
      cur = node.parent;
    }
    const element = nodes.get(at);
    if (!element) return 'Clicked';
    const label = tidy(ownText(nodes, element));
    return label ? `Clicked "${label}"` : `Clicked <${element.tag}>`;
  }

  function build(events) {
    if (!events.length) return [];
    const t0 = events[0].timestamp;
    const nodes = indexNodes(events);
    const out = [];
    for (const ev of events) {
      const d = ev.data;
      if (!d) continue;
      const offset = ev.timestamp - t0;
      if (ev.type === PLUGIN && d.plugin === CONSOLE_PLUGIN && d.payload && Array.isArray(d.payload.payload)) {
        out.push({ offset, kind: 'console', level: String(d.payload.level), text: d.payload.payload.map(show).join(' ') });
      } else if (ev.type === INCREMENTAL && d.source === MOUSE_INTERACTION && d.type === CLICK) {
        out.push({ offset, kind: 'click', level: 'info', text: describeClick(nodes, d.id) });
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
        } else if (d.tag === 'key' && typeof p.combo === 'string') {
          out.push({ offset, kind: 'key', level: 'info', text: `Pressed ${p.combo}` });
        }
      }
    }
    // The click on "report a problem" is already the report entry; don't list it twice.
    const reports = out.filter((e) => e.kind === 'report').map((e) => e.offset);
    return out
      .filter((e) => e.kind !== 'click' || !reports.some((r) => e.offset <= r && r - e.offset < 150))
      .sort((a, b) => a.offset - b.offset);
  }

  // The console filters. Tab and report-click markers count as navigation.
  function group(entry) {
    if (entry.kind === 'click' || entry.kind === 'key') return entry.kind;
    if (entry.kind !== 'console') return 'nav';
    if (entry.level === 'error') return 'error';
    if (entry.level === 'warn') return 'warning';
    return 'log';
  }

  function counts(entries) {
    const out = { error: 0, warning: 0, log: 0, nav: 0, click: 0, key: 0 };
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
