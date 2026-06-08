#!/usr/bin/env bash
# Preflight check — runs before commits, pushes, tags, and releases.
# Exits 0 (pass) or 1 (fail with a clear error message).

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
if [[ "$(uname)" == "Darwin" ]]; then
  IDENTITIES=$(security find-identity -v -p codesigning 2>/dev/null | grep -c "Developer ID" || true)
  if [[ "$IDENTITIES" -eq 0 ]]; then
    fail "No 'Developer ID' code-signing identity found — signing will fail. Check Keychain or switch machines."
  fi
  ok "Code-signing: $IDENTITIES Developer ID identity/identities found"

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
if [[ -z "${GH_TOKEN:-}" ]]; then
  fail "GH_TOKEN is not set — electron-builder cannot publish to GitHub"
fi
ok "GH_TOKEN present"

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
