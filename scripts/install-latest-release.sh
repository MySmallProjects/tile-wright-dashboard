#!/usr/bin/env bash
set -euo pipefail

# Tilewright Latest Release Installer / Upgrader (Ubuntu / Debian)
# Downloads the latest release archive for this machine's architecture from
# GitHub or Gitea, verifies its checksum (if available), extracts it to a
# temporary folder, and runs the release's install.sh.

AUTO_YES=false
INSECURE_SSL="${TILEWRIGHT_GIT_INSECURE:-false}"
REPO_URL="${TILEWRIGHT_REPO_URL:-}"
AUTH_TOKEN="${TILEWRIGHT_TOKEN:-}"

usage() {
  cat <<EOF
Usage: $0 --repo <repo-url> [options]

Options:
  --repo <url>         GitHub or Gitea repository URL
                       (e.g. https://github.com/owner/tile-wright
                             http://gitea.local/owner/tile-wright)
  --token <token>      Optional API token for private repositories
  --insecure-ssl       Skip SSL verification (for self-signed HTTPS servers)
  -y, --yes            Non-interactive mode (auto-accept prompts)
  -h, --help           Show this help message

Environment variables:
  TILEWRIGHT_REPO_URL      Default for --repo
  TILEWRIGHT_TOKEN         Default for --token
  TILEWRIGHT_GIT_INSECURE  Set to 'true' for --insecure-ssl
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      [[ $# -ge 2 ]] || { echo "Error: --repo requires a URL."; exit 1; }
      REPO_URL="$2"
      shift 2
      ;;
    --token)
      [[ $# -ge 2 ]] || { echo "Error: --token requires a value."; exit 1; }
      AUTH_TOKEN="$2"
      shift 2
      ;;
    --insecure-ssl)
      INSECURE_SSL=true
      shift
      ;;
    -y|--yes)
      AUTO_YES=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

echo "=== Tilewright Latest Release Installer / Upgrader ==="
echo ""

# 1. OS & sudo check
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

# 2. Ensure required tools are installed (for minimal Ubuntu/Debian servers)
MISSING_PKGS=()
command -v curl >/dev/null 2>&1 || MISSING_PKGS+=(curl)
command -v unzip >/dev/null 2>&1 || MISSING_PKGS+=(unzip)
command -v python3 >/dev/null 2>&1 || MISSING_PKGS+=(python3)
[[ -d /etc/ssl/certs ]] || MISSING_PKGS+=(ca-certificates)

if [[ ${#MISSING_PKGS[@]} -gt 0 ]]; then
  echo "[Prerequisites] Installing missing tools: ${MISSING_PKGS[*]}..."
  $SUDO apt-get update
  $SUDO apt-get install -y "${MISSING_PKGS[@]}"
fi

# 3. Detect machine architecture
UNAME_ARCH="$(uname -m)"
case "$UNAME_ARCH" in
  x86_64|amd64)
    RID="linux-x64"
    ;;
  aarch64|arm64)
    RID="linux-arm64"
    ;;
  *)
    echo "Error: Unsupported CPU architecture '$UNAME_ARCH'. Supported: x86_64 (linux-x64), aarch64/arm64 (linux-arm64)."
    exit 1
    ;;
esac
echo "[System] Detected architecture: $UNAME_ARCH ($RID)"

# 4. Repository URL & SSL handling
if [[ -z "$REPO_URL" ]]; then
  if [[ "$AUTO_YES" == "true" ]]; then
    echo "Error: --repo <url> (or TILEWRIGHT_REPO_URL) is required in --yes mode."
    exit 1
  fi
  read -r -p "Enter GitHub or Gitea repository URL: " REPO_URL
fi

if [[ -z "$REPO_URL" ]]; then
  echo "Error: No repository URL provided."
  exit 1
fi

# Strip trailing slash and .git suffix
REPO_URL="${REPO_URL%/}"
REPO_URL="${REPO_URL%.git}"

# Parse URL components via python3 (supports subpath-hosted Gitea e.g. /gitea/owner/repo)
PARSED_URL="$(python3 - "$REPO_URL" <<'PY'
import shlex, sys
from urllib.parse import urlparse

u = urlparse(sys.argv[1])
parts = [p for p in u.path.strip("/").split("/") if p]
if u.scheme not in ("http", "https") or not u.netloc or len(parts) < 2:
    sys.stderr.write(f"Error: Invalid repository URL (expected http(s)://host/[subpath/]owner/repo): {sys.argv[1]}\n")
    sys.exit(1)

owner, repo = parts[-2], parts[-1]
base_path = "/" + "/".join(parts[:-2]) if len(parts) > 2 else ""
repo_path = f"{owner}/{repo}"
print(f"URL_SCHEME={shlex.quote(u.scheme)}")
print(f"URL_NETLOC={shlex.quote(u.netloc)}")
print(f"URL_BASE_PATH={shlex.quote(base_path)}")
print(f"REPO_PATH={shlex.quote(repo_path)}")
PY
)"
URL_SCHEME=""
URL_NETLOC=""
URL_BASE_PATH=""
REPO_PATH=""
eval "$PARSED_URL"

if [[ "$URL_SCHEME" == "http" ]]; then
  echo "[Notice] Repository URL uses plain HTTP (no HTTPS): $REPO_URL"
  if [[ "$AUTO_YES" != "true" ]]; then
    read -r -p "Skip HTTPS security check and continue over plain HTTP? [y/N] " http_reply
    if [[ ! "$http_reply" =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 0
    fi
  fi
elif [[ "$URL_SCHEME" == "https" && "$INSECURE_SSL" != "true" && "$AUTO_YES" != "true" && "$URL_NETLOC" != "github.com" ]]; then
  read -r -p "Skip SSL certificate verification for $URL_NETLOC (for self-signed/local Gitea)? [y/N] " ssl_reply
  if [[ "$ssl_reply" =~ ^[Yy]$ ]]; then
    INSECURE_SSL=true
  fi
fi

# Build curl arguments (separate API vs asset download headers)
API_CURL_ARGS=(-fsSL)
DL_CURL_ARGS=(-fsSL)
if [[ "$INSECURE_SSL" == "true" ]]; then
  API_CURL_ARGS+=(-k)
  DL_CURL_ARGS+=(-k)
fi

if [[ "$URL_NETLOC" == "github.com" || "$URL_NETLOC" == "www.github.com" ]]; then
  API_URL="https://api.github.com/repos/${REPO_PATH}/releases/latest"
  API_CURL_ARGS+=(-H "Accept: application/vnd.github+json")
  if [[ -n "$AUTH_TOKEN" ]]; then
    API_CURL_ARGS+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
    DL_CURL_ARGS+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
  fi
else
  API_URL="${URL_SCHEME}://${URL_NETLOC}${URL_BASE_PATH}/api/v1/repos/${REPO_PATH}/releases/latest"
  if [[ -n "$AUTH_TOKEN" ]]; then
    API_CURL_ARGS+=(-H "Authorization: token ${AUTH_TOKEN}")
    DL_CURL_ARGS+=(-H "Authorization: token ${AUTH_TOKEN}")
  fi
fi

# 5. Query latest release metadata
echo "[Release] Checking latest release from $API_URL ..."
TMP_DIR="$(mktemp -d "/tmp/tilewright-download-XXXXXX")"
cleanup() {
  rm -rf "${TMP_DIR:-}"
}
trap cleanup EXIT

RELEASE_JSON="$TMP_DIR/release.json"
if ! curl "${API_CURL_ARGS[@]}" "$API_URL" -o "$RELEASE_JSON"; then
  echo "Error: Failed to fetch latest release metadata from $API_URL."
  echo "Check the repository URL, network connectivity, --token (if private), or --insecure-ssl."
  exit 1
fi

# Parse release tag, matching zip asset, and optional .sha256 asset
PARSED_RELEASE="$(python3 - "$RELEASE_JSON" "$RID" <<'PY'
import json, shlex, sys

with open(sys.argv[1], "r", encoding="utf-8", errors="replace") as f:
    raw = f.read()

try:
    data = json.loads(raw)
except json.JSONDecodeError:
    snippet = raw.strip().replace("\n", " ")[:200]
    sys.stderr.write("Error: Server did not return valid JSON for the latest release.\n")
    sys.stderr.write(f"Response preview: {snippet}\n")
    sys.stderr.write("Check the repository URL (including any subpath like /gitea) or --token if the repo is private.\n")
    sys.exit(1)

if not isinstance(data, dict):
    sys.stderr.write("Error: Unexpected release metadata format from server.\n")
    sys.exit(1)

if "assets" not in data and "message" in data:
    sys.stderr.write(f"Error from server API: {data['message']}\n")
    sys.exit(1)

rid = sys.argv[2]
tag = data.get("tag_name") or data.get("name") or "unknown"
assets = data.get("assets") or []

zip_asset = None
for a in assets:
    name = a.get("name", "")
    if name.endswith(f"-{rid}.zip"):
        zip_asset = a
        break

if not zip_asset:
    names = [a.get("name", "") for a in assets]
    sys.stderr.write(f"Error: No release asset ending with '-{rid}.zip' found in release '{tag}'.\n")
    if names:
        sys.stderr.write("Available assets: " + ", ".join(names) + "\n")
    else:
        sys.stderr.write("This release has no attached assets.\n")
    sys.exit(1)

zip_name = zip_asset["name"]
zip_url = zip_asset.get("browser_download_url", "")
sha_url = ""
for a in assets:
    if a.get("name") == f"{zip_name}.sha256":
        sha_url = a.get("browser_download_url", "")
        break

print(f"LATEST_TAG={shlex.quote(tag)}")
print(f"ASSET_NAME={shlex.quote(zip_name)}")
print(f"ASSET_URL={shlex.quote(zip_url)}")
print(f"SHA_URL={shlex.quote(sha_url)}")
PY
)"

LATEST_TAG=""
ASSET_NAME=""
ASSET_URL=""
SHA_URL=""
eval "$PARSED_RELEASE"

if [[ -z "$ASSET_URL" ]]; then
  echo "Error: Release asset '$ASSET_NAME' does not have a download URL."
  exit 1
fi

# 6. Check currently installed version (if any) and confirm
INSTALLED_VERSION=""
if [[ -d /opt/tilewright && -f /opt/tilewright/Tilewright.Server ]]; then
  if [[ -f /opt/tilewright/VERSION ]]; then
    INSTALLED_VERSION="$(tr -d '[:space:]' < /opt/tilewright/VERSION)"
  else
    API_VER="$(curl -fsS --max-time 2 "http://127.0.0.1:8080/api/version" 2>/dev/null || true)"
    if [[ -n "$API_VER" ]]; then
      INSTALLED_VERSION="$(echo "$API_VER" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
    fi
    INSTALLED_VERSION="${INSTALLED_VERSION:-installed (unknown version)}"
  fi
fi

echo ""
if [[ -n "$INSTALLED_VERSION" ]]; then
  echo "  Currently installed: $INSTALLED_VERSION"
  echo "  Latest available:    $LATEST_TAG ($ASSET_NAME)"
  ACTION_WORD="download and upgrade"
else
  echo "  Installation status: Not installed"
  echo "  Latest available:    $LATEST_TAG ($ASSET_NAME)"
  ACTION_WORD="download and install"
fi
echo ""

if [[ "$AUTO_YES" != "true" ]]; then
  read -r -p "Proceed to $ACTION_WORD? [y/N] " dl_reply
  if [[ ! "$dl_reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# 7. Download release zip and verify SHA256 if provided
ZIP_FILE="$TMP_DIR/$ASSET_NAME"
echo "[Downloading] $ASSET_URL ..."
curl "${DL_CURL_ARGS[@]}" "$ASSET_URL" -o "$ZIP_FILE"

if [[ -n "$SHA_URL" ]]; then
  SHA_FILE="$TMP_DIR/${ASSET_NAME}.sha256"
  echo "[Verifying] Downloading and checking SHA256 checksum..."
  if curl "${DL_CURL_ARGS[@]}" "$SHA_URL" -o "$SHA_FILE"; then
    (
      cd "$TMP_DIR"
      sha256sum -c "$(basename "$SHA_FILE")"
    )
  else
    echo "[Warn] Could not download checksum file; continuing without SHA256 verification."
  fi
fi

# 8. Extract and run bundled install.sh
EXTRACT_DIR="$TMP_DIR/extracted"
mkdir -p "$EXTRACT_DIR"
echo "[Extracting] Unzipping $ASSET_NAME..."
unzip -q "$ZIP_FILE" -d "$EXTRACT_DIR"

if [[ ! -f "$EXTRACT_DIR/install.sh" ]]; then
  echo "Error: install.sh not found inside $ASSET_NAME."
  exit 1
fi

chmod +x "$EXTRACT_DIR/install.sh"
echo ""
if [[ "$AUTO_YES" == "true" ]]; then
  "$EXTRACT_DIR/install.sh" --yes
else
  "$EXTRACT_DIR/install.sh"
fi
