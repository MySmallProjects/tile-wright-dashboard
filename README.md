# Tilewright

**Tilewright** is a self-hosted, tile-based dashboard website designed primarily for wall-mounted or handheld touch tablets and desktop browsers. The core is a small framework (login, layout, edit mode, themes, icons, storage, settings UI, and an addon system); almost every feature (clocks, notes, Home Assistant controls, stock prices, etc.) is an **addon**.

> **Trust Model — Read Before Installing Addons**
>
> Server-side addon code is **loaded in-process as .NET assemblies** and runs with the **full permissions of the Tilewright server**. This is a deliberate design choice for a trusted home-network deployment where the administrator is the addon author.
>
> - Installing an addon means running its code. Upload validation catches packaging mistakes, **not** malicious code.
> - Only administrators can install, enable, disable, or remove addons.
> - Addon installs, removals, and enable/disable changes take effect after a **server restart**.
> - Browser-side addon JavaScript runs in the user's session and can call the API as that user.
>
> See [docs/architecture.md](docs/architecture.md) for the full trust model and [docs/improvements.md](docs/improvements.md) for future isolation ideas.

## Quick Start

### Backend & Frontend (Phase 3 — .NET 10 + Svelte 5)

```bash
npm --prefix src/web install
npm --prefix src/web run build
dotnet test src/Tilewright.sln
dotnet run --project src/Tilewright.Server
```

- **App UI:** `http://localhost:5050/` (served statically from `wwwroot`, no Node needed at runtime)
- **API & Swagger UI (dev):** `http://localhost:5050/swagger`
- **Version endpoint:** `http://localhost:5050/api/version`
- **SignalR hub:** `http://localhost:5050/hubs/dashboard`
- **Dev data folder:** `src/Tilewright.Server/data/` (gitignored)

For hot-reloading frontend development alongside `dotnet run`:
```bash
npm --prefix src/web run dev
```
(Proxies `/api` and `/hubs` to `http://localhost:5050`.)

### Phase 1 Prototype (Disposable Layout Lab & Harness)

```bash
cd src/prototype
python3 -m http.server 8080
```

- **Layout Lab:** `http://localhost:8080/`
- **API / Tile Harness:** `http://localhost:8080/harness.html`

## Recovery: Disabling Addons Without the UI

If a misbehaving addon makes the Admin UI unreachable, you can force addons off at startup in either of two ways:

1. **File (one addon ID per line):** Create or edit `<DataRoot>/disabled-addons.txt`
   - Development: `src/Tilewright.Server/data/disabled-addons.txt`
   - Production: `/var/lib/tilewright/disabled-addons.txt`
   - Format: **one addon ID per line** (blank lines and `#` comments are ignored), for example:
     ```text
     # Force-disabled addons
     my-broken-addon
     another-addon
     ```
2. **Environment variable (comma-separated):** Set `Tilewright__DisabledAddons=id1,id2` before starting the server.

Restart the server for changes to take effect.

## Documentation

- [Addons Guide](docs/addons.md) — manifest reference, tile contract, schema types, and worked example
- [Decisions Log](docs/decisions.md) — recorded architectural and product decisions
- [Phases](docs/phases.md) — build roadmap and "done when" criteria
- [Testing Checklists](docs/testing.md) — manual test checklists per phase and device matrix
- [Future Improvements](docs/improvements.md) — hardening and ideas deferred for later
- *(Planned in later phases)* `docs/architecture.md`, `docs/addons.md`, `docs/deployment.md`
