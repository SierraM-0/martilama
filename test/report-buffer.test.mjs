import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/js/report-buffer.js';

const { create } = globalThis.ReportBuffer;

const meta = (t) => ({ type: 4, timestamp: t, data: {} });
const full = (t) => ({ type: 2, timestamp: t, data: {} });
const inc = (t) => ({ type: 3, timestamp: t, data: { source: 2 } });
const move = (t, offsets) => ({
  type: 3,
  timestamp: t,
  data: { source: 1, positions: offsets.map((o, i) => ({ x: i, y: i, id: 1, timeOffset: o })) },
});
const checkout = (buf, t) => { buf.push(meta(t)); buf.push(full(t)); };

test('a Meta event starts a new segment', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(inc(10));
  checkout(buf, 30000);
  assert.equal(buf.segmentCount(), 2);
  assert.equal(buf.lastCheckoutAt(), 30000);
});

test('clock-driven checkouts with no events between keep 180–210 s', () => {
  const buf = create();
  for (let t = 0; t <= 600000; t += 30000) {
    checkout(buf, t);
    if (t < 180000) continue;
    for (const end of [t, t + 29999]) {
      const events = buf.freeze(end);
      const span = end - events[0].timestamp;
      assert.ok(span >= 180000 && span < 210000, `span ${span} at end ${end}`);
      assert.equal(events[0].type, 4);
    }
  }
});

test('short session: freeze returns everything there is', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(inc(5000));
  assert.deepEqual(buf.freeze(6000).map((e) => e.timestamp), [0, 0, 5000]);
});

test('freeze drops events after the marker', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(inc(1000));
  buf.push(inc(2000));
  assert.deepEqual(buf.freeze(1500).map((e) => e.timestamp), [0, 0, 1000]);
});

test('a move batch straddling the marker is trimmed and re-stamped', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(move(1100, [-300, -200, -50])); // positions at 800, 900, 1050
  const last = buf.freeze(1000).at(-1);
  assert.equal(last.timestamp, 1000);
  assert.deepEqual(last.data.positions.map((p) => p.timeOffset), [-200, -100]);
  assert.deepEqual(last.data.positions.map((p) => p.x), [0, 1]);
});

test('a move batch wholly after the marker is dropped', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(move(1500, [-100, -50]));
  assert.equal(buf.freeze(1000).length, 2);
});

test('a segment that started after the marker is ignored', () => {
  const buf = create();
  checkout(buf, 0);
  buf.push(inc(900));
  checkout(buf, 1200);
  assert.deepEqual(buf.freeze(1000).map((e) => e.timestamp), [0, 0, 900]);
});

test('freeze does not mutate; second freeze uses the later marker', () => {
  const buf = create();
  checkout(buf, 0);
  const original = move(1100, [-300, -50]);
  buf.push(original);
  buf.freeze(1000);
  assert.equal(original.timestamp, 1100);
  assert.equal(original.data.positions.length, 2);
  buf.push(inc(5000));
  assert.deepEqual(buf.freeze(6000).map((e) => e.timestamp), [0, 0, 1100, 5000]);
});

const { describeKey } = globalThis.ReportBuffer;
const k = (key, mods = {}) => ({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false, typing: false, ...mods });

test('describeKey: navigation and control keys are named', () => {
  assert.equal(describeKey(k('Tab')), 'Tab');
  assert.equal(describeKey(k('Enter')), 'Enter');
  assert.equal(describeKey(k('Escape')), 'Escape');
  assert.equal(describeKey(k(' ')), 'Space');
  assert.equal(describeKey(k('ArrowDown')), 'ArrowDown');
  assert.equal(describeKey(k('PageUp')), 'PageUp');
  assert.equal(describeKey(k('F5')), 'F5');
  assert.equal(describeKey(k('F12')), 'F12');
  assert.equal(describeKey(k('Tab', { shiftKey: true })), 'Shift+Tab');
  assert.equal(describeKey(k('ArrowLeft', { altKey: true })), 'Alt+ArrowLeft');
});

test('describeKey: Ctrl and Cmd shortcuts are recorded as combinations', () => {
  assert.equal(describeKey(k('r', { ctrlKey: true })), 'Ctrl+R');
  assert.equal(describeKey(k('F', { ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+F');
  assert.equal(describeKey(k('c', { metaKey: true })), 'Meta+C');
  assert.equal(describeKey(k('+', { ctrlKey: true })), 'Ctrl++');
});

test('describeKey: typed characters are never recorded', () => {
  for (const key of ['a', 'Z', '7', '.', 'õ', '[']) assert.equal(describeKey(k(key)), null, key);
  assert.equal(describeKey(k('A', { shiftKey: true })), null);
  // AltGr (Ctrl+Alt) and Option (Alt) produce typed symbols on many layouts
  assert.equal(describeKey(k('[', { ctrlKey: true, altKey: true })), null);
  assert.equal(describeKey(k('å', { altKey: true })), null);
});

test('describeKey: nothing is recorded while typing in a field, on repeat, or for bare modifiers', () => {
  assert.equal(describeKey(k('Enter', { typing: true })), null);
  assert.equal(describeKey(k('a', { ctrlKey: true, typing: true })), null);
  assert.equal(describeKey(k('ArrowDown', { repeat: true })), null);
  for (const key of ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified']) {
    assert.equal(describeKey(k(key, { ctrlKey: key === 'Control' })), null, key);
  }
  assert.equal(describeKey(k(undefined)), null);
});
