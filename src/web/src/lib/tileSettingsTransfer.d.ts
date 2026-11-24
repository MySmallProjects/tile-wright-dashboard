import type { AddonTile } from '../types';

export const TILE_SETTINGS_EXPORT_KIND: 'tilewright-tile-settings';
export const TILE_SETTINGS_EXPORT_VERSION: 1;

export interface TileSettingsExportFile {
  kind: 'tilewright-tile-settings';
  version: number;
  tileTypeId: string;
  tileName: string;
  addonId: string;
  addonVersion: string;
  exportedAt: string;
  settings: Record<string, unknown>;
}

export type TileSettingsImportResult =
  | { ok: true; settings: Record<string, unknown> }
  | { ok: false; error: string };

export function buildTileSettingsFilename(tileDef: AddonTile, now?: Date): string;

export function buildTileSettingsExport(
  tileDef: AddonTile,
  settings: Record<string, unknown>,
  now?: Date
): TileSettingsExportFile;

export function parseTileSettingsImport(
  jsonText: string,
  targetTileDef: AddonTile
): TileSettingsImportResult;
