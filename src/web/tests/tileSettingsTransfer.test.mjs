import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_SETTINGS_EXPORT_KIND,
  TILE_SETTINGS_EXPORT_VERSION,
  buildTileSettingsExport,
  buildTileSettingsFilename,
  parseTileSettingsImport
} from '../src/lib/tileSettingsTransfer.js';

const apiTileDef = {
  addonId: 'api-value',
  addonName: 'API Value',
  addonVersion: '1.2.0',
  tileTypeId: 'api-value:api-multi-value',
  spec: {
    id: 'api-multi-value',
    name: 'API Multi-Value',
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'url', label: 'URL', type: 'url' },
      { key: 'items', label: 'Items', type: 'group' },
      { key: 'apiKey', label: 'API Key', type: 'secret' }
    ]
  }
};

const clockTileDef = {
  addonId: 'clock',
  addonName: 'Clock',
  addonVersion: '1.0.0',
  tileTypeId: 'clock:clock',
  spec: {
    id: 'clock',
    name: 'Clock',
    settingsSchema: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'use24Hour', label: '24-Hour', type: 'toggle' }
    ]
  }
};

describe('tileSettingsTransfer — export', () => {
  it('builds a versioned export envelope and strips secret fields', () => {
    const fixedDate = new Date('2026-11-24T01:30:00.000Z');
    const exported = buildTileSettingsExport(
      apiTileDef,
      {
        title: 'Power Usage',
        url: 'https://example.local/api',
        items: [{ label: 'Solar', path: '$.solar' }],
        apiKey: 'super-secret'
      },
      fixedDate
    );

    assert.equal(exported.kind, TILE_SETTINGS_EXPORT_KIND);
    assert.equal(exported.version, TILE_SETTINGS_EXPORT_VERSION);
    assert.equal(exported.tileTypeId, 'api-value:api-multi-value');
    assert.equal(exported.tileName, 'API Multi-Value');
    assert.equal(exported.addonId, 'api-value');
    assert.equal(exported.addonVersion, '1.2.0');
    assert.equal(exported.exportedAt, '2026-11-24T01:30:00.000Z');
    assert.deepEqual(exported.settings, {
      title: 'Power Usage',
      url: 'https://example.local/api',
      items: [{ label: 'Solar', path: '$.solar' }]
    });
    assert.equal('apiKey' in exported.settings, false);
  });

  it('builds a clean slugified filename', () => {
    const fixedDate = new Date('2026-11-24T01:30:00.000Z');
    assert.equal(
      buildTileSettingsFilename(apiTileDef, fixedDate),
      'tilewright-tile-api-multi-value-2026-11-24.json'
    );
  });
});

describe('tileSettingsTransfer — import', () => {
  it('round-trips valid settings for the matching tile type', () => {
    const exported = buildTileSettingsExport(apiTileDef, {
      title: 'Power Usage',
      url: 'https://example.local/api',
      items: [{ label: 'Grid', path: '$.grid' }]
    });

    const result = parseTileSettingsImport(JSON.stringify(exported), apiTileDef);
    assert.equal(result.ok, true);
    assert.deepEqual(result.settings, {
      title: 'Power Usage',
      url: 'https://example.local/api',
      items: [{ label: 'Grid', path: '$.grid' }]
    });
  });

  it('rejects settings exported from a different tile type with a friendly message', () => {
    const exported = buildTileSettingsExport(clockTileDef, { title: 'Living Room', use24Hour: true });
    const result = parseTileSettingsImport(JSON.stringify(exported), apiTileDef);

    assert.equal(result.ok, false);
    assert.match(result.error, /"Clock" \(clock:clock\)/);
    assert.match(result.error, /"API Multi-Value"/);
  });

  it('rejects invalid JSON', () => {
    const result = parseTileSettingsImport('{ not valid json', apiTileDef);
    assert.equal(result.ok, false);
    assert.match(result.error, /not valid JSON/i);
  });

  it('gives a specific message if a dashboard export file is uploaded', () => {
    const dashboardExport = JSON.stringify({
      version: 1,
      name: 'Main',
      tiles: [],
      tileSettings: {}
    });
    const result = parseTileSettingsImport(dashboardExport, apiTileDef);
    assert.equal(result.ok, false);
    assert.match(result.error, /dashboard export/i);
  });

  it('strips secret keys even if manually edited into an imported file', () => {
    const exported = buildTileSettingsExport(apiTileDef, { title: 'Test' });
    exported.settings.apiKey = 'injected-secret';

    const result = parseTileSettingsImport(JSON.stringify(exported), apiTileDef);
    assert.equal(result.ok, true);
    assert.equal('apiKey' in result.settings, false);
    assert.equal(result.settings.title, 'Test');
  });
});
