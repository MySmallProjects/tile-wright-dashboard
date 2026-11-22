#!/usr/bin/env bash
set -euo pipefail

# Tilewright Development Setup Script (Ubuntu / Debian)
# Safe to re-run. Does not assume git history for versioning.

AUTO_YES=false
GIT_INSECURE_SSL="${TILEWRIGHT_GIT_INSECURE:-false}"
REPO_URL="${TILEWRIGHT_REPO_URL:-}"

for arg in "$@"; do
  case "$arg" in
    -y|--yes) AUTO_YES=true ;;
    --insecure-ssl) GIT_INSECURE_SSL=true ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--yes] [--insecure-ssl]"
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Tilewright Development Setup ==="
echo ""

if [[ ! -f /etc/os-release ]]; then
  echo "Error: Cannot detect OS (/etc/os-release missing)."
  echo "Please install .NET 10 SDK and Node.js 18+ manually, then run:"
  echo "  npm --prefix src/web install && npm --prefix src/web run build"
  echo "  dotnet test src/Tilewright.sln"
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" && "${ID_LIKE:-}" != *"debian"* && "${ID_LIKE:-}" != *"ubuntu"* ]]; then
  echo "Unsupported OS: ${PRETTY_NAME:-unknown}."
  echo "This script targets Ubuntu/Debian. Manual setup steps:"
  echo "  1. Install .NET 10 SDK (https://dotnet.microsoft.com/download/dotnet/10.0)"
  echo "  2. Install Node.js 18+ and npm"
  echo "  3. Run: npm --prefix src/web install && npm --prefix src/web run build"
  echo "  4. Run: dotnet test src/Tilewright.sln"
  exit 1
fi

echo "Detected OS: ${PRETTY_NAME:-$ID}"
echo ""
echo "Planned steps:"
echo "  1. Check/install .NET 10 SDK (needed to build and run Tilewright.Server)"
echo "  2. Check/install Node.js, npm, and git if missing"
echo "  3. Locate, clone, or update source code (with optional SSL bypass for local git)"
echo "  4. Restore NuGet packages and install frontend npm packages"
echo "  5. Build frontend (src/web -> wwwroot) and run backend xUnit tests"
echo ""

if [[ "$AUTO_YES" != "true" ]]; then
  read -r -p "Proceed? [y/N] " reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

SUDO=""
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "Error: sudo is required to install missing system packages."
    exit 1
  fi
fi

# 1. Check / install .NET 10 SDK
has_dotnet10=false
if command -v dotnet >/dev/null 2>&1; then
  if dotnet --list-sdks 2>/dev/null | grep -q '^10\.'; then
    has_dotnet10=true
  fi
fi

if [[ "$has_dotnet10" == "true" ]]; then
  echo "[OK] .NET 10 SDK is already installed."
else
  echo "[Installing] .NET 10 SDK..."
  $SUDO apt-get update
  if apt-cache show dotnet-sdk-10.0 >/dev/null 2>&1; then
    $SUDO apt-get install -y dotnet-sdk-10.0
  else
    $SUDO apt-get install -y curl ca-certificates
    curl -fsSL https://dot.net/v1/dotnet-install.sh -o /tmp/dotnet-install.sh
    chmod +x /tmp/dotnet-install.sh
    /tmp/dotnet-install.sh --channel 10.0 --install-dir "$HOME/.dotnet"
    rm -f /tmp/dotnet-install.sh
    export PATH="$HOME/.dotnet:$PATH"
    echo "[Note] Installed .NET 10 SDK to $HOME/.dotnet (add to PATH in ~/.bashrc if needed)."
  fi
fi

# 2. Check / install Node.js, npm, and git
if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  echo "[OK] Node.js ($(node -v)) and npm ($(npm -v)) are already installed."
else
  echo "[Installing] Node.js and npm..."
  $SUDO apt-get update
  $SUDO apt-get install -y nodejs npm
fi

if command -v git >/dev/null 2>&1; then
  echo "[OK] git ($(git --version)) is already installed."
else
  echo "[Installing] git..."
  $SUDO apt-get update
  $SUDO apt-get install -y git
fi

# 3. Locate, clone, or pull source code
GIT_SSL_ARGS=()
if [[ "$GIT_INSECURE_SSL" == "true" ]]; then
  GIT_SSL_ARGS=(-c http.sslVerify=false)
