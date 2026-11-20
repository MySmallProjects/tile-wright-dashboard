#!/usr/bin/env bash
set -euo pipefail

# Tilewright Production Installer / Upgrader (Ubuntu / Debian)
# Builds from source and installs to /opt/tilewright with data in /var/lib/tilewright.
# Safe to re-run for upgrades: never wipes dashboards, sessions, secrets, or addons.

AUTO_YES=false
REPO_URL="${TILEWRIGHT_REPO_URL:-}"

for arg in "$@"; do
  case "$arg" in
    -y|--yes) AUTO_YES=true ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--yes]"
      exit 1
      ;;
  esac
done

APP_DIR="/opt/tilewright"
DATA_DIR="/var/lib/tilewright"
ETC_DIR="/etc/tilewright"
SRC_CACHE="/opt/tilewright-src"
SERVICE_USER="tilewright"
UNIT_PATH="/etc/systemd/system/tilewright.service"

echo "=== Tilewright Production Installer ==="
echo ""
echo "Planned steps:"
echo "  1. Check Ubuntu/Debian OS and sudo/root permissions"
echo "  2. Install .NET 10 SDK and Node.js/npm if missing (for building from source)"
echo "  3. Prepare or update source code (without assuming git for versioning)"
echo "  4. Build Svelte frontend and publish Tilewright.Server to $APP_DIR"
echo "  5. Create '$SERVICE_USER' user and data/config folders ($DATA_DIR, $ETC_DIR)"
echo "  6. Write and enable systemd unit ($UNIT_PATH, Restart=always)"
echo "  7. Start (or restart) the tilewright service"
echo "  8. Verify http://127.0.0.1:5050/api/version and print post-install notes"
echo ""

if [[ "$AUTO_YES" != "true" ]]; then
  read -r -p "Proceed with installation? [y/N] " reply
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

# 2. Install .NET 10 SDK & Node.js/npm if missing
has_dotnet10=false
if command -v dotnet >/dev/null 2>&1 && dotnet --list-sdks 2>/dev/null | grep -q '^10\.'; then
  has_dotnet10=true
fi

if [[ "$has_dotnet10" == "true" ]]; then
  echo "[OK] .NET 10 SDK already installed."
else
  echo "[Installing] .NET 10 SDK..."
  $SUDO apt-get update
  if apt-cache show dotnet-sdk-10.0 >/dev/null 2>&1; then
    $SUDO apt-get install -y dotnet-sdk-10.0
  else
    $SUDO apt-get install -y curl ca-certificates
    curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
    chmod +x /tmp/dotnet-install.sh
    $SUDO /tmp/dotnet-install.sh --channel 10.0 --install-dir /usr/share/dotnet
    $SUDO ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet
    rm -f /tmp/dotnet-install.sh
  fi
fi

if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  echo "[OK] Node.js ($(node -v)) and npm ($(npm -v)) already installed."
else
  echo "[Installing] Node.js and npm..."
  $SUDO apt-get update
  $SUDO apt-get install -y nodejs npm
fi

# 3. Locate or pull source code
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$LOCAL_REPO/src/Tilewright.sln" ]]; then
  WORK_SRC="$LOCAL_REPO"
  if [[ -d "$WORK_SRC/.git" ]] && command -v git >/dev/null 2>&1; then
    echo "[Updating] Resetting local build-number.txt bump and pulling latest changes..."
    git -C "$WORK_SRC" checkout -- src/build-number.txt 2>/dev/null || true
    git -C "$WORK_SRC" pull --ff-only || echo "[Warn] git pull skipped or failed; building local checkout."
  else
    echo "[OK] Using local source folder (no .git required): $WORK_SRC"
  fi
