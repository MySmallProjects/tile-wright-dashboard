# Tilewright Manual Testing Checklists

## Device Test Matrix

Test layout, touch, swipe, and performance checks against these targets:

| Device Class | Priority | Typical Viewport | Key Checks |
| --- | --- | --- | --- |
| **Tablet (Touch)** | Primary | 768×1024 / 1024×768 / 1280×800 | Touch drag/resize, accidental tap safety, horizontal swipe vs scroll, backdrop blur performance |
| **Desktop** | Secondary | 1280×800 – 2560×1440 | Mouse drag/resize, keyboard navigation, centred grid margins, modal pickers |
| **Phone** | Extra | 375×667 – 430×932 | Narrow column fallback for pinned tiles, touch target size, swipe gestures |

---

## Phase 1: Prototype

Start the prototype server:
```bash
cd src/prototype
python3 -m http.server 8080
```
Open `http://localhost:8080/` (Layout Lab) and `http://localhost:8080/harness.html` (API/Tile Harness).

### 1.1 Offline & Loading
- [ ] **No external requests:** Open browser DevTools → Network tab and reload both `index.html` and `harness.html`.
  - *Expected:* Every request is served from `localhost` (zero CDN or external domain requests).
- [ ] **Disposable banner:** Both pages clearly indicate they are the Phase 1 prototype.
  - *Expected:* Prototype banner is visible on `index.html`; `harness.html` is labelled as the Dev Tools API/Tile Harness.

### 1.2 Layout Lab — Variations & Grid Controls
- [ ] **Switch all 4 variations (A, B, C, D):** Use the variation selector in the control panel.
  - *Expected:* Grid re-lays out cleanly for each variation without overlapping or broken tiles.
  - Variation A centres fixed-width columns in leftover space; Variation B stretches to fill the viewport; Variation C allows free placement (`float: true`); Variation D keeps flowing tiles in strict list order while pinned tiles hold `(x, y)` slots.
- [ ] **Cell size, column width, and gap sliders:** Adjust each slider.
  - *Expected:* Grid dimensions and tile spacing update live and remain legible.
- [ ] **Add default tile & size presets:** Enter Edit mode and click **+ Add Tile** (and try 0.5×1, 1×1, 2×1, 2×2).
  - *Expected:* New tile appears on the current dashboard with the requested width/height in base-cell units.
- [ ] **Move snapping & resize snapping:** Toggle move snapping and resize snapping independently and drag/resize a tile.
  - *Expected:* Each toggle changes snapping behaviour independently (snapped to base grid vs finer/free feedback) without errors.
- [ ] **Flow vs Pinned:** In Edit mode, toggle the **Pin** button on a tile, move it, and resize the browser window narrower/wider.
  - *Expected:* Pinned tile shows a pinned badge and keeps its `(x, y)` position when it fits the current column count; on a narrower viewport where it doesn't fit, it falls back to normal flow without clipping off-screen.
- [ ] **Auto-arrange toggle:** Toggle Auto-arrange on and off while moving/deleting tiles.
  - *Expected:* When on, tiles compact densely to fill gaps; when off, tiles respect strict order / open slots depending on the active variation.

### 1.3 Layout Lab — Edit Mode, View Mode & Touch Safety
- [ ] **View mode interactivity:** In View mode, click/tap a toggle button or link inside a tile.
  - *Expected:* Tile content responds normally; tiles cannot be dragged or resized; no tile edit toolbars are visible.
- [ ] **Edit mode lockout:** Enter Edit mode via the deliberate **Edit** button, then try tapping a button inside a tile.
  - *Expected:* Tile content ignores clicks/taps (`pointer-events: none`); tile toolbars (name, Pin, Delete) and drag/resize handles are active.
- [ ] **Edit mode Cancel vs Done:** In Edit mode, move a tile, resize another, add a tile, then press **Cancel**. Repeat and press **Done**.
  - *Expected:* **Cancel** restores the exact pre-edit layout; **Done** commits the new layout and exits Edit mode.
- [ ] **Delete confirmation:** In Edit mode, click a tile's delete button.
  - *Expected:* Prompts for confirmation before removing the tile.

