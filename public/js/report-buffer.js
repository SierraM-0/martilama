// Rolling buffer of rrweb events for the problem-report feature. Pure logic:
// no DOM, no rrweb. Runs as a classic script in the browser and is imported
// directly by node:test, so it attaches to globalThis instead of exporting.
//
// Events are grouped into segments, each beginning at a Meta event (rrweb
// emits one before every full snapshot). A replay can only start at a full
// snapshot, so whole segments are dropped — never individual events.
(function (g) {
  const META = 4;
  const INCREMENTAL = 3;
  const MOVE_SOURCES = [1, 6, 12]; // MouseMove, TouchMove, Drag

  function create({ windowMs = 180000 } = {}) {
    const segments = []; // { start, events }

    function push(event) {
      if (event.type === META || segments.length === 0) {
        segments.push({ start: event.timestamp, events: [] });
      }
      segments[segments.length - 1].events.push(event);
      // Drop the oldest segment only while the next one still reaches back
      // past the window, so at least windowMs of history always remains.
      const floor = event.timestamp - windowMs;
      while (segments.length > 1 && segments[1].start <= floor) segments.shift();
    }

    function freeze(markerTime) {
      const out = [];
      for (const seg of segments) {
        for (const ev of seg.events) {
          const kept = trim(ev, markerTime);
          if (kept) out.push(kept);
        }
      }
      return out;
    }

    return {
      push,
      freeze,
      lastCheckoutAt: () => (segments.length ? segments[segments.length - 1].start : 0),
      segmentCount: () => segments.length,
    };
  }

  // Movement is emitted in batches stamped with the flush time, each position
  // carrying a negative offset. A batch flushed after the marker can still
  // hold positions from before it; keep those and re-stamp the batch.
  function trim(ev, markerTime) {
    if (ev.timestamp <= markerTime) return ev;
    const d = ev.data;
    const isMove = ev.type === INCREMENTAL && d && MOVE_SOURCES.includes(d.source)
      && Array.isArray(d.positions);
    if (!isMove) return null;
    const shift = ev.timestamp - markerTime;
    const positions = d.positions
      .filter((p) => ev.timestamp + p.timeOffset <= markerTime)
      .map((p) => ({ ...p, timeOffset: p.timeOffset + shift }));
    if (positions.length === 0) return null;
    return { ...ev, timestamp: markerTime, data: { ...d, positions } };
  }

  g.ReportBuffer = { create };
})(globalThis);
