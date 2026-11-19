# Future Improvements & Hardening

Ideas and hardening steps intentionally deferred from the initial build to keep Tilewright simple for a home-network deployment.

## Security & Addon Isolation
- **Out-of-process addons** with systemd or Docker isolation and a defined IPC/HTTP protocol, replacing the fully trusted in-process assembly model.
- **Scripting sandbox** (e.g. Jint) for lightweight untrusted server-side addon logic.
- **Collectible `AssemblyLoadContext`** for hot-unloading addons without a server restart (note: solves unloading, not trust/isolation).
- **Signed addon packages**, SHA-256 checksums, and admin allowlists.
- **Manifest-declared permissions model** (e.g. network hosts, secrets, filesystem scope).
- **Iframe-sandboxed tiles** for untrusted browser-side addon code.
- **Per-tile "requires password" flag** for sensitive controls (e.g. garage door or alarm).

## Architecture & Storage
- **SQLite storage backend** implementing the existing store interfaces, plus time-series history storage (e.g. power usage graphs).
- **Declarative addons** (manifest-only URL + secret auth header + polling interval + JSON path mapping) if not folded into the API/Stock addon during Phase 6.
- **Auto-disable after repeated failed startups** for crash-looping addons.

## Deployment & UX
- **Prebuilt release downloads in `install.sh`** (GitHub Releases / tarball) instead of building from source on the target server.
- **Per-dashboard gradient backgrounds** in addition to solid colours and uploaded images.
- **PWA manifest and Screen Wake Lock API** support (for HTTPS deployments on wall-mounted tablets).
