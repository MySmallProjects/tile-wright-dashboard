# Tilewright Release Package (Ubuntu / Debian)

This archive contains a prebuilt production release of **Tilewright** (backend + compiled Svelte frontend + built-in addons). No .NET SDK, Node.js, npm, or git is required on the target server.

## Contents

- `app/` — Prebuilt `Tilewright.Server` binaries, `wwwroot/` static frontend, and built-in `addons/`
- `install.sh` — Production installer and in-place upgrader
- `VERSION` — Release version and build number
- `README.md` — This file

## Quick Install or Upgrade

Extract this archive and run `install.sh` from inside the extracted folder:

```bash
chmod +x install.sh
./install.sh
```

The installer will:
1. Check Ubuntu/Debian compatibility and `sudo`/root access
2. Install the **.NET 10 ASP.NET Core Runtime** (`aspnetcore-runtime-10.0`) if missing
3. Create the `tilewright` system user and persistent folders
4. Install or atomically upgrade `/opt/tilewright` (never touching `/var/lib/tilewright` or `/etc/tilewright/tilewright.env`)
5. Configure and enable the `tilewright` systemd service on `http://0.0.0.0:8080`
6. Start/restart the service and verify `/api/version`

For non-interactive installs/upgrades:

```bash
./install.sh --yes
```

### Installing or Upgrading Automatically from GitHub / Gitea

You can also use `install-latest-release.sh` on the server to automatically detect your CPU architecture (`linux-x64` / `linux-arm64`), download the latest release, verify its checksum, and run `install.sh`:

```bash
./install-latest-release.sh --repo https://github.com/<owner>/<repo>
```

## Folder Locations

| Purpose | Path |
| --- | --- |
| Application binaries & `wwwroot` | `/opt/tilewright` |
| Persistent data (dashboards, users, sessions, secrets, addons) | `/var/lib/tilewright` |
| Environment overrides | `/etc/tilewright/tilewright.env` |
| Systemd unit | `/etc/systemd/system/tilewright.service` |
| Service user | `tilewright` |

## First-Run Setup

Open `http://<server-ip>:8080` (or via your reverse proxy) in a browser to create the first administrator account.

## Service & Logs

```bash
sudo systemctl status tilewright
sudo systemctl restart tilewright
sudo journalctl -u tilewright -f
```

## Reverse Proxy (nginx)

Kestrel listens on `http://0.0.0.0:8080`. To place nginx in front of it (recommended for HTTPS, Screen Wake Lock, and PWA install):

```nginx
server {
    listen 80;
    server_name tilewright.local;

    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for SignalR WebSockets
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $http_connection;
        proxy_read_timeout 86400s;
    }
}
```

## Backup & Restore

All persistent data lives in `/var/lib/tilewright`:

```bash
# Backup
sudo tar -czf tilewright-backup-$(date +%Y%m%d).tar.gz -C /var/lib tilewright

# Restore
sudo systemctl stop tilewright
sudo tar -xzf tilewright-backup-YYYYMMDD.tar.gz -C /var/lib
sudo chown -R tilewright:tilewright /var/lib/tilewright
sudo systemctl start tilewright
```

## Recovery: Disabling Addons Without the UI

If an addon prevents the Admin UI from loading:
1. Add its addon ID (one per line) to `/var/lib/tilewright/disabled-addons.txt`, **or**
2. Set `Tilewright__DisabledAddons=id1,id2` in `/etc/tilewright/tilewright.env`
3. Restart: `sudo systemctl restart tilewright`
