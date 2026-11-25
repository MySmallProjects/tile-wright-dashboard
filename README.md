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


## Install

For the *release* version, it'll download the latest release package and install it. 
Download the install script:
 ```bash
   curl -O -x https://yunohost.lan/gitea/ice/tile-wright/raw/branch/main/scripts/install-latest-release.sh 
   sudo chmod +x install-latest-release.sh
 ```

Run it:
```./install-latest-release.sh --insecure-ssl --repo https://yunohost.lan/gitea/ice/tile-wright.git```


For the *Dev* version, it'll download the source, install depdencies and compile the code.
Download the install script:
```bash
curl -O -x https://yunohost.lan/gitea/ice/tile-wright/raw/branch/main/scripts/install-dev.sh
chmod +x install-dev.sh
 ```

Run it:
```./install-dev.sh```



## Quick Start

### Backend & Frontend (.NET 10 + Svelte 5)

```bash
npm --prefix src/web install
npm --prefix src/web run build
dotnet test src/Tilewright.sln
dotnet run --project src/Tilewright.Server
```

- **App UI:** `http://localhost:8080/` (served statically from `wwwroot`, no Node needed at runtime)
- **API & Swagger UI (dev):** `http://localhost:8080/swagger`
- **Version endpoint:** `http://localhost:8080/api/version`
- **SignalR hub:** `http://localhost:8080/hubs/dashboard`
- **Dev data folder:** `src/Tilewright.Server/data/` (gitignored)

For hot-reloading frontend development alongside `dotnet run`:
```bash
npm --prefix src/web run dev
```
(Proxies `/api` and `/hubs` to `http://localhost:8080`.)

### Phase 1 Prototype (Disposable Layout Lab & Harness)

```bash
cd src/prototype
python3 -m http.server 8080
```

- **Layout Lab:** `http://localhost:8080/`
- **API / Tile Harness:** `http://localhost:8080/harness.html`

## Scripts

The `scripts/` folder contains two top-level scripts for Ubuntu/Debian:

| Script | Purpose |
| --- | --- |
| [`scripts/install-dev.sh`](scripts/install-dev.sh) | Sets up a development environment from source: installs the .NET 10 SDK, Node.js/npm, and git if missing, restores/builds the backend and Svelte frontend, and runs the test suite. |
| [`scripts/install-latest-release.sh`](scripts/install-latest-release.sh) | Installs or upgrades a production server from a prebuilt GitHub or Gitea release: detects CPU architecture (`linux-x64` / `linux-arm64`), downloads the latest release zip, verifies its SHA256 checksum, and runs the bundled `install.sh` (which installs only the .NET 10 ASP.NET Core Runtime and configures systemd on `http://0.0.0.0:8080`). |

Example production install or upgrade:
```bash
./scripts/install-latest-release.sh --repo https://github.com/<owner>/<repo>
```

## Creating a Release

Release packaging files live in `scripts/release/` (`create-release.sh`, `install.sh`, and `README.md`).

To build prebuilt framework-dependent release archives for Ubuntu/Debian (`linux-x64` and `linux-arm64`):

1. Update `<Major>`, `<Minor>`, and `<Patch>` in `src/version.props` if bumping the semantic version, and commit your changes so the working tree is clean.
2. Run the release script from the repository root:
   ```bash
   ./scripts/release/create-release.sh
   ```
   Optional flags:
   - `--skip-tests` — skip running `dotnet test` before packaging
   - `--rids <list>` — comma-separated target RIDs (default: `linux-x64,linux-arm64`)
   - `--out-dir <path>` — output folder (default: `releases/`)
3. The script runs tests (prompting if any fail), publishes both targets with a shared build number, compiles the Svelte frontend, strips `.pdb` files, and writes the archives and checksums to `releases/` (gitignored):
   - `releases/tilewright-<version>-linux-x64.zip` + `.sha256`
   - `releases/tilewright-<version>-linux-arm64.zip` + `.sha256`
4. Create a new release on GitHub or Gitea and upload the generated `.zip` and `.sha256` files as release assets.

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

- [Architecture](docs/architecture.md) — terminology, components, data flow, in-process trust model, storage, and HTTPS detection
- [Addons Guide](docs/addons.md) — manifest reference, tile contract, schema types, and worked example
- [Deployment Guide](docs/deployment.md) — Ubuntu systemd unit, nginx config, backups, upgrades, and recovery
- [Decisions Log](docs/decisions.md) — recorded architectural and product decisions
- [Phases](docs/phases.md) — build roadmap and "done when" criteria
- [Testing Checklists](docs/testing.md) — manual test checklists per phase and device matrix
- [Future Improvements](docs/improvements.md) — hardening and ideas deferred for later
