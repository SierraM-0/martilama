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

  g.ReportEntries = { build, group, counts };
})(globalThis);