fi

if [[ -f "$LOCAL_REPO/src/Tilewright.sln" ]]; then
  REPO_ROOT="$LOCAL_REPO"
  if [[ -d "$REPO_ROOT/.git" ]]; then
    echo "[Updating] Resetting local build-number.txt bump and pulling latest changes..."
    git -C "$REPO_ROOT" checkout -- src/build-number.txt 2>/dev/null || true
    git "${GIT_SSL_ARGS[@]}" -C "$REPO_ROOT" pull --ff-only || echo "[Warn] git pull skipped or failed; building local checkout."
  else
    echo "[OK] Using local source folder (no .git required): $REPO_ROOT"
  fi
elif [[ -f "$PWD/src/Tilewright.sln" ]]; then
  REPO_ROOT="$PWD"
  if [[ -d "$REPO_ROOT/.git" ]]; then
    echo "[Updating] Resetting local build-number.txt bump and pulling latest changes..."
    git -C "$REPO_ROOT" checkout -- src/build-number.txt 2>/dev/null || true
    git "${GIT_SSL_ARGS[@]}" -C "$REPO_ROOT" pull --ff-only || echo "[Warn] git pull skipped or failed; building local checkout."
  else
    echo "[OK] Using local source folder (no .git required): $REPO_ROOT"
  fi
else
  TARGET_DIR="$PWD/TileWright"
  if [[ -d "$TARGET_DIR/.git" && -f "$TARGET_DIR/src/Tilewright.sln" ]]; then
    echo "[Updating] Pulling latest code in $TARGET_DIR..."
    git -C "$TARGET_DIR" checkout -- src/build-number.txt 2>/dev/null || true
    git "${GIT_SSL_ARGS[@]}" -C "$TARGET_DIR" pull --ff-only
  else
    if [[ -z "$REPO_URL" ]]; then
      read -r -p "Enter git repository URL to clone Tilewright: " REPO_URL
    fi
    if [[ -z "$REPO_URL" ]]; then
      echo "Error: No source directory or repository URL provided."
      exit 1
    fi
    if [[ "$GIT_INSECURE_SSL" != "true" && "$AUTO_YES" != "true" && "$REPO_URL" == https://* ]]; then
      read -r -p "Skip SSL verification when cloning (for self-signed/local Gitea)? [y/N] " ssl_reply
      if [[ "$ssl_reply" =~ ^[Yy]$ ]]; then
        GIT_INSECURE_SSL=true
        GIT_SSL_ARGS=(-c http.sslVerify=false)
      fi
    fi
    echo "[Cloning] $REPO_URL -> $TARGET_DIR..."
    git "${GIT_SSL_ARGS[@]}" clone "$REPO_URL" "$TARGET_DIR"
    if [[ "$GIT_INSECURE_SSL" == "true" ]]; then
      git -C "$TARGET_DIR" config http.sslVerify false
    fi
  fi
  REPO_ROOT="$TARGET_DIR"
fi

# 4. Restore & install dependencies
echo ""
echo "[Restoring] NuGet packages..."
dotnet restore "$REPO_ROOT/src/Tilewright.sln"

echo "[Installing] Frontend npm packages..."
npm --prefix "$REPO_ROOT/src/web" install

# 4. Build backend, build frontend (matching build number), and run tests
echo ""
echo "[Building] Backend solution..."
dotnet build "$REPO_ROOT/src/Tilewright.sln" --no-restore

echo "[Building] Frontend static bundle (src/web -> wwwroot)..."
npm --prefix "$REPO_ROOT/src/web" run build

echo "[Testing] Running xUnit suite..."
dotnet test "$REPO_ROOT/src/Tilewright.sln" --no-build

echo ""
echo "=== Setup Complete ==="
echo "Run the development server (use --no-build so server & frontend versions match):"
echo "  dotnet run --project src/Tilewright.Server --no-build --urls=http://0.0.0.0:8080"
echo ""
echo "Optional hot-reload frontend dev server (proxies /api and /hubs to :8080):"
echo "  npm --prefix src/web run dev"
echo ""
echo "Dev data folder: $REPO_ROOT/src/Tilewright.Server/data/"
echo "Documentation:   $REPO_ROOT/docs/"
