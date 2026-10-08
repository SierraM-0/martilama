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
  assert.deepEqual(counts(out), { error: 2, warning: 0, log: 0, nav: 1, click: 0, key: 0 });
  assert.deepEqual(counts([]), { error: 0, warning: 0, log: 0, nav: 0, click: 0, key: 0 });
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

test('shortcut: arrow keys step between entries, as J and K do', () => {
  assert.equal(shortcut(press('ArrowRight')), 'next');
  assert.equal(shortcut(press('ArrowLeft')), 'previous');
  assert.equal(shortcut(press('ArrowRight', { onControl: true })), 'next');
});

test('shortcut: Shift with Left or Right steps between reports, as [ and ] do', () => {
  // Left is Newer and Right is Older, matching the order of the two buttons.
  assert.equal(shortcut(press('ArrowLeft', { shiftKey: true })), 'newer');
  assert.equal(shortcut(press('ArrowRight', { shiftKey: true })), 'older');
  assert.equal(shortcut(press('ArrowLeft', { shiftKey: true, onControl: true })), 'newer');
});

test('shortcut: arrows that already mean something are left alone', () => {
  // Up and Down scroll, with or without Shift; Alt+Left is the browser's Back
  assert.equal(shortcut(press('ArrowUp')), null);
  assert.equal(shortcut(press('ArrowDown')), null);
  assert.equal(shortcut(press('ArrowUp', { shiftKey: true })), null);
  assert.equal(shortcut(press('ArrowDown', { shiftKey: true })), null);
  assert.equal(shortcut(press('ArrowLeft', { altKey: true })), null);
  assert.equal(shortcut(press('ArrowRight', { ctrlKey: true })), null);
  assert.equal(shortcut(press('ArrowLeft', { shiftKey: true, ctrlKey: true })), null);
  assert.equal(shortcut(press('ArrowRight', { shiftKey: true, altKey: true })), null);
  // on the divider, plain Left and Right resize the split
  assert.equal(shortcut(press('ArrowLeft', { onSeparator: true })), null);
  assert.equal(shortcut(press('ArrowRight', { onSeparator: true })), null);
  // and never while typing, where Shift+arrows select text
  assert.equal(shortcut(press('ArrowRight', { typing: true })), null);
  assert.equal(shortcut(press('ArrowLeft', { shiftKey: true, typing: true })), null);
});

// ---- key presses and clicks ----
const el = (id, tagName, attributes, childNodes = []) => ({ type: 2, id, tagName, attributes, childNodes });
const text = (id, textContent) => ({ type: 3, id, textContent });
// document > html > body > [nav > a"blog", main > (p"Posts about life", button"report a problem", div(empty))]
const page = { type: 0, id: 1, childNodes: [el(2, 'html', {}, [el(3, 'body', {}, [
  el(4, 'nav', {}, [el(5, 'a', { href: '/blog' }, [text(6, 'blog')])]),
  el(7, 'main', {}, [
    el(8, 'p', {}, [text(9, '  Posts about life\n   and my small opinions.  ')]),
    el(10, 'button', { id: 'report-link' }, [text(11, 'report a problem')]),
    el(12, 'div', { class: 'spacer' }),
  ]),
])])] };
const withPage = [{ type: 4, timestamp: T0, data: {} }, { type: 2, timestamp: T0, data: { node: page } }];
const clickEv = (t, id) => ({ type: 3, timestamp: t, data: { source: 2, type: 2, id, x: 10, y: 10 } });

test('key presses become entries', () => {
  const out = build([...base, customEv(T0 + 100, 'key', { combo: 'Tab' }), customEv(T0 + 200, 'key', { combo: 'Ctrl+R' })]);
  assert.deepEqual(out.map((e) => [e.offset, e.kind, e.text]), [[100, 'key', 'Pressed Tab'], [200, 'key', 'Pressed Ctrl+R']]);
  assert.deepEqual(out.map(group), ['key', 'key']);
});

test('clicks say what was clicked: link, button, text, or bare element', () => {
  const out = build([...withPage, clickEv(T0 + 100, 6), clickEv(T0 + 200, 5), clickEv(T0 + 300, 9), clickEv(T0 + 400, 12)]);
  assert.deepEqual(out.map((e) => [e.offset, e.kind, e.text]), [
    [100, 'click', 'Clicked link "blog"'],
    [200, 'click', 'Clicked link "blog"'],
    [300, 'click', 'Clicked "Posts about life and my small opinions."'],
    [400, 'click', 'Clicked <div>'],
  ]);
  assert.deepEqual(out.map(group), ['click', 'click', 'click', 'click']);
});

test('clicks on elements added after the first snapshot are described too', () => {
  const add = { type: 3, timestamp: T0 + 50, data: { source: 0, adds: [
    { parentId: 7, nextId: null, node: el(20, 'a', { href: '/blog/hello' }, []) },
    { parentId: 20, nextId: null, node: text(21, 'Hello, world') },
  ], removes: [], texts: [], attributes: [] } };
  const out = build([...withPage, add, clickEv(T0 + 100, 21)]);
  assert.equal(out[0].text, 'Clicked link "Hello, world"');
});

test('long click text is cut short, and an unknown element still gets an entry', () => {
  const long = { type: 0, id: 1, childNodes: [el(2, 'p', {}, [text(3, 'x'.repeat(200))])] };
  const out = build([{ type: 4, timestamp: T0, data: {} }, { type: 2, timestamp: T0, data: { node: long } }, clickEv(T0 + 1, 3), clickEv(T0 + 2, 999)]);
  assert.equal(out[0].text, `Clicked "${'x'.repeat(60)}…"`);
  assert.equal(out[1].text, 'Clicked');
});

test('other mouse interactions (down, up, focus) are not listed', () => {
  const others = [0, 1, 3, 5, 6].map((type, i) => ({ type: 3, timestamp: T0 + i, data: { source: 2, type, id: 5 } }));
  assert.deepEqual(build([...withPage, ...others]), []);
});

test('the click that opened the report dialog is shown once, as the report entry', () => {
  const out = build([...withPage, clickEv(T0 + 100, 5), clickEv(T0 + 990, 11), customEv(T0 + 1000, 'report-click')]);
  assert.deepEqual(out.map((e) => e.text), ['Clicked link "blog"', 'Clicked "report a problem"']);
  assert.equal(out[1].kind, 'report');
});
