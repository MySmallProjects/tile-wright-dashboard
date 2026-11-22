#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# WARNING: THIS SCRIPT IS ONLY MEANT TO EXIST INSIDE A TILEWRIGHT RELEASE ZIP!
#
# Do NOT run this script directly from the git repository.
# It expects the prebuilt application in ./app/ alongside this script.
#
# To download and install/upgrade the latest release from GitHub or Gitea, run:
#   scripts/install-latest-release.sh --repo <repo-url>
# ==============================================================================

AUTO_YES=false

for arg in "$@"; do
  case "$arg" in
    -y|--yes) AUTO_YES=true ;;
    -h|--help)
      echo "Usage: $0 [--yes]"
      echo ""
      echo "Installs or upgrades Tilewright from an extracted release zip archive."
      echo "Safe to re-run for upgrades: preserves /var/lib/tilewright and /etc/tilewright."
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--yes]"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SRC="$SCRIPT_DIR/app"

if [[ ! -f "$APP_SRC/Tilewright.Server" ]]; then
  echo "Error: Prebuilt application not found at $APP_SRC/Tilewright.Server."
  echo ""
  echo "This install.sh script is only meant to be run from inside an extracted"
  echo "Tilewright release zip archive (not directly from the git repository)."
  echo "To download and install the latest release, use install-latest-release.sh."
  exit 1
fi

APP_DIR="/opt/tilewright"
DATA_DIR="/var/lib/tilewright"
ETC_DIR="/etc/tilewright"
SERVICE_USER="tilewright"
UNIT_PATH="/etc/systemd/system/tilewright.service"
LISTEN_PORT="8080"

PACKAGE_VERSION="unknown"
if [[ -f "$SCRIPT_DIR/VERSION" ]]; then
  PACKAGE_VERSION="$(tr -d '[:space:]' < "$SCRIPT_DIR/VERSION")"
fi

MODE="install"
INSTALLED_VERSION=""
if [[ -d "$APP_DIR" && -f "$APP_DIR/Tilewright.Server" ]]; then
  MODE="upgrade"
  if [[ -f "$APP_DIR/VERSION" ]]; then
    INSTALLED_VERSION="$(tr -d '[:space:]' < "$APP_DIR/VERSION")"
  elif command -v curl >/dev/null 2>&1; then
    API_JSON="$(curl -fsS --max-time 2 "http://127.0.0.1:${LISTEN_PORT}/api/version" 2>/dev/null || true)"
    if [[ -n "$API_JSON" ]]; then
      INSTALLED_VERSION="$(echo "$API_JSON" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    fi
  fi
  if [[ -z "$INSTALLED_VERSION" ]]; then
    INSTALLED_VERSION="installed (unknown version)"
  fi
fi

if [[ "$MODE" == "upgrade" ]]; then
  echo "=== Tilewright Production Upgrader ==="
  echo ""
  echo "  Currently installed: $INSTALLED_VERSION"
  echo "  Release package:     $PACKAGE_VERSION"
else
  echo "=== Tilewright Production Installer ==="
  echo ""
  echo "  Release package:     $PACKAGE_VERSION"
fi
echo ""
echo "Planned steps:"
echo "  1. Check Ubuntu/Debian OS and root/sudo permissions"
echo "  2. Check/install .NET 10 ASP.NET Core Runtime (aspnetcore-runtime-10.0) if missing"
echo "  3. Create '$SERVICE_USER' system user and persistent folders ($DATA_DIR, $ETC_DIR)"
if [[ "$MODE" == "upgrade" ]]; then
  echo "  4. Atomically upgrade binaries in $APP_DIR (preserving $DATA_DIR and $ETC_DIR)"
else
  echo "  4. Install application binaries and web assets into $APP_DIR"
fi
echo "  5. Set ownership and permissions on $APP_DIR and $DATA_DIR"
echo "  6. Write and enable systemd unit ($UNIT_PATH, http://0.0.0.0:${LISTEN_PORT}, Restart=always)"
echo "  7. Start (or restart) the tilewright systemd service"
echo "  8. Verify http://127.0.0.1:${LISTEN_PORT}/api/version and print important details"
echo ""

if [[ "$AUTO_YES" != "true" ]]; then
  if [[ "$MODE" == "upgrade" ]]; then
    PROMPT_MSG="Proceed with upgrade ($INSTALLED_VERSION -> $PACKAGE_VERSION)? [y/N] "
  else
    PROMPT_MSG="Proceed with installation? [y/N] "
  fi
  read -r -p "$PROMPT_MSG" reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# 1. OS & permissions check
if [[ ! -f /etc/os-release ]]; then
  echo "Error: /etc/os-release not found."
  exit 1
fi
# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" && "${ID_LIKE:-}" != *"debian"* && "${ID_LIKE:-}" != *"ubuntu"* ]]; then
  echo "Error: Unsupported OS (${PRETTY_NAME:-unknown}). This script targets Ubuntu/Debian."
  exit 1
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "Error: Please run as root or install sudo."
    exit 1
  fi
  SUDO="sudo"
else
  SUDO=""
fi

# 2. Check / install .NET 10 ASP.NET Core Runtime (no SDK, Node, or git required)
has_aspnetcore10=false
if command -v dotnet >/dev/null 2>&1 && dotnet --list-runtimes 2>/dev/null | grep -q '^Microsoft\.AspNetCore\.App 10\.'; then
  has_aspnetcore10=true
fi

if [[ "$has_aspnetcore10" == "true" ]]; then
  echo "[OK] .NET 10 ASP.NET Core Runtime already installed."