### 1.4 Layout Lab — Dashboards & Swipe
- [ ] **Swipe between dashboards (View mode):** On tablet (touch swipe) or desktop (drag or Left/Right arrow keys or page dots), switch between the 3 mock dashboards.
  - *Expected:* Cleanly transitions to the next/previous dashboard; active page dot updates; vertical scrolling does not accidentally trigger a dashboard switch.
- [ ] **Swipe disabled in Edit mode:** Enter Edit mode and swipe horizontally across the grid.
  - *Expected:* Dashboard does **not** switch; dragging moves tiles instead.

### 1.5 Layout Lab — Themes & Background Legibility (Tablet Check)
- [ ] **Light / Dark theme toggle:** Switch between Light and Dark themes.
  - *Expected:* Page background, tile surfaces, text, muted text, borders, and accent colours all update via CSS custom properties, including inside Web Component tiles.
- [ ] **Background image, dim, tile opacity, and backdrop blur:** Select the bundled background image, adjust the dim slider and tile opacity slider, and toggle backdrop blur on/off.
  - *Expected:* Background displays cleanly, dim and tile opacity keep text readable, and toggling backdrop blur visibly switches glass blur on/off (verify frame rate on tablet).

### 1.6 API / Tile Harness (`harness.html`)
- [ ] **Clock Web Component (`<tw-clock-tile>`):** Observe the live clock tile on the harness page.
  - *Expected:* Displays large time with formatted date underneath (default `dddd dd MMM yyyy`, e.g. `Thursday 19 Nov 2026`), updates every second, and follows Light/Dark theme tokens through Shadow DOM.
- [ ] **Tile contract inputs & events:** Toggle **Mode** (`view`/`edit`), **Needs setup**, **12h/24h**, **Show seconds**, and trigger a tile action.
  - *Expected:* "Needs setup" displays a clean placeholder instead of an error; `edit` mode disables inner pointer events; `settings-changed` and `request-action` events appear in the event log.
- [ ] **Mock Login, Cookie & SignalR panels:** Select a no-password user and a password user, reload the page, log out, and send a simulated SignalR push message.
  - *Expected:* Login creates a simulated session cookie that persists across page reload; logout clears it; SignalR push updates the live feed and pushes data into the tile contract inspector.

---

## Phase 2: Backend Skeleton

Run automated tests first:
```bash
dotnet test src/Tilewright.sln
```
Then start the server in Development mode:
```bash
dotnet run --project src/Tilewright.Server
```
Server listens on `http://localhost:5050` with Swagger UI at `http://localhost:5050/swagger`.

### 2.1 Versioning (Git-Independent)
- [ ] **Check `/api/version`:** Open `http://localhost:5050/api/version` (or via Swagger).
  - *Expected:* Returns JSON with `version` (`0.1.0+<build>`), `buildNumber`, `buildDate`, `configuration`, and `machineName` (and `gitCommit`/`gitDirty` only if git is present).
- [ ] **Two consecutive builds:** Run `dotnet build src/Tilewright.Server/Tilewright.Server.csproj` twice and inspect `src/build-number.txt`.
  - *Expected:* The build number increases by 1 on each build.
- [ ] **Build with no `.git` folder:** Copy `src/` to a temporary folder without `.git` and run `dotnet build Tilewright.Server/Tilewright.Server.csproj`.
  - *Expected:* Build succeeds and `/api/version` reports version, build number, and date without error (`gitCommit` and `gitDirty` omitted).

### 2.2 First-Run Setup, Login, Roles & Persistent Sessions
- [ ] **First-run detection:** With an empty `src/Tilewright.Server/data` folder, call `GET /api/auth/status`.
  - *Expected:* Returns `needsSetup: true`, `authenticated: false`.
- [ ] **Create first admin:** Call `POST /api/auth/setup` with a display name and optional password.
  - *Expected:* Returns `201 Created`, sets `tw_session` cookie, and a second call to `POST /api/auth/setup` returns `409 Conflict`.
- [ ] **Restart server — still logged in:** Stop `dotnet run` (`Ctrl+C`), start it again, and call `GET /api/auth/status` with the same browser/cookie.
  - *Expected:* Still `authenticated: true` (sessions reloaded from `data/sessions.json`).
