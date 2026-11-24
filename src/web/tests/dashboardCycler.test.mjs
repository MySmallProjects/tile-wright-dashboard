import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load addon ES module cleanly in Node even though src/addons has no package.json ("type": "module").
const configPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../addons/dashboard-cycler/cycler-config.js');
const configModuleUrl = `data:text/javascript;base64,${Buffer.from(readFileSync(configPath, 'utf8')).toString('base64')}`;
const {
  DEFAULT_CONFIG,
  formatDurationCompact,
  getNextDashboardId,
  getRotationDashboards,
  loadCyclerConfig,
  normalizeConfig,
  saveCyclerConfig,
  storageKeyForUser
} = await import(configModuleUrl);

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v))
  };
}

test('normalizeConfig clamps bounds and deduplicates includedDashboardIds', () => {
  const cfg = normalizeConfig({
    enabled: true,
    intervalSeconds: 1,
    pauseOnInteraction: false,
    idleResumeSeconds: 99999,
    showPagerButton: false,
    includedDashboardIds: ['d1', 'd2', 'd1', '', 123]
  });

  assert.equal(cfg.enabled, true);
  assert.equal(cfg.intervalSeconds, 5);
  assert.equal(cfg.pauseOnInteraction, false);
  assert.equal(cfg.idleResumeSeconds, 3600);
  assert.equal(cfg.showPagerButton, false);
  assert.deepEqual(cfg.includedDashboardIds, ['d1', 'd2']);
});

test('loadCyclerConfig and saveCyclerConfig round-trip per user', () => {
  const storage = createMemoryStorage();
  assert.deepEqual(loadCyclerConfig('u1', storage), DEFAULT_CONFIG);

  saveCyclerConfig('u1', { enabled: true, intervalSeconds: 90 }, storage);
  const loadedU1 = loadCyclerConfig('u1', storage);
  const loadedU2 = loadCyclerConfig('u2', storage);

  assert.equal(loadedU1.enabled, true);
  assert.equal(loadedU1.intervalSeconds, 90);
  assert.equal(loadedU2.enabled, false);
  assert.ok(storage.getItem(storageKeyForUser('u1')));
});

test('getRotationDashboards filters disabled and respects subset while preserving order', () => {
  const dashboards = [
    { id: 'a', name: 'A', enabled: true },
    { id: 'b', name: 'B', enabled: false },
    { id: 'c', name: 'C', enabled: true },
    { id: 'd', name: 'D', enabled: true }
  ];

  assert.deepEqual(
    getRotationDashboards(dashboards, null).map((d) => d.id),
    ['a', 'c', 'd']
  );

  assert.deepEqual(
    getRotationDashboards(dashboards, ['d', 'a', 'b']).map((d) => d.id),
    ['a', 'd']
  );
});

test('getNextDashboardId wraps around and handles missing active id', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(getNextDashboardId(list, 'a'), 'b');
  assert.equal(getNextDashboardId(list, 'c'), 'a');
  assert.equal(getNextDashboardId(list, 'other'), 'a');
  assert.equal(getNextDashboardId([{ id: 'only' }], 'only'), null);
});

test('formatDurationCompact formats seconds and minutes cleanly', () => {
  assert.equal(formatDurationCompact(45), '45s');
  assert.equal(formatDurationCompact(60), '1m');
  assert.equal(formatDurationCompact(90), '1m 30s');
});
