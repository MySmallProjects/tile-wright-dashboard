export const TILE_SETTINGS_EXPORT_KIND = 'tilewright-tile-settings';
export const TILE_SETTINGS_EXPORT_VERSION = 1;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSecretKeys(schema) {
  const keys = new Set();
  if (!Array.isArray(schema)) return keys;
  for (const field of schema) {
    if (field && field.type === 'secret' && typeof field.key === 'string') {
      keys.add(field.key);
    }
  }
  return keys;
}

function stripSecrets(settings, schema) {
  const secretKeys = getSecretKeys(schema);
  const out = {};
  if (!isPlainObject(settings)) return out;
  for (const [key, val] of Object.entries(settings)) {
    if (secretKeys.has(key)) continue;
    out[key] = structuredClone(val);
  }
  return out;
}

function formatUtcDate(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function buildTileSettingsFilename(tileDef, now = new Date()) {
  const rawName = (tileDef?.spec?.name || tileDef?.tileTypeId || 'tile').toLowerCase();
  const slug = rawName.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tile';
  return `tilewright-tile-${slug}-${formatUtcDate(now)}.json`;
}

export function buildTileSettingsExport(tileDef, settings, now = new Date()) {
  return {
    kind: TILE_SETTINGS_EXPORT_KIND,
    version: TILE_SETTINGS_EXPORT_VERSION,
    tileTypeId: tileDef.tileTypeId,
    tileName: tileDef.spec?.name || tileDef.tileTypeId,
    addonId: tileDef.addonId,
    addonVersion: tileDef.addonVersion,
    exportedAt: now.toISOString(),
    settings: stripSecrets(settings, tileDef.spec?.settingsSchema)
  };
}

export function parseTileSettingsImport(jsonText, targetTileDef) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      error: 'The selected file is not valid JSON.'
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      error: 'This file is not a valid Tilewright tile settings export.'
    };
  }

  if (parsed.kind !== TILE_SETTINGS_EXPORT_KIND) {
    if (Array.isArray(parsed.tiles) && isPlainObject(parsed.tileSettings)) {
      return {
        ok: false,
        error: 'This looks like a dashboard export file, not a tile settings file.'
      };
    }
    return {
      ok: false,
      error: 'This file is not a valid Tilewright tile settings export.'
    };
  }

  if (typeof parsed.version !== 'number' || parsed.version < 1 || parsed.version > TILE_SETTINGS_EXPORT_VERSION) {
    return {
      ok: false,
      error: `Unsupported tile settings file version (${String(parsed.version)}).`
    };
  }

  if (typeof parsed.tileTypeId !== 'string' || !parsed.tileTypeId.trim()) {
    return {
      ok: false,
      error: 'This tile settings file is missing its tile type identifier.'
    };
  }

  if (parsed.tileTypeId !== targetTileDef.tileTypeId) {
    const sourceLabel =
      typeof parsed.tileName === 'string' && parsed.tileName.trim()
        ? `"${parsed.tileName.trim()}" (${parsed.tileTypeId})`
        : `"${parsed.tileTypeId}"`;
    const targetLabel = `"${targetTileDef.spec?.name || targetTileDef.tileTypeId}"`;
    return {
      ok: false,
      error: `These settings are for ${sourceLabel} and cannot be imported into ${targetLabel}.`
    };
  }

  if (!isPlainObject(parsed.settings)) {
    return {
      ok: false,
      error: 'This tile settings file does not contain a valid settings object.'
    };
  }

  return {
    ok: true,
    settings: stripSecrets(parsed.settings, targetTileDef.spec?.settingsSchema)
  };
}
