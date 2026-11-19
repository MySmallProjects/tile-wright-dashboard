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
*(Checklist will be detailed at the end of Phase 2.)*

## Phase 3: Frontend Shell
*(Checklist will be detailed at the end of Phase 3.)*

## Phase 4: Multiple Dashboards UI
*(Checklist will be detailed at the end of Phase 4.)*

## Phase 5: Addon Framework
*(Checklist will be detailed at the end of Phase 5.)*

## Phase 6: Initial Addons
*(Checklist will be detailed at the end of Phase 6.)*

## Phase 7: Polish and Scripts
*(Checklist will be detailed at the end of Phase 7.)*
