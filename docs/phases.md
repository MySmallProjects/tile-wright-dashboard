# Tilewright Build Phases

Work proceeds one phase at a time. Each phase is complete when its **Done when** criteria pass in [docs/testing.md](testing.md).

## Phase 1: Prototype (Disposable, Time-Boxed) — *Built (Awaiting Verification)*
- **Scope:** Vanilla HTML/CSS/JS prototype in `src/prototype/` with Gridstack.js bundled locally.
  - **Layout Lab:** 4 grid layout variations (Fixed-Width Centred, Fluid Breakpoint, Free-Placement Canvas, Strict Flow-Order with Pinned Slots), live controls (cell size, gap, column width, add default tile, move/resize snapping, flow vs pinned, auto-arrange, edit/view mode with Done/Cancel, background image + dim + tile opacity + backdrop blur, Light/Dark toggle), and swipe between 3 mock dashboards.
  - **API/Tile Harness:** Dev-tools page with `<tw-clock-tile>` Web Component proving the tile contract, plus in-browser mock login, cookie state, and SignalR push panels.
  - **Frontend recommendation:** Recommendation on frontend approach (Svelte vs Vue vs Vanilla + Lit) after testing.
- **Done when:** All items in [Testing — Phase 1](testing.md#phase-1-prototype) pass across desktop and tablet (and phone if available), a winning Layout Lab variation is selected, and the frontend approach is agreed.

## Phase 2: Backend Skeleton — *Pending*
- **Scope:** .NET 10 solution (`Tilewright.Server`, `Tilewright.Server.Tests`), JSON storage with atomic writes and in-memory cache, users, first-run admin setup, persistent sessions, roles, HTTP/HTTPS detection via forwarded headers, dashboards model (list per user), git-independent versioning (`version.props`, `build-number.txt`, `GET /api/version`), Swagger in dev, SignalR hub, and xUnit tests.
- **Done when:** All items in [Testing — Phase 2](testing.md#phase-2-backend-skeleton) and xUnit tests pass.

## Phase 3: Frontend Shell — *Pending*
- **Scope:** Chosen frontend stack building to `wwwroot`. Login, user list, first-run setup, dashboard view, edit mode (Done/Cancel), Gridstack layout using the winning Lab variation, Light/Dark themes, icons, backgrounds (with server-side resize/re-encode), site/user settings, and version-mismatch reload banner.
- **Done when:** All items in [Testing — Phase 3](testing.md#phase-3-frontend-shell) pass.

## Phase 4: Multiple Dashboards UI — *Pending*
- **Scope:** Horizontal swipe navigation, page dots, switcher menu, create/rename/reorder/duplicate/delete dashboards, unmounting hidden dashboards, and per-device last-viewed dashboard memory.
- **Done when:** All items in [Testing — Phase 4](testing.md#phase-4-multiple-dashboards-ui) pass.

## Phase 5: Addon Framework — *Pending*
- **Scope:** `addon.json` manifest, in-process assembly loader, resilience to failed addons, zip upload with zip-slip/size validation, enable/disable + config recovery override, pending/restart flow, tile contract, tile picker, schema-generated settings forms (including repeating groups, dynamic options, write-only secrets), custom settings element support, addon-level settings, and built-in themes + MDI icon pack as addons.
- **Done when:** All items in [Testing — Phase 5](testing.md#phase-5-addon-framework) pass.

## Phase 6: Initial Addons — *Pending*
- **Scope:** Build in order: Clock, Notes, Countdown, Links, Image, API/Stock, Home Assistant (read), Home Assistant (control).
- **Done when:** All items in [Testing — Phase 6](testing.md#phase-6-initial-addons) pass.

## Phase 7: Polish and Scripts — *Pending*
- **Scope:** Performance and tablet/device testing, complete documentation (`architecture.md`, `addons.md`, `deployment.md`), `scripts/dev-setup.sh`, and `scripts/install.sh`.
- **Done when:** All items in [Testing — Phase 7](testing.md#phase-7-polish-and-scripts) pass.