else
  echo "[Installing] .NET 10 ASP.NET Core Runtime..."
  $SUDO apt-get update
  if apt-cache show aspnetcore-runtime-10.0 >/dev/null 2>&1; then
    $SUDO apt-get install -y aspnetcore-runtime-10.0
  else
    $SUDO apt-get install -y curl ca-certificates
    TMP_DOTNET_SCRIPT="/tmp/dotnet-install-$$.sh"
    curl -fsSL https://dot.net/v1/dotnet-install.sh -o "$TMP_DOTNET_SCRIPT"
    chmod +x "$TMP_DOTNET_SCRIPT"
    $SUDO "$TMP_DOTNET_SCRIPT" --runtime aspnetcore --channel 10.0 --install-dir /usr/share/dotnet
    $SUDO ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet
    rm -f "$TMP_DOTNET_SCRIPT"
  fi
fi

# Ensure curl is available for post-install health check
if ! command -v curl >/dev/null 2>&1; then
  echo "[Installing] curl (for health check)..."
  $SUDO apt-get update
  $SUDO apt-get install -y curl
fi

# 3. Create service user and persistent folders
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  echo "[Creating] System user '$SERVICE_USER'..."
  $SUDO useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
else
  echo "[OK] System user '$SERVICE_USER' already exists."
fi

$SUDO mkdir -p "$DATA_DIR" "$ETC_DIR"
if [[ ! -f "$ETC_DIR/tilewright.env" ]]; then
  $SUDO tee "$ETC_DIR/tilewright.env" >/dev/null <<'ENVEOF'
# Optional Tilewright environment overrides
# Tilewright__DisabledAddons=addon-id-1,addon-id-2
ENVEOF
fi

# 4. Install / atomically upgrade application binaries
echo "[Installing] Deploying Tilewright $PACKAGE_VERSION to $APP_DIR..."
$SUDO rm -rf "$APP_DIR.new"
$SUDO mkdir -p "$APP_DIR.new"
$SUDO cp -a "$APP_SRC/." "$APP_DIR.new/"
if [[ -f "$SCRIPT_DIR/VERSION" ]]; then
  $SUDO cp "$SCRIPT_DIR/VERSION" "$APP_DIR.new/VERSION"
fi
$SUDO chmod +x "$APP_DIR.new/Tilewright.Server"

if [[ -d "$APP_DIR" ]]; then
  $SUDO rm -rf "$APP_DIR.old"
  $SUDO mv "$APP_DIR" "$APP_DIR.old"
fi
$SUDO mv "$APP_DIR.new" "$APP_DIR"
$SUDO rm -rf "$APP_DIR.old"

# 5. Set ownership and permissions
echo "[Permissions] Setting ownership for '$SERVICE_USER'..."
$SUDO chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR" "$APP_DIR"
$SUDO chmod 750 "$DATA_DIR"

# 6. Write and enable systemd unit
echo "[Configuring] Writing $UNIT_PATH..."
$SUDO tee "$UNIT_PATH" >/dev/null <<EOF
[Unit]
Description=Tilewright Dashboard Server
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=-$ETC_DIR/tilewright.env
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=ASPNETCORE_URLS=http://0.0.0.0:${LISTEN_PORT}
Environment=Tilewright__DataRoot=$DATA_DIR
ExecStart=$APP_DIR/Tilewright.Server
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable tilewright

# 7. Start / restart service
echo "[Starting] Restarting tilewright service..."
$SUDO systemctl restart tilewright

# 8. Test /api/version (retry briefly while Kestrel starts up)
echo "[Testing] Checking http://127.0.0.1:${LISTEN_PORT}/api/version ..."
VERSION_OUT=""
for _ in 1 2 3 4 5; do
  sleep 1
  VERSION_OUT="$(curl -fsS --max-time 2 "http://127.0.0.1:${LISTEN_PORT}/api/version" 2>/dev/null || true)"
  if [[ -n "$VERSION_OUT" ]]; then
    break
  fi
done

if [[ -n "$VERSION_OUT" ]]; then
  echo "[OK] Server responded: $VERSION_OUT"
else
  echo "[Warn] Server did not respond yet. Check logs: sudo journalctl -u tilewright -n 50"
fi

cat <<'NOTES'

=== Important Post-Install Details ===

1. Access Tilewright:
   Open http://<server-ip>:8080 (or via nginx) in your browser.
   On a fresh install, you will be prompted to create the first administrator account.

2. Folder locations:
   - App binaries:    /opt/tilewright
   - Persistent data: /var/lib/tilewright  (dashboards, users, sessions, secrets, addons)
   - Config env:      /etc/tilewright/tilewright.env
   - Systemd unit:    /etc/systemd/system/tilewright.service

3. Backup:
   sudo tar -czf tilewright-backup.tar.gz -C /var/lib tilewright

4. Service & logs:
   sudo systemctl status tilewright
   sudo systemctl restart tilewright
   sudo journalctl -u tilewright -f

5. Ready-to-paste nginx config (/etc/nginx/sites-available/tilewright):
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
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection $http_connection;
           proxy_read_timeout 86400s;
       }
   }

6. HTTPS & cookies:
   Tilewright trusts X-Forwarded-Proto only from localhost (nginx).
   Over plain HTTP, session cookies omit the Secure flag. Over HTTPS,
   Tilewright automatically sets __Host-tw_session with Secure and HSTS.

7. Addons:
   Installing, removing, or enabling/disabling an addon takes effect on restart
   (using "Restart Now" in the Admin UI lets systemd bring the service back up).
NOTES