else
  if [[ -z "$REPO_URL" ]]; then
    read -r -p "Enter git repository URL to clone Tilewright: " REPO_URL
  fi
  if [[ -z "$REPO_URL" ]]; then
    echo "Error: No source directory or repository URL provided."
    exit 1
  fi
  if [[ -d "$SRC_CACHE/.git" ]]; then
    echo "[Updating] Pulling latest code in $SRC_CACHE..."
    $SUDO git -C "$SRC_CACHE" checkout -- src/build-number.txt 2>/dev/null || true
    $SUDO git -C "$SRC_CACHE" pull --ff-only
  else
    echo "[Cloning] $REPO_URL -> $SRC_CACHE..."
    $SUDO git clone "$REPO_URL" "$SRC_CACHE"
  fi
  WORK_SRC="$SRC_CACHE"
fi

# 4. Build frontend & publish backend from source
echo "[Building] Restoring and publishing Tilewright.Server..."
dotnet restore "$WORK_SRC/src/Tilewright.sln"

# Publish server first (increments build-number.txt), then stamp matching frontend into wwwroot
TMP_PUBLISH="/tmp/tilewright-publish-$$"
rm -rf "$TMP_PUBLISH"
dotnet publish "$WORK_SRC/src/Tilewright.Server/Tilewright.Server.csproj" \
  -c Release \
  -o "$TMP_PUBLISH" \
  --no-restore

echo "[Building] Svelte frontend (matching build number)..."
npm --prefix "$WORK_SRC/src/web" install
npm --prefix "$WORK_SRC/src/web" run build
rm -rf "$TMP_PUBLISH/wwwroot"
cp -r "$WORK_SRC/src/Tilewright.Server/wwwroot" "$TMP_PUBLISH/wwwroot"

$SUDO mkdir -p "$APP_DIR"
$SUDO rm -rf "$APP_DIR.new"
$SUDO mv "$TMP_PUBLISH" "$APP_DIR.new"
if [[ -d "$APP_DIR" ]]; then
  $SUDO rm -rf "$APP_DIR.old"
  $SUDO mv "$APP_DIR" "$APP_DIR.old"
fi
$SUDO mv "$APP_DIR.new" "$APP_DIR"
$SUDO rm -rf "$APP_DIR.old"

# 5. Create service user and persistent folders
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  echo "[Creating] System user '$SERVICE_USER'..."
  $SUDO useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

$SUDO mkdir -p "$DATA_DIR" "$ETC_DIR"
if [[ ! -f "$ETC_DIR/tilewright.env" ]]; then
  $SUDO tee "$ETC_DIR/tilewright.env" >/dev/null <<'ENVEOF'
# Optional Tilewright environment overrides
# Tilewright__DisabledAddons=addon-id-1,addon-id-2
ENVEOF
fi

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
Environment=ASPNETCORE_URLS=http://127.0.0.1:5050
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
sleep 2

# 8. Test /api/version
echo "[Testing] Checking http://127.0.0.1:5050/api/version ..."
if command -v curl >/dev/null 2>&1; then
  VERSION_OUT="$(curl -fsS http://127.0.0.1:5050/api/version || true)"
  if [[ -n "$VERSION_OUT" ]]; then
    echo "[OK] Server responded: $VERSION_OUT"
  else
    echo "[Warn] Server did not respond yet. Check: sudo journalctl -u tilewright -n 50"
  fi
fi

cat <<'NOTES'

=== Important Post-Install Notes ===

1. First-run setup:
   Open the site in your browser (via nginx or SSH tunnel to http://127.0.0.1:5050)
   to create the first administrator account.

2. Folder locations:
   - App binaries:    /opt/tilewright
   - Persistent data: /var/lib/tilewright  (dashboards, users, sessions, secrets, addons)
   - Config env:      /etc/tilewright/tilewright.env

3. Backup:
   sudo tar -czf tilewright-backup.tar.gz -C /var/lib tilewright

4. Service & logs:
   sudo systemctl restart tilewright
   sudo journalctl -u tilewright -f

5. Ready-to-paste nginx config (/etc/nginx/sites-available/tilewright):
   server {
       listen 80;
       server_name tilewright.local;
       client_max_body_size 30m;

       location / {
           proxy_pass http://127.0.0.1:5050;
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
