#!/usr/bin/env bash
# Preflight check — runs before commits, pushes, tags, and releases.
# Exits 0 (pass) or 1 (fail with a clear error message).
#
# The supported (documented) release path is the CI tag-push: `npm version …`
# then `git push --follow-tags`, where GitHub Actions (release.yml) does the
# signed + notarised build and the GitHub publish using *repo secrets*. That
# path needs no local signing identity, Apple credentials, or GH_TOKEN, so those
# are WARNINGS here, not hard failures. They are only required for a local
# `npm run release` (electron-builder --publish always); the warnings call that
# out. The hard gates that matter on every machine — config validity and a green
# test suite — still fail the script.

set -euo pipefail

PASS=0
FAIL=1

warn() { echo "⚠️  $*" >&2; }
fail() { echo "❌ PREFLIGHT FAILED: $*" >&2; exit $FAIL; }
ok()   { echo "✅ $*"; }

# ── Machine identity ──────────────────────────────────────────────────────────
HOSTNAME=$(hostname)
echo "🖥️  Machine: $HOSTNAME"

# ── Node / npm ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  fail "node not found on PATH"
fi
ok "node $(node --version)"

if ! command -v npm &>/dev/null; then
  fail "npm not found on PATH"
fi
ok "npm $(npm --version)"

# ── electron-builder ─────────────────────────────────────────────────────────
if ! npx electron-builder --version &>/dev/null; then
  fail "electron-builder not available"
fi
ok "electron-builder $(npx electron-builder --version 2>/dev/null)"

# ── electron-builder config validation ───────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SCRIPT_DIR/../electron-builder.yml"

if [[ ! -f "$CONFIG" ]]; then
  fail "electron-builder.yml not found at $CONFIG"
fi

# Check for the historically-problematic publisherName field (not valid for mac/github provider)
if grep -q "publisherName" "$CONFIG"; then
  fail "electron-builder.yml contains 'publisherName' — remove it (not valid with github provider on macOS)"
fi
ok "electron-builder.yml: no invalid publisherName field"

# ── macOS code-signing identities ────────────────────────────────────────────
# Warn (don't fail): the CI release signs with the CSC_LINK repo secret, not the
# local keychain. A local Developer ID is only needed for a local publish.
if [[ "$(uname)" == "Darwin" ]]; then
  IDENTITIES=$(security find-identity -v -p codesigning 2>/dev/null | grep -c "Developer ID" || true)
  if [[ "$IDENTITIES" -eq 0 ]]; then
    warn "No local 'Developer ID' code-signing identity — fine for the CI release (signs via CSC_LINK); a local 'npm run release' would fail."
  else
    ok "Code-signing: $IDENTITIES Developer ID identity/identities found"
  fi

  # Check notarize script exists and has credentials configured
  NOTARIZE="$SCRIPT_DIR/notarize.js"
  if [[ ! -f "$NOTARIZE" ]]; then
    fail "scripts/notarize.js missing"
  fi
  ok "notarize.js present"

  # Warn (don't fail) if notarization env vars are absent — may be in keychain
  if [[ -z "${APPLE_ID:-}" || -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]]; then
    warn "APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD not set — notarization may fail if not in keychain"
  else
    ok "Notarization env vars present"
  fi
fi

# ── GH_TOKEN ──────────────────────────────────────────────────────────────────
# Warn (don't fail): the CI release publishes with the Actions-provided
# GITHUB_TOKEN. A local GH_TOKEN is only needed for a local publish.
if [[ -z "${GH_TOKEN:-}" ]]; then
  warn "GH_TOKEN not set — fine for the CI release (uses the Actions GITHUB_TOKEN); a local 'npm run release' would fail to publish."
else
  ok "GH_TOKEN present"
fi

# ── Test suite ────────────────────────────────────────────────────────────────
echo ""
echo "🧪 Running test suite..."
cd "$SCRIPT_DIR/.."
if ! npm test; then
  fail "Tests failed — fix before releasing"
fi
ok "All tests passed"

echo ""
echo "✅ Preflight complete on $HOSTNAME — safe to proceed."
