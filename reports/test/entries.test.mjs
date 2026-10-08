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
