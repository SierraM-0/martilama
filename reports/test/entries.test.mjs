import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/entries.js';

const { build } = globalThis.ReportEntries;
const T0 = 1000;
const base = [{ type: 4, timestamp: T0, data: {} }, { type: 2, timestamp: T0, data: {} }];
const consoleEv = (t, level, args) => ({
  type: 6, timestamp: t, data: { plugin: 'rrweb/console@1', payload: { level, trace: [], payload: args.map((a) => JSON.stringify(a)) } },
});
const customEv = (t, tag, payload = {}) => ({ type: 5, timestamp: t, data: { tag, payload } });

test('console events become entries with level and joined text', () => {
  const out = build([...base, consoleEv(T0 + 500, 'error', ['boom', { a: 1 }])]);
  assert.deepEqual(out, [{ offset: 500, kind: 'console', level: 'error', text: 'boom {"a":1}' }]);
});

test('navigation, tab and report markers become entries', () => {
  const out = build([
    ...base,
    customEv(T0 + 100, 'navigate', { path: '/blog' }),
    customEv(T0 + 200, 'tab-hidden'),
    customEv(T0 + 300, 'tab-visible'),
    customEv(T0 + 400, 'report-click'),
  ]);
  assert.deepEqual(out.map((e) => [e.offset, e.kind, e.text]), [
    [100, 'nav', 'Navigated to /blog'],
    [200, 'tab', 'Tab hidden'],
    [300, 'tab', 'Tab visible again'],
    [400, 'report', 'Clicked "report a problem"'],
  ]);
});

test('early console uses its own recorded time and is sorted in', () => {
  const out = build([
    ...base,
    consoleEv(T0 + 50, 'log', ['later']),
    customEv(T0 + 60, 'early-console', { level: 'warn', time: T0 + 10, args: ['first'] }),
  ]);
  assert.deepEqual(out.map((e) => [e.offset, e.level, e.text]), [[10, 'warn', 'first'], [50, 'log', 'later']]);
});

test('early console from before the first event is clamped to 0', () => {
  const out = build([...base, customEv(T0 + 60, 'early-console', { level: 'log', time: T0 - 40, args: ['x'] })]);
  assert.equal(out[0].offset, 0);
});

test('unknown events, other plugins and malformed payloads are ignored', () => {
  const out = build([
    ...base,
    { type: 3, timestamp: T0 + 1, data: { source: 2 } },
    { type: 6, timestamp: T0 + 2, data: { plugin: 'other@1', payload: {} } },
    { type: 6, timestamp: T0 + 3, data: { plugin: 'rrweb/console@1', payload: null } },
    customEv(T0 + 4, 'something-else'),
    { type: 5, timestamp: T0 + 5, data: null },
  ]);
  assert.deepEqual(out, []);
  assert.deepEqual(build([]), []);
});

test('a console argument that is not valid JSON is shown as is', () => {
  const ev = consoleEv(T0 + 1, 'log', []);
  ev.data.payload.payload = ['[object Object]', '"quoted"'];
  assert.equal(build([...base, ev])[0].text, '[object Object] quoted');
});

const { group, counts } = globalThis.ReportEntries;

test('group sorts every entry into one of the four console filters', () => {
  const out = build([
    ...base,
    consoleEv(T0 + 1, 'error', ['a']),
    consoleEv(T0 + 2, 'warn', ['b']),
    consoleEv(T0 + 3, 'log', ['c']),
    consoleEv(T0 + 4, 'info', ['d']),
    consoleEv(T0 + 5, 'debug', ['e']),
    customEv(T0 + 6, 'navigate', { path: '/x' }),
    customEv(T0 + 7, 'tab-hidden'),
    customEv(T0 + 8, 'report-click'),
    customEv(T0 + 9, 'early-console', { level: 'error', time: T0 + 9, args: ['f'] }),
  ]);
  assert.deepEqual(out.map(group), ['error', 'warning', 'log', 'log', 'log', 'nav', 'nav', 'nav', 'error']);
});

test('counts totals the entries per filter, including empty filters', () => {
  const out = build([...base, consoleEv(T0 + 1, 'error', ['a']), consoleEv(T0 + 2, 'error', ['b']), customEv(T0 + 3, 'navigate', { path: '/x' })]);
  assert.deepEqual(counts(out), { error: 2, warning: 0, log: 0, nav: 1 });
  assert.deepEqual(counts([]), { error: 0, warning: 0, log: 0, nav: 0 });
});

const { shortcut, stepIndex } = globalThis.ReportEntries;
const press = (key, mods = {}) => ({ key, ctrlKey: false, altKey: false, metaKey: false, onControl: false, typing: false, ...mods });

