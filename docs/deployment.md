# Tilewright Deployment Guide (Ubuntu + systemd + nginx)

## 1. Folder Locations

When installed with `scripts/install.sh` on Ubuntu/Debian:

| Purpose | Path |
| --- | --- |
| Application binaries & `wwwroot` | `/opt/tilewright` |
| Persistent data (dashboards, users, sessions, secrets, addons) | `/var/lib/tilewright` |
| Environment / overrides config | `/etc/tilewright/tilewright.env` |
| Systemd unit | `/etc/systemd/system/tilewright.service` |
| Service user | `tilewright` |

Because `/var/lib/tilewright` lives outside `/opt/tilewright`, re-running `scripts/install.sh` upgrades the application in place without touching dashboards, sessions, secrets, or installed addons.

---

## 2. Systemd Service

`/etc/systemd/system/tilewright.service`:

```ini
[Unit]
Description=Tilewright Dashboard Server
After=network.target

[Service]
Type=simple
User=tilewright
Group=tilewright
WorkingDirectory=/opt/tilewright
EnvironmentFile=-/etc/tilewright/tilewright.env
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://127.0.0.1:5050
Environment=Tilewright__DataRoot=/var/lib/tilewright
ExecStart=/opt/tilewright/Tilewright.Server
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Common commands:
```bash
sudo systemctl status tilewright
sudo systemctl restart tilewright
sudo journalctl -u tilewright -f
```

---

## 3. Reverse Proxy (nginx)

Kestrel binds to `127.0.0.1:5050`. Place nginx in front of it for HTTPS (or custom hostnames).

> **Important:**
> - Include `X-Forwarded-Proto`, `X-Forwarded-For`, and `Host` so Tilewright automatically detects HTTPS and sets `__Host-tw_session` with `Secure` and HSTS (and omits them on plain HTTP).
> - Include **WebSocket upgrade headers** for SignalR (`/hubs/`).
> - Features such as browser **Screen Wake Lock** and **PWA install** require HTTPS.

Known-good nginx server block (`/etc/nginx/sites-available/tilewright`):

```nginx
server {
    listen 80;
    server_name tilewright.local;

    # For HTTPS, configure listen 443 ssl; and your certificates,
    # and redirect port 80 -> 443 if desired.

    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:5050;
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

Enable and reload nginx:
```bash
sudo ln -sf /etc/nginx/sites-available/tilewright /etc/nginx/sites-enabled/tilewright
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. Backup & Restore

All user state lives in `/var/lib/tilewright`. To back up cleanly:

```bash
sudo tar -czf tilewright-backup-$(date +%Y%m%d).tar.gz -C /var/lib tilewright
```

To restore on a fresh server, stop `tilewright`, extract into `/var/lib/tilewright`, fix ownership (`sudo chown -R tilewright:tilewright /var/lib/tilewright`), and start `tilewright`.

---

## 5. Recovery: Disabling Addons Without the UI

If an uploaded or misbehaving addon breaks the Admin UI:

1. Add the addon's ID (one per line) to `/var/lib/tilewright/disabled-addons.txt`, **or**
2. Add `Tilewright__DisabledAddons=id1,id2` to `/etc/tilewright/tilewright.env`.
3. Restart the service: `sudo systemctl restart tilewright`.
