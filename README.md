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

## Quick Start (Phase 1 Prototype)

Phase 1 contains a **disposable** Layout Lab and API/Tile harness in `src/prototype/` (vanilla HTML/CSS/JS, offline-bundled).

```bash
cd src/prototype
python3 -m http.server 8080
```

Then open:
- **Layout Lab:** `http://localhost:8080/` (or `http://<your-lan-ip>:8080/` from a tablet on the same network)
- **API / Tile Harness:** `http://localhost:8080/harness.html`

## Documentation

- [Decisions Log](docs/decisions.md) — recorded architectural and product decisions
- [Phases](docs/phases.md) — build roadmap and "done when" criteria
- [Testing Checklists](docs/testing.md) — manual test checklists per phase and device matrix
- [Future Improvements](docs/improvements.md) — hardening and ideas deferred for later
- *(Planned in later phases)* `docs/architecture.md`, `docs/addons.md`, `docs/deployment.md`