test('shortcut: plain keys map to their actions', () => {
  assert.equal(shortcut(press('[')), 'newer');
  assert.equal(shortcut(press(']')), 'older');
  assert.equal(shortcut(press('j')), 'next');
  assert.equal(shortcut(press('K')), 'previous');
  assert.equal(shortcut(press(' ')), 'toggle');
  assert.equal(shortcut(press('x')), null);
});

test('shortcut: brackets typed with AltGr or Option still work', () => {
  // Windows reports AltGr as Ctrl+Alt; macOS Option is Alt alone.
  assert.equal(shortcut(press('[', { ctrlKey: true, altKey: true })), 'newer');
  assert.equal(shortcut(press(']', { ctrlKey: true, altKey: true })), 'older');
  assert.equal(shortcut(press('[', { altKey: true })), 'newer');
});

test('shortcut: browser and system combinations are left alone', () => {
  assert.equal(shortcut(press('[', { ctrlKey: true })), null);
  assert.equal(shortcut(press(']', { metaKey: true })), null);
  assert.equal(shortcut(press('j', { ctrlKey: true })), null);
  assert.equal(shortcut(press('k', { altKey: true })), null);
  assert.equal(shortcut(press(' ', { metaKey: true })), null);
});

test('shortcut: Space is left to a focused control, and nothing fires while typing', () => {
  assert.equal(shortcut(press(' ', { onControl: true })), null);
  assert.equal(shortcut(press('j', { onControl: true })), 'next');
  assert.equal(shortcut(press('[', { onControl: true })), 'newer');
  for (const key of [' ', 'j', 'k', '[', ']']) assert.equal(shortcut(press(key, { typing: true })), null, key);
});

test('stepIndex: next goes to the following visible entry, however close in time', () => {
  // visible entry indices; entries 2 and 3 are 5 ms apart in the recording
  const visible = [0, 2, 3, 6];
  assert.equal(stepIndex(visible, -1, 1, 0), 0);
  assert.equal(stepIndex(visible, 2, 1, 0), 3);
  assert.equal(stepIndex(visible, 3, 1, 0), 6);
  assert.equal(stepIndex(visible, 6, 1, 0), -1);
});

test('stepIndex: previous restarts the current entry when well past it, else steps back', () => {
  const visible = [0, 2, 3, 6];
  assert.equal(stepIndex(visible, 3, -1, 200), 2);
  assert.equal(stepIndex(visible, 3, -1, 4000), 3);
  assert.equal(stepIndex(visible, 0, -1, 200), -1);
  assert.equal(stepIndex(visible, 0, -1, 4000), 0);
  assert.equal(stepIndex(visible, -1, -1, 0), -1);
});

test('stepIndex: works when the current entry is hidden by a filter', () => {
  // current is index 4, which is filtered out
  assert.equal(stepIndex([0, 2, 6], 4, 1, 0), 6);
  assert.equal(stepIndex([0, 2, 6], 4, -1, 0), 2);
  assert.equal(stepIndex([], 4, 1, 0), -1);
});

const { currentIndex } = globalThis.ReportEntries;

test('currentIndex: the latest visible entry at or before the playback time', () => {
  const offsets = [0, 1000, 5000, 5004, 9000];
  const all = [true, true, true, true, true];
  assert.equal(currentIndex(offsets, all, -1, -1), -1);
  assert.equal(currentIndex(offsets, all, 1200, -1), 1);
  assert.equal(currentIndex(offsets, all, 5010, -1), 3);
  assert.equal(currentIndex(offsets, [true, false, true, true, true], 1200, -1), 0);
});

test('currentIndex: an entry just jumped to stays current over ones logged at the same moment', () => {
  const offsets = [0, 5000, 5000, 5004, 9000];
  const all = [true, true, true, true, true];
  // jumped to entry 1; entries 2 and 3 share (nearly) its time
  assert.equal(currentIndex(offsets, all, 5000, 1), 1);
  assert.equal(currentIndex(offsets, all, 5004, 1), 1);
  assert.equal(currentIndex(offsets, all, 5000, 2), 2);
  // once playback moves on, the pin no longer applies
  assert.equal(currentIndex(offsets, all, 5400, 1), 3);
  assert.equal(currentIndex(offsets, all, 9000, 1), 4);
  // seeking back before the pinned entry drops it too
  assert.equal(currentIndex(offsets, all, 900, 1), 0);
});

test('currentIndex: a pinned entry hidden by a filter is ignored', () => {
  const offsets = [0, 5000, 5000];
  assert.equal(currentIndex(offsets, [true, false, true], 5000, 1), 2);
});
