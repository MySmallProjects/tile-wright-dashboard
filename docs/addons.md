# Tilewright Addons Guide

Almost every feature in Tilewright is delivered as an **addon**. An addon is a single package with an `addon.json` manifest at its root that declares any combination of **contributions**: tile types, a server component (.NET assembly), themes, and icon packs.

> **Trust Model:** Server-side addon assemblies are loaded **in-process** with the server's permissions. Only administrators may install, enable, disable, or remove addons. All install, removal, and enable/disable changes take effect on the **next server restart**.

---

## 1. Manifest Reference (`addon.json`)

Every addon must have `addon.json` at its root:

| Field | Required | Notes |
| --- | --- | --- |
| `id` | Yes | Unique lowercase identifier matching `^[a-z0-9][a-z0-9-]{1,48}$` |
| `name` | Yes | Display name shown in Admin Addon Manager and Tile Picker |
| `version` | Yes | SemVer (`Major.Minor.Patch`), used for upgrade checks |
| `description` | Yes | Short description |
| `author` | Yes | Author name |
| `minHostVersion` | Yes | Minimum compatible Tilewright server version |
| `contributes` | Yes | Object containing `tiles[]`, `server`, `themes[]`, `iconPacks[]`, `addonSettingsSchema[]` |

### Tile Contribution (`contributes.tiles[]`)
- `id`: Tile type ID (unique within the addon; full type ID is `<addonId>:<tileId>`).
- `name`, `description`, `icon`: Display metadata (MDI icon name).
- `element`: `{ "tagName": "tw-my-tile", "script": "my-tile.js" }` — ES module registering a Custom Element.
- `settingsElement` *(optional)*: `{ "tagName": "tw-my-tile-settings", "script": "my-settings.js" }` — replaces the schema-generated settings form.
- `defaultSize`, `minSize`, `maxSize`: `{ "w": 4, "h": 2 }` in base grid units.
- `settingsSchema`: Array of `SettingsFieldSchema` objects.

### Server Contribution (`contributes.server`)
- `assembly`: Relative path to the `.dll` inside the addon package.
- `entryType`: Full type name implementing `Tilewright.AddonContracts.IAddonModule`.

---

## 2. Settings Schema Field Types

Used for both `contributes.addonSettingsSchema` (global, admin-only) and per-tile `settingsSchema`:

| Type | Description |
| --- | --- |
| `text` | Single-line text input |
| `multiline` | Multi-line textarea |
| `number` | Numeric input (`min`, `max`) |
| `toggle` | Boolean checkbox |
| `select` | Dropdown using static `options[]` OR `dynamicOptionsEndpoint` (fetched from server addon) |
| `colour` | Colour picker |
| `icon` | Searchable local MDI icon picker |
| `url` | URL input |
| `duration` | Duration string (e.g. `5s`, `15m`, `2h`) |
| `secret` | **Write-only** secret stored in `data/secrets/<addonId>.json` (never sent back to browser) |
| `group` | **Repeating group** of objects defined by nested `fields[]` |

All fields support `key`, `label`, `helpText`, `defaultValue`, `required`, `min`, `max`, and `pattern`.

---

## 3. Frontend Tile Contract (Web Components)

Tiles are standard Custom Elements (Shadow DOM recommended):
- Host sets JS properties: `element.settings`, `element.data`, and `element.context` (`{ mode: 'view' | 'edit', theme, width, height, addonId, tileId }`).
- **Never hardcode colours or fonts** — use `--tw-*` CSS custom properties (`--tw-text`, `--tw-text-muted`, `--tw-accent`, `--tw-surface`, `--tw-border`, `--tw-state-normal`, `--tw-state-warning`, `--tw-state-critical`, `--tw-font-family`, `--tw-tile-padding`).
- Host enforces `pointer-events: none` over tile content in edit mode.
- Tiles emit bubbling, composed `CustomEvent`s:
  - `settings-changed`: `{ detail: { ...updatedSettings } }`
  - `tile-data-changed`: `{ detail: { ...tileData } }` (stored separately from layout)
  - `request-action`: `{ detail: { action: 'toggle', payload: { ... } } }`
- Handle missing required settings gracefully with a **"Needs setup"** placeholder.
- Missing, disabled, or failed addons are handled automatically by host placeholders (tile settings and data are preserved).

---

## 4. Install, Upgrade, Disable & Recovery Flow

1. **Upload `.zip`** in **Settings → Addons** (admin only). Server enforces max upload (25 MB) & extracted size (50 MB), blocks zip-slip (`../` and absolute paths), validates `addon.json` and all referenced files, and only allows overwriting an installed addon if the new version is higher.
2. Valid packages are staged in `data/addons-pending/install/` and applied cleanly at the **next startup**.
3. **Disable / Enable** persists to `data/addons-state.json` and takes effect on next startup. Disabled addons are never loaded and their tiles show an **"Addon disabled"** placeholder.
4. **Recovery without UI:** Set environment variable `Tilewright__DisabledAddons=id1,id2` or list addon IDs (one per line) in `data/disabled-addons.txt` and restart.
5. **Resilience:** Any addon that throws during load/initialization is marked `failed` with the error message and skipped without stopping Tilewright.

---

## 5. Worked Example Addon

```
hello-addon/
├── addon.json
└── hello-tile.js
```

**`addon.json`:**
```json
{
  "id": "hello-addon",
  "name": "Hello Addon",
  "version": "1.0.0",
  "description": "Minimal example tile addon.",
  "author": "You",
  "minHostVersion": "0.1.0",
  "contributes": {
    "tiles": [
      {
        "id": "greeting",
        "name": "Greeting",
        "description": "Displays a custom greeting message.",
        "icon": "home",
        "element": { "tagName": "tw-hello-greeting", "script": "hello-tile.js" },
        "defaultSize": { "w": 4, "h": 2 },
        "settingsSchema": [
          { "key": "message", "label": "Message", "type": "text", "required": true, "defaultValue": "Hello, Home!" }
        ]
      }
    ]
  }
}
```

**`hello-tile.js`:**
```js
class TwHelloGreeting extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._settings = {};
  }
  set settings(val) {
    this._settings = val || {};
    this.render();
  }
  connectedCallback() { this.render(); }
  render() {
    const msg = this._settings.message;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center;
                padding: var(--tw-tile-padding); color: var(--tw-text); font-family: var(--tw-font-family); }
      </style>
      <div>${msg ? msg : 'Needs setup'}</div>
    `;
  }
}
if (!customElements.get('tw-hello-greeting')) {
  customElements.define('tw-hello-greeting', TwHelloGreeting);
}
```
