#!/usr/bin/env bash
set -euo pipefail

# Tilewright Release Builder
# Compiles framework-dependent releases for Ubuntu/Debian (linux-x64 and linux-arm64),
# builds the Svelte frontend, strips .pdb files, and packages release zip archives
# with install.sh, README.md, VERSION, and .sha256 checksums.

SKIP_TESTS=false
RIDS_CSV="linux-x64,linux-arm64"
OUT_DIR=""

usage() {
  cat <<EOF
Usage: $0 [options]

Options:
  --skip-tests         Skip running 'dotnet test' before packaging
  --rids <list>        Comma-separated RIDs to build (default: linux-x64,linux-arm64)
  --out-dir <path>     Output directory for release archives (default: <repo>/releases)
  -h, --help           Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --rids)
      [[ $# -ge 2 ]] || { echo "Error: --rids requires a value."; exit 1; }
      RIDS_CSV="$2"
      shift 2
      ;;
    --out-dir)
      [[ $# -ge 2 ]] || { echo "Error: --out-dir requires a value."; exit 1; }
      OUT_DIR="$2"
      shift 2
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/releases}"

RELEASE_INSTALL="$SCRIPT_DIR/install.sh"
RELEASE_README="$SCRIPT_DIR/README.md"
SERVER_CSPROJ="$REPO_ROOT/src/Tilewright.Server/Tilewright.Server.csproj"
SLN_PATH="$REPO_ROOT/src/Tilewright.sln"
WEB_DIR="$REPO_ROOT/src/web"
VERSION_PROPS="$REPO_ROOT/src/version.props"
BUILD_NUM_FILE="$REPO_ROOT/src/build-number.txt"

# Check required files
for req_file in "$RELEASE_INSTALL" "$RELEASE_README" "$SERVER_CSPROJ" "$SLN_PATH" "$VERSION_PROPS"; do
  if [[ ! -f "$req_file" ]]; then
    echo "Error: Required file not found: $req_file"
    exit 1
  fi
done

# Check required tools
for tool in dotnet node npm zip sha256sum; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Error: Required tool '$tool' is not installed or not in PATH."
    exit 1
  fi
done

echo "=== Tilewright Release Builder ==="
echo "Repository: $REPO_ROOT"
echo "Targets:    $RIDS_CSV"
echo "Output dir: $OUT_DIR"
echo ""

# Warn if git working tree has uncommitted changes
if [[ -d "$REPO_ROOT/.git" ]] && command -v git >/dev/null 2>&1; then
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null || true)" ]]; then
    echo "[Warn] Git working tree has uncommitted changes (GitDirty will be marked true in assembly metadata)."
  fi
fi

# 1. Run tests (unless skipped)
if [[ "$SKIP_TESTS" == "true" ]]; then
  echo "[Tests] Skipping dotnet test (--skip-tests)."
else
  echo "[Tests] Running dotnet test..."
  if ! dotnet test "$SLN_PATH"; then
    echo ""
    read -r -p "Tests failed! Continue creating the release anyway? [y/N] " test_reply
    if [[ ! "$test_reply" =~ ^[Yy]$ ]]; then
      echo "Aborted due to test failure."
      exit 1
    fi
    echo "[Warn] Continuing release build despite test failures."
  fi
fi

# Create temporary staging directory (auto-cleaned on exit)
TMP_ROOT="$(mktemp -d "/tmp/tilewright-release-XXXXXX")"
cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$OUT_DIR"

IFS=',' read -r -a RIDS <<< "$RIDS_CSV"
if [[ ${#RIDS[@]} -eq 0 ]]; then
  echo "Error: No target RIDs specified."
  exit 1
fi

# 2. Publish backend for each RID
# First RID increments src/build-number.txt; subsequent RIDs reuse the exact same build number.
FIRST_RID=true
SEMVER=""
FULL_VERSION=""

for raw_rid in "${RIDS[@]}"; do
  rid="$(echo "$raw_rid" | tr -d '[:space:]')"
  [[ -n "$rid" ]] || continue

  PUBLISH_DIR="$TMP_ROOT/publish-$rid"
  mkdir -p "$PUBLISH_DIR"

  echo ""
  if [[ "$FIRST_RID" == "true" ]]; then
    echo "[Publishing] Tilewright.Server ($rid, framework-dependent, incrementing build number)..."
    dotnet publish "$SERVER_CSPROJ" \
      -c Release \
      -r "$rid" \
      --self-contained false \
      -p:DebugType=none \
      -p:DebugSymbols=false \
      -o "$PUBLISH_DIR"

    # Read stamped version right after first publish so frontend & zips match
    MAJOR="$(sed -n 's/.*<Major>\s*\([0-9]*\)\s*<\/Major>.*/\1/p' "$VERSION_PROPS" | head -n 1)"
    MINOR="$(sed -n 's/.*<Minor>\s*\([0-9]*\)\s*<\/Minor>.*/\1/p' "$VERSION_PROPS" | head -n 1)"
    PATCH="$(sed -n 's/.*<Patch>\s*\([0-9]*\)\s*<\/Patch>.*/\1/p' "$VERSION_PROPS" | head -n 1)"
    BUILD_NUM="0"
    if [[ -f "$BUILD_NUM_FILE" ]]; then
      BUILD_NUM="$(tr -d '[:space:]' < "$BUILD_NUM_FILE")"
    fi
    SEMVER="${MAJOR}.${MINOR}.${PATCH}"
    FULL_VERSION="${SEMVER}+${BUILD_NUM}"

    echo "[Version] Stamped version: $FULL_VERSION"

    # Build Svelte frontend once with the matching version & build number
    echo ""
    echo "[Building] Svelte frontend (matching version $FULL_VERSION)..."
    npm --prefix "$WEB_DIR" install
    npm --prefix "$WEB_DIR" run build

    FIRST_RID=false
  else
    echo "[Publishing] Tilewright.Server ($rid, framework-dependent, build $FULL_VERSION)..."
    dotnet publish "$SERVER_CSPROJ" \
      -c Release \
      -r "$rid" \
      --self-contained false \
      -p:IncrementBuildNumber=false \
      -p:DebugType=none \
      -p:DebugSymbols=false \
      -o "$PUBLISH_DIR"
  fi
done

# 3. Stage and zip each RID archive
CREATED_FILES=()
for raw_rid in "${RIDS[@]}"; do
  rid="$(echo "$raw_rid" | tr -d '[:space:]')"
  [[ -n "$rid" ]] || continue

  PUBLISH_DIR="$TMP_ROOT/publish-$rid"
  STAGE_DIR="$TMP_ROOT/stage-$rid"
  mkdir -p "$STAGE_DIR/app"

  echo ""
  echo "[Packaging] Assembling $rid release..."
  cp -a "$PUBLISH_DIR/." "$STAGE_DIR/app/"

  # Replace wwwroot with freshly built frontend matching FULL_VERSION
  rm -rf "$STAGE_DIR/app/wwwroot"
  cp -a "$REPO_ROOT/src/Tilewright.Server/wwwroot" "$STAGE_DIR/app/wwwroot"

  # Strip any .pdb files (including from dependencies)
  find "$STAGE_DIR/app" -type f -name '*.pdb' -delete

  # Ensure main binary is executable
  chmod +x "$STAGE_DIR/app/Tilewright.Server"

  # Copy release installer, README, and VERSION into zip root
  cp "$RELEASE_INSTALL" "$STAGE_DIR/install.sh"
  chmod +x "$STAGE_DIR/install.sh"
  cp "$RELEASE_README" "$STAGE_DIR/README.md"
  printf '%s\n' "$FULL_VERSION" > "$STAGE_DIR/VERSION"

  ZIP_NAME="tilewright-${SEMVER}-${rid}.zip"
  ZIP_PATH="$OUT_DIR/$ZIP_NAME"
  rm -f "$ZIP_PATH" "${ZIP_PATH}.sha256"

  (
    cd "$STAGE_DIR"
    zip -rq "$ZIP_PATH" app install.sh README.md VERSION
  )

  (
    cd "$OUT_DIR"
    sha256sum "$ZIP_NAME" > "${ZIP_NAME}.sha256"
  )

  CREATED_FILES+=("$ZIP_PATH")
done

echo ""
echo "=== Release Complete (v${FULL_VERSION}) ==="
echo "Generated archives in $OUT_DIR:"
for f in "${CREATED_FILES[@]}"; do
  SIZE="$(du -h "$f" | cut -f1)"
  echo "  - $(basename "$f") ($SIZE)"
  echo "    SHA256: $(cat "${f}.sha256")"
done
echo ""
echo "Upload the .zip and .sha256 files to your GitHub or Gitea release."
