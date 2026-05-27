#!/usr/bin/env bash
# autoship install script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Calibrax-ai/autoship/main/install.sh | bash
#
# Environment overrides:
#   AUTOSHIP_ROOT     Install directory (default: $HOME/.autoship)
#   AUTOSHIP_BIN      Symlink target for the CLI (default: /usr/local/bin/autoship)
#   AUTOSHIP_REF      Git ref to install (default: main)
#
# What this does:
#   1. Downloads the autoship monorepo tarball from GitHub for the chosen ref
#   2. Extracts packages/core/ into AUTOSHIP_ROOT
#   3. Symlinks AUTOSHIP_ROOT/bin/autoship → AUTOSHIP_BIN
#   4. Prints next-step instructions
#
# Phase 4 of the v0.7.0 bash CLI migration. Replaces `npm install -g
# @cs-calibrax/autoship` as the recommended install path. npm install
# continues to work until Phase 5 deprecates it.

set -euo pipefail

REPO="Calibrax-ai/autoship"
REF="${AUTOSHIP_REF:-main}"
INSTALL_DIR="${AUTOSHIP_ROOT:-$HOME/.autoship}"
BIN_LINK="${AUTOSHIP_BIN:-/usr/local/bin/autoship}"

# Pre-flight: required tools
for tool in curl tar; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Error: required tool '$tool' not found on PATH" >&2
    exit 1
  fi
done

# Working dir
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

TARBALL_URL="https://github.com/${REPO}/archive/refs/heads/${REF}.tar.gz"
AUTH_HEADER=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  # GitHub accepts a PAT for repo content access via the archive URL.
  # Optional now that the repo is public; kept for repo-becomes-private
  # safety and for users behind enterprise proxies that require auth.
  AUTH_HEADER=(-H "Authorization: token ${GITHUB_TOKEN}")
fi

echo "→ Downloading autoship (${REF}) from ${REPO}..."
# ${arr[@]+"${arr[@]}"} guards against unbound-variable error from set -u
# when AUTH_HEADER is empty (no GITHUB_TOKEN set, which is the common case
# for the public repo).
if ! curl -fsSL ${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"} "$TARBALL_URL" | tar -xz -C "$TMP_DIR" 2>/dev/null; then
  http_status="$(curl -sI -o /dev/null -w '%{http_code}' ${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"} "$TARBALL_URL")"
  echo "" >&2
  echo "Error: failed to download tarball (HTTP $http_status)" >&2
  echo "  URL: $TARBALL_URL" >&2
  if [[ "$http_status" == "404" ]]; then
    echo "" >&2
    echo "  If ${REPO} is private in your context, set GITHUB_TOKEN to a" >&2
    echo "  Personal Access Token with repo:read scope and re-run:" >&2
    echo "" >&2
    echo "    GITHUB_TOKEN=ghp_xxx curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash" >&2
    echo "" >&2
    echo "  Generate a token at: https://github.com/settings/tokens" >&2
  fi
  exit 1
fi

# GitHub names the extracted directory like "autoship-<ref>" (slashes in ref
# become dashes). Find it without assuming the exact name.
EXTRACTED="$(find "$TMP_DIR" -maxdepth 1 -mindepth 1 -type d -name "autoship-*" | head -n 1)"
if [[ -z "$EXTRACTED" ]] || [[ ! -d "$EXTRACTED/packages/core" ]]; then
  echo "Error: extracted tarball doesn't contain packages/core/" >&2
  echo "  Expected: $TMP_DIR/autoship-*/packages/core/" >&2
  exit 1
fi

# Install packages/core/ → INSTALL_DIR
echo "→ Installing to ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
# Copy contents (not the directory itself) so re-installs cleanly overwrite.
cp -R "$EXTRACTED/packages/core/." "$INSTALL_DIR/"

# Make sure the entry point is executable (tarball may strip exec bit).
chmod +x "$INSTALL_DIR/bin/autoship" "$INSTALL_DIR/bin/autoship.mjs"

# Symlink the CLI. Try the requested location; if its parent doesn't
# exist or isn't writable, escalate via sudo (interactive only), or
# fall back to ~/.local/bin.
echo "→ Linking ${BIN_LINK} → ${INSTALL_DIR}/bin/autoship..."
BIN_PARENT="$(dirname "$BIN_LINK")"

try_link() {
  # Returns 0 on success.
  mkdir -p "$BIN_PARENT" 2>/dev/null && ln -sf "$INSTALL_DIR/bin/autoship" "$BIN_LINK" 2>/dev/null
}

if ! try_link; then
  if [[ -t 0 ]] && command -v sudo >/dev/null 2>&1; then
    # Interactive shell + sudo available: try with sudo.
    if sudo mkdir -p "$BIN_PARENT" 2>/dev/null && sudo ln -sf "$INSTALL_DIR/bin/autoship" "$BIN_LINK"; then
      :  # success
    else
      BIN_LINK=""
    fi
  else
    BIN_LINK=""
  fi

  if [[ -z "$BIN_LINK" ]]; then
    # Final fallback: ~/.local/bin.
    BIN_LINK="$HOME/.local/bin/autoship"
    mkdir -p "$HOME/.local/bin"
    ln -sf "$INSTALL_DIR/bin/autoship" "$BIN_LINK"
    echo "  Note: couldn't write to ${BIN_PARENT}. Installed to ${BIN_LINK} instead."
    echo "        Add \$HOME/.local/bin to your PATH if it isn't already."
  fi
fi

echo ""
echo "✓ autoship installed."
echo ""
echo "  Verify: autoship --help"
echo "  Next:   cd into a git repo, then run \"autoship init\""
echo ""
echo "  Docs:   https://github.com/${REPO}"
