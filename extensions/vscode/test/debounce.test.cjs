const test = require('node:test');
const assert = require('node:assert/strict');
const { debounce, latestGuard, mapLimit } = require('../out-test/debounce.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('debounce runs once with the last args', async () => {
  const calls = [];
  const d = debounce((q) => calls.push(q), 20);
  d('t'); d('te'); d('tel');
  await sleep(40);
  assert.deepEqual(calls, ['tel']);
});

test('debounce cancel and flush', async () => {
  const calls = [];
  const d = debounce((q) => calls.push(q), 20);
  d('a'); d.cancel();
  await sleep(40);
  assert.deepEqual(calls, []);
  d('b'); d.flush();
  assert.deepEqual(calls, ['b']);
});

test('latestGuard', () => {
  const g = latestGuard();
  const a = g.next();
  const b = g.next();
  assert.equal(g.isLatest(a), false);
  assert.equal(g.isLatest(b), true);
});

test('mapLimit keeps order and limits concurrency', async () => {
  let inFlight = 0, max = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (x) => {
    inFlight++; max = Math.max(max, inFlight);
    await sleep(5);
    inFlight--;
    return x * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50, 60]);
  assert.equal(max, 2);
});