- [ ] **Password & no-password users:** As admin, create a `user` without a password via `POST /api/users`. Log in as that user via `POST /api/auth/login` with no password, then try `GET /api/users`.
  - *Expected:* Login succeeds (`200 OK`); `GET /api/users` returns `403 Forbidden` (admin-only).
- [ ] **Remove user / reset password revokes sessions:** As admin, delete the test user (`DELETE /api/users/{id}`) or reset their password (`PUT /api/users/{id}/password`).
  - *Expected:* Their existing session cookie immediately stops working (`401 Unauthorized`).
- [ ] **Login throttling:** Send 6 failed password login attempts in a row for a password-protected user.
  - *Expected:* 6th attempt returns `429 Too Many Requests` with a `Retry-After` header.

### 2.3 HTTP vs HTTPS Detection
- [ ] **Plain HTTP cookie:** Inspect the `Set-Cookie` header from `POST /api/auth/login` over `http://localhost:5050`.
  - *Expected:* Cookie is named `tw_session` with `HttpOnly; SameSite=Lax` and **no** `Secure` flag; no `Strict-Transport-Security` header.
- [ ] **Behind nginx HTTPS (or localhost `X-Forwarded-Proto: https`):** Send a request from `localhost` with header `X-Forwarded-Proto: https`.
  - *Expected:* Cookie is named `__Host-tw_session` with `Secure`, and `Strict-Transport-Security` header is present. (Verified automatically by `HttpsDetectionTests`.)

### 2.4 Dashboards, Storage Resilience & SignalR
- [ ] **Dashboard CRUD & layout/data separation:** Create a second dashboard, save layout via `PUT /api/dashboards/{id}/layout`, save tile data via `PUT /api/dashboards/{id}/tiles/{tileId}/data`, then update layout again.
  - *Expected:* Tile data remains intact and stored separately under `data/users/<userId>/dashboards/<dashboardId>/data/`.
- [ ] **Corrupt JSON recovery:** Corrupt a non-critical JSON file (e.g. `data/site.json`) with invalid text and call `GET /api/site`.
  - *Expected:* Server does not crash, logs a warning, renames the corrupt file to `site.json.corrupt.<timestamp>.bak`, and returns default settings.
- [ ] **Swagger & SignalR hub:** Open `http://localhost:5050/swagger` and confirm all endpoints are documented; authenticated SignalR clients can connect to `/hubs/dashboard` and invoke `Ping()`.

## Phase 3: Frontend Shell

Build the Svelte frontend into `wwwroot` and start the .NET server:
```bash
npm --prefix src/web run build
dotnet run --project src/Tilewright.Server
```
Open `http://localhost:5050` in your desktop browser and on your tablet (`http://<your-pc-ip>:5050`).

### 3.1 First-Run, Login, Sessions & Auto-Login
- [ ] **First-run admin setup:** With an empty `src/Tilewright.Server/data` folder, open `http://localhost:5050`.
  - *Expected:* One-time Admin Setup screen appears. Creating the admin logs you in and opens your empty "Home" dashboard.
- [ ] **Stay logged in across refresh and server restart:** Refresh the browser, then stop and restart `dotnet run` and refresh again.
  - *Expected:* You remain logged in without seeing the login screen.
- [ ] **User-list login (password & passwordless):** Open Settings → **Site & Users**, add a user without a password (e.g. "Tablet") and a user with a password. Log out.
  - *Expected:* Login screen shows all users. Tapping "Tablet" logs straight in; tapping a password-protected user prompts for their password.
- [ ] **Auto-login per device:** As admin, enable **Auto-login** in Site Settings, log in as the passwordless user, clear the session cookie (or simulate fresh browser), and reload.
  - *Expected:* Logs straight back in as the remembered user on that device. Clicking Logout forgets the device's auto-login choice.

### 3.2 Dashboard View, Edit Mode (Done/Cancel) & Layout
- [ ] **Empty dashboard prompt:** On a fresh dashboard, observe the empty-state prompt.
  - *Expected:* Prompts you into Edit Mode with a clear **+ Add Tiles** button.
- [ ] **Edit mode & free-placement canvas (Variation C):** Click **Edit**, add a **Clock** and a **Note** tile, drag them to open positions (gaps preserved when Auto-arrange is off), resize them, and click **Done**. Refresh the page.
  - *Expected:* Positions and sizes persist across reload; default grid is 64px column width, 64px cell height, 10px gap.
