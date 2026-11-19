# Tilewright Decisions Log

Every significant architectural and product decision is recorded here. **Do not reverse a recorded decision without asking the project owner.**

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-11-19 | **Backend: C# on .NET 10 (LTS), ASP.NET Core (Kestrel) + SignalR** | Long-term support, single-binary/no-Node runtime hosting, built-in SignalR for live push to tablets/browsers, runs cleanly as a Linux systemd service. |
| 2026-11-19 | **Frontend builds to static files served by Kestrel (`wwwroot`)** | No Node.js required at runtime on the server; frontend talks to the backend only over HTTP API and SignalR. Framework choice is deferred until after Phase 1 Prototype. |
| 2026-11-19 | **No database — JSON files on disk, cached in memory behind storage interfaces** | Simple home-network deployment (2–3 users), human-inspectable files, zero DB ops. Abstracted behind `IUserStore`, `IDashboardStore`, `ISessionStore`, etc. so SQLite can replace it later. |
| 2026-11-19 | **In-process .NET addon trust model** | Simplest model for a single-author home-network project. Addons are fully trusted, admin-only, and applied on server restart. Documented prominently in `README.md` and `docs/architecture.md`. |
| 2026-11-19 | **Single unified "Addon" concept with declared "Contributions"** | Avoids splitting addons into separate "frontend" and "backend" package types; one `addon.json` manifest can contribute any combination of tile types, server component, themes, and icon packs. |
| 2026-11-19 | **Tiles are Web Components (Custom Elements)** | Keeps addon tiles independent of whatever frontend framework the host shell uses. Design tokens pass into Shadow DOM via CSS custom properties. |
| 2026-11-19 | **Addons can be disabled without removal (+ config/env recovery override)** | Lets an admin safely turn off a misbehaving addon without losing tile settings or data, and recover even if a broken addon makes the admin UI unreachable. |
| 2026-11-19 | **Everything goes through the server (no direct browser-to-3rd-party calls)** | Avoids CORS issues and keeps secrets (Home Assistant tokens, API keys, camera credentials) strictly on the server. |
| 2026-11-19 | **Opaque random session tokens, hashed on disk, 1-year lifetime, persistent across restarts** | Suitable for wall-mounted tablets and home devices that stay logged in. Stored as hashes in `sessions.json`; revoked on logout, user removal, or password change/reset. |
| 2026-11-19 | **Optional per-user passwords & user-list login screen** | Home-network convenience for 2–3 trusted household users. Accepted trade-off: anyone on the LAN can act as a no-password user. |
| 2026-11-19 | **Auto-detect HTTP vs HTTPS via forwarded headers (localhost proxy only)** | Works seamlessly over plain HTTP or behind nginx HTTPS without a manual mode switch. `CookieSecurePolicy.SameAsRequest`, plus HSTS and `__Host-` prefix only on HTTPS. |
| 2026-11-19 | **Multiple dashboards per user from the start** | Avoids a painful schema migration later; swipe navigation in view mode with per-device last-viewed memory. |
| 2026-11-19 | **Gridstack.js as candidate grid library (validated in Phase 1 Layout Lab)** | Built-in touch support, drag, resize, locking, and responsive column handling. Final commitment depends on Phase 1 tablet testing. |
| 2026-11-19 | **Local offline bundling (no runtime CDN dependencies)** | Dashboard must work reliably on a home LAN without internet access; icons (MDI SVGs), fonts, and JS libraries are all served locally. |
| 2026-11-19 | **Material Design Icons (MDI) bundled locally as default icon pack** | Home Assistant uses `mdi:` icon names, enabling direct mapping with monochrome `currentColor` theming. |
| 2026-11-19 | **Home Assistant integration via WebSocket API (+ REST for one-off calls)** | Real-time push updates for sensor states and control toggles without aggressive polling. |
| 2026-11-19 | **Git-independent versioning (`src/version.props` + `src/build-number.txt`)** | Builds must succeed and produce full version metadata (`Major.Minor.Patch+build`, date, machine name) from a plain source folder with no `.git` directory or git installed. |
| 2026-11-19 | **`install.sh` builds from source on the server** | Simplest release workflow initially; prebuilt release downloads are deferred to `docs/improvements.md`. |
| 2026-11-19 | **Phase 1 API/Tile harness uses an in-browser mock transport** | Keeps Phase 1 lightweight (static files served via Python) while proving the Web Component tile contract and UI flow; will be wired to the real .NET API and SignalR hub in Phase 2. |
| 2026-11-19 | **Layout model: Variation C (Free-Placement Canvas) with Gridstack.js** | Validated in the Phase 1 Layout Lab. Default grid settings: **64px column width, 64px cell height, 10px gap**, with tiles able to span arbitrary columns (not capped at 2 columns). |
| 2026-11-19 | **Frontend stack: Svelte 5 + TypeScript + Vite** | Compiles away runtime overhead for older tablets, binds cleanly to Web Component custom elements, and builds to static files in `wwwroot` with no Node at runtime. |
| 2026-11-19 | **Backend API style: ASP.NET Core Minimal APIs grouped by feature** | Less boilerplate than Controllers while supporting OpenAPI/Swagger, auth, and DI identically; grouped into focused endpoint modules (`AuthEndpoints`, `DashboardEndpoints`, etc.). |
| 2026-11-19 | **Build counter (`src/build-number.txt`) increments on every build and is committed** | Easy to verify incrementing builds in development; `install.sh` resets any local server-side counter bump before `git pull` to avoid merge conflicts. |
