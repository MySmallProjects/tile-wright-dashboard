# Tilewright Architecture

Tilewright is a self-hosted, tile-based dashboard framework designed for wall-mounted touch tablets and desktop browsers on a home network.

---

## 1. Terminology

Use these terms consistently across code, UI, and documentation:

- **Addon:** An installable package (built-in under `src/addons/` or uploaded as a `.zip`) managed by an administrator. Addons are never split into separate "frontend" and "backend" packages.
- **Contribution:** A capability declared in an addon's `addon.json` manifest: tile types, a server component, themes, and/or icon packs.
- **Tile type:** A kind of tile provided by an addon (e.g. `clock:clock`, `homeassistant:sensor`).
- **Tile:** A placed instance of a tile type on a dashboard.
- **Dashboard:** A named, ordered page of tiles owned by a user. Each user has a list of dashboards (which can be enabled or disabled individually).
- **Layout vs Tile data:** **Layout** is tile position, size, and pin state (`layout.json`). **Tile data** is content owned by a tile instance (e.g. note text in `data/<tileId>.json`), stored independently so cancelling Edit Mode never discards tile data.

---

## 2. Components

- **`Tilewright.Server`** (`src/Tilewright.Server/`): ASP.NET Core (.NET 10 LTS) host running on Kestrel. Serves Minimal APIs, the SignalR hub (`/hubs/dashboard`), addon assets, and the static Svelte frontend from `wwwroot/`.
- **`Tilewright.AddonContracts`** (`src/Tilewright.AddonContracts/`): Shared interfaces (`IAddonModule`, `IDataProvider`, `IActionHandler`, `IDynamicOptionsProvider`, `IAddonHostContext`) referenced by both the host and server-side addons.
- **`Tilewright.Addons.BuiltIn`** (`src/Tilewright.Addons.BuiltIn/`): Server-side implementations for the built-in addons (`Image`, `ApiValue`, `HomeAssistant`, `OpenMeteo`, `HttpGet`).
- **Frontend Host (`src/web/`):** Svelte 5 + TypeScript + Vite + Gridstack.js v14 (Variation C: Free-Placement Canvas). Compiles to static assets in `wwwroot/` — **no Node.js is required at runtime**.
- **Built-in Addons (`src/addons/`):** `themes-default`, `icons-mdi`, `icons-cmas`, `theme-cyberpunk`, `clock`, `notes`, `countdown`, `links`, `image`, `api-value`, `homeassistant`, `openmeteo`, `http-get`.

---

## 3. Data Flow (Server-Centric)

The browser **never** communicates directly with third-party APIs or Home Assistant:

1. **Secrets stay on the server:** API keys, auth headers, and Home Assistant long-lived tokens are stored write-only under `data/secrets/<addonId>.json` (`0600` on Linux) and never sent back to the browser.
2. **CORS-free:** Server-side `HttpClient` and `ClientWebSocket` handle external requests and Home Assistant connections.
3. **Live push:** Server-side `IDataProvider`s (such as Home Assistant's WebSocket listener) push updates to subscribed clients over SignalR (`/hubs/dashboard`).
4. **Actions:** User taps (e.g. HA toggle, HTTP GET trigger) go back through `/api/addons/{id}/actions/{action}` or SignalR `InvokeAction`.

---

## 4. Trust Model: In-Process Addons

Server-side addon code is **loaded in-process as .NET assemblies** (`Assembly.LoadFrom`) and runs with the **full OS permissions of the Tilewright server process**.

This is a deliberate design choice for a trusted home-network deployment where the administrator is the addon author and simplicity outweighs sandboxing complexity.

**Consequences:**
- Installing an addon means executing its code. Zip validation catches structural mistakes (`addon.json` schema, missing files, zip-slip traversal), **not** malicious code.
- Only **administrators** can upload, enable, disable, or remove addons.
- Installs, upgrades, removals, and enable/disable changes are staged and **applied at server startup**, ensuring nothing is ever half-loaded.
- Browser-side addon JavaScript runs in the user's browser session and can call APIs as that user.
- **Resilience:** Exceptions during addon discovery or startup are caught per-addon; a failing addon is marked `failed` with its error message in the Admin UI and skipped without crashing the server.

---

## 5. Frontend Tile Contract (Web Components)

Tiles are standard Custom Elements (Shadow DOM) loaded lazily per tile type in use:

- **Inputs from host:** `settings`, `data`, and `context` (`{ mode, theme, width, height, addonId, tileId, resolveIcon, resolveIconPath }`).
- **Theming:** Tiles use `--tw-*` CSS custom properties so Light, Dark, and addon-contributed themes pass straight into Shadow DOM.
- **Edit mode safety:** Host enforces `pointer-events: none` on `.tile-body` in Edit Mode.
- **Events to host:** `settings-changed`, `tile-data-changed`, `request-action`, `subscribe-source`, `unsubscribe-source`.

---

## 6. Storage Layout

No database is used. All state is stored as JSON files under `Tilewright:DataRoot` (`/var/lib/tilewright` in production, `src/Tilewright.Server/data` in development), hidden behind interfaces (`ISiteStore`, `IUserStore`, `ISessionStore`, `IDashboardStore`, `ISecretStore`) so SQLite could replace them later.

```text
<DataRoot>/
  site.json
  users.json
  sessions.json
  addons-state.json
  disabled-addons.txt          (optional UI-less recovery override)
  secrets/<addonId>.json       (write-only secrets, 0600 on Linux)
  site-backgrounds/<id>.webp
  users/<userId>/
    settings.json
    backgrounds/<id>.webp
    dashboards/
      index.json
      <dashboardId>/
        layout.json
        tiles/<tileId>.json
        data/<tileId>.json
  addons/<addonId>/            (per-addon runtime data)
  addons-installed/<addonId>/  (uploaded addon packages)
  addons-pending/              (staged installs/removals applied at startup)
```

Writes are atomic (`temp` → `Flush(flushToDisk: true)` → `File.Move(..., overwrite: true)`) with per-file `SemaphoreSlim` locking, an in-memory cache, and `.corrupt.<timestamp>.bak` recovery if a JSON file is damaged.

---

## 7. HTTP vs HTTPS Detection & Sessions

- ASP.NET `ForwardedHeadersMiddleware` trusts **only localhost/loopback** (`127.0.0.1`, `::1`), preventing LAN clients from spoofing `X-Forwarded-Proto: https`.
- Session tokens are 32-byte random opaque values stored in a cookie; only their SHA-256 hash is persisted in `sessions.json` (1-year lifetime, survives server restarts).
- On **HTTP**: cookie is `tw_session` (`HttpOnly`, `SameSite=Lax`, no `Secure` flag), no HSTS.
- On **HTTPS** (direct or behind localhost nginx): cookie is `__Host-tw_session` (`Secure` set), plus `Strict-Transport-Security`.

---

## 8. Git-Independent Versioning

- `src/version.props` holds `Major`, `Minor`, and `Patch` (set by hand).
- `src/build-number.txt` increments on each server build (`DesignTimeBuild != true`).
- Build date/time, configuration, and machine name are stamped into assembly metadata; optional git commit/dirty metadata is added only if `git` and `.git` are present.
- `GET /api/version` exposes the server version; Vite stamps the exact same version into the frontend bundle so mismatches trigger a reload banner.