- [ ] **Edit mode Cancel reverts layout but keeps tile data:** In View mode, type text into the **Note** tile (wait ~1s or blur). Enter **Edit** mode, move/resize tiles, and click **Cancel**.
  - *Expected:* Tile positions/sizes revert to before Edit mode, while the note text remains saved.
- [ ] **Tile content locked in Edit mode:** In Edit mode, try typing in the Note tile.
  - *Expected:* Tile content ignores pointer input (`pointer-events: none`); only the tile toolbar and resize handles respond.
- [ ] **Delete confirmation:** In Edit mode, click `✕` on a tile.
  - *Expected:* Prompts for confirmation before deleting.

### 3.3 Themes, Icons, Backgrounds & Settings
- [ ] **Light, Dark & Follow device setting:** Open Settings → **Appearance & Grid** and switch between Light, Dark, and Follow device setting.
  - *Expected:* Page chrome, tiles, Shadow DOM Web Components, and local MDI SVG icons all update immediately (zero external CDN requests in Network tab).
- [ ] **Background upload & precedence:** Upload a JPEG/PNG/WebP image in User Settings (or Site Settings), adjust **Dim**, **Blur**, and **Tile opacity**, and toggle **Show tile borders** and **Backdrop blur**.
  - *Expected:* Image is resized (max 2560px) and re-encoded to WebP on the server, served with immutable cache headers, and displays cleanly.
- [ ] **Admin vs User permissions:** Log in as a non-admin user and open Settings.
  - *Expected:* The **Site & Users** tab is hidden; only Appearance & Grid, Account, and Version are shown.

### 3.4 Version Stamping & Mismatch Banner
- [ ] **Version tab:** Open Settings → **Version**.
  - *Expected:* Frontend version and Server version both display `0.1.0+<build>` and match when built together.
- [ ] **Version mismatch banner:** Rebuild `Tilewright.Server` (`dotnet build src/Tilewright.Server/Tilewright.Server.csproj`) without rebuilding `src/web`, restart the server, and reload (or let SignalR reconnect).
  - *Expected:* Amber **"New version available — Reload"** banner appears at the top of the page, and Settings → Version flags the mismatch.

## Phase 4: Multiple Dashboards UI

Rebuild the frontend (and backend if needed) and open `http://localhost:5050` on desktop and tablet:
```bash
dotnet build src/Tilewright.Server/Tilewright.Server.csproj
npm --prefix src/web run build
dotnet run --project src/Tilewright.Server --no-build
```

### 4.1 Dashboard Management (Create, Rename, Reorder, Duplicate, Delete)
- [ ] **Create dashboards:** Click the dashboard title in the top-left → **Manage Dashboards**, create two new dashboards (e.g. "Kitchen" with an icon, and "Office").
  - *Expected:* New dashboards appear in the switcher menu and bottom page dots appear.
- [ ] **Rename, change icon & background override:** In **Manage Dashboards**, edit one dashboard's name, icon, and set a per-dashboard background override (solid colour or uploaded image).
  - *Expected:* Switching to that dashboard shows its override background; switching back restores your user/site default background.
- [ ] **Reorder dashboards:** Use the Up/Down arrow buttons in **Manage Dashboards**.
  - *Expected:* Page dots and switcher menu update to the new order and persist across reload.
- [ ] **Duplicate dashboard:** Add a Clock and a Note (with text) to a dashboard, then click **Duplicate** in **Manage Dashboards**.
  - *Expected:* The duplicated dashboard opens with a copy of all tiles and their note text.
- [ ] **Delete dashboard:** Delete a duplicate dashboard (confirm prompt), and verify the Delete button is disabled when only 1 dashboard remains.
  - *Expected:* Confirmation prompt appears; deleting switches cleanly to a remaining dashboard.
- [ ] **Enable / Disable dashboard:** In **Manage Dashboards**, disable one of your dashboards (while at least one other remains enabled).
  - *Expected:* Disabled dashboard is hidden from the switcher menu, page dots, and swipe navigation, while staying listed in **Manage Dashboards** with an **Enable** button; the last remaining enabled dashboard cannot be disabled.

### 4.2 Switching, Swipe Safety & Per-Device Memory
- [ ] **Swipe & keyboard switching (View mode):** On tablet (touch swipe left/right) and desktop (click-drag or Left/Right arrow keys or page dots or top-left switcher menu), move between dashboards.
  - *Expected:* Smoothly switches dashboards; vertical scrolling and typing inside a Note tile do **not** accidentally trigger a swipe.
- [ ] **Infinite cycling toggle:** In Settings → **Appearance & Grid**, toggle **Infinite cycling through dashboards** off and save, then swipe / press arrows / click `‹` `›` at the first and last dashboards. Turn it back on and repeat.
  - *Expected:* When **off**, navigation stops at the first and last enabled dashboard (`‹` / `›` buttons disable at the ends); when **on**, it wraps seamlessly from last → first and first → last.
- [ ] **Swipe disabled in Edit mode:** Enter **Edit** mode on one dashboard and swipe horizontally or press Left/Right arrow keys.
  - *Expected:* Dashboard does **not** switch; switcher menu is disabled and page dots are hidden; Done/Cancel affects only the current dashboard.
- [ ] **Hidden dashboards unmounted:** Switch away from a dashboard containing a Clock tile.
  - *Expected:* Previous `<DashboardGrid>` and `<tw-clock-tile>` are unmounted (no hidden clock intervals running).
- [ ] **Per-device last-viewed memory:** Switch to your 2nd or 3rd dashboard, then refresh or reopen the browser on that device.
  - *Expected:* Reopens directly to the last-viewed dashboard on that device.

## Phase 5: Addon Framework

Run automated tests (includes zip-slip, install/upgrade/disable/secrets/recovery, and failed-addon resilience):
```bash
dotnet test src/Tilewright.sln
```
Then build and run the app:
```bash
npm --prefix src/web run build
dotnet run --project src/Tilewright.Server --no-build
```

### 5.1 Admin Addon Manager & Built-in Addons
- [ ] **Built-in addons listed:** Log in as Admin and open **Settings → Addons**.
  - *Expected:* `Default Themes` (`themes-default`) and `Material Design Icons (MDI)` (`icons-mdi`) appear as `Built-in` and `enabled`.
- [ ] **Invalid zip rejections:** Try uploading a zip with no `addon.json` and a zip with a `../` path.
  - *Expected:* Both are rejected with clear error messages (also verified by `AddonFrameworkTests`).
- [ ] **Upload, pending & restart flow:** Zip the worked example from `docs/addons.md` (`addon.json` + `hello-tile.js`) and upload it via **Upload .zip**.
  - *Expected:* Addon appears as `pending-install` with a **"Restart required"** banner and **Restart Now** button (in Development, clicking Restart Now tells you to restart manually). After restarting the server, the addon is `enabled`.

### 5.2 Tile Picker & Generated Settings Forms
- [ ] **Tile picker search & addon chips:** Enter **Edit** mode on a dashboard and click **+ Add Tile**.
  - *Expected:* Scrollable card grid (full-screen sheet on tablet, modal on desktop) showing icon, name, description, version, addon name, search box, and addon filter chips.
- [ ] **Settings open on add & schema form:** Pick the **Clock** tile (or your uploaded **Greeting** tile).
  - *Expected:* Tile is added at its default size and its generated settings form opens immediately. Saving updates the tile live; clicking `⚙` on any tile's edit toolbar re-opens settings.

### 5.3 Disable, Remove & Recovery Override
- [ ] **Disable addon & placeholder:** In **Settings → Addons**, click **Disable** on your uploaded addon and restart the server.
  - *Expected:* Its tile is no longer offered in the Tile Picker; existing tiles on your dashboard show an **"Addon disabled"** placeholder while preserving their settings and data. Re-enabling and restarting restores the tile intact.
- [ ] **Recovery override without UI:** Add an addon ID to `src/Tilewright.Server/data/disabled-addons.txt` (or set `Tilewright__DisabledAddons=<id>`) and restart.
  - *Expected:* Addon starts in `disabled` state with a **"Forced off (config)"** badge.

## Phase 6: Initial Addons
*(Checklist will be detailed at the end of Phase 6.)*

## Phase 7: Polish and Scripts
*(Checklist will be detailed at the end of Phase 7.)*
