# CI/CD setup — GitHub Actions

This document describes how to set up the Phase 0 CI/CD pipeline on GitHub for Cinder. Goals, in order:

1. **PR checks** — every pull request runs typecheck, lint, build, and tests.
2. **Release pipeline** — pushing a `v*` tag builds signed per-arch (x64 + arm64) macOS DMGs + zips, notarises them through Apple's `notarytool`, and uploads the artefacts (per-arch DMG/zip + a single combined `latest-mac.yml` for `electron-updater`) to a GitHub Release.

This closes the "Code signing and notarization green end-to-end in CI" Phase 0 deliverable (see [ARCHITECTURE.md §8](../ARCHITECTURE.md) and §3.7).

> **The canonical release workflow is [`.github/workflows/release.yml`](../.github/workflows/release.yml)** — it has evolved well past the Phase-0 sketch below (CI gate, explicit SQLCipher prebuilt fetch, single dual-arch build, decoupled `gh` publish). Read it and [ADR-0005](adr/0005-multi-arch-release-build.md) before changing the release pipeline; the snippet in §3.2 is illustrative, not current.

---

## 1. Prerequisites (one-time)

### 1.1 Apple Developer Program membership

You need an active **Apple Developer Program** account ($99/year). Hobbyist/free accounts cannot issue Developer ID certificates and cannot notarise.

Sign up at <https://developer.apple.com/programs/>.

### 1.2 Developer ID Application certificate

This is the certificate used to sign the app for distribution **outside** the Mac App Store.

On a Mac with Xcode installed:

1. Open **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority…**
   - Email: your Apple ID
   - Common Name: `Cinder Developer ID`
   - "Saved to disk"
   - Save the resulting `.certSigningRequest` file
2. Go to <https://developer.apple.com/account/resources/certificates/list>, click **+**, choose **Developer ID Application**, upload the `.certSigningRequest`, download the resulting `.cer` file
3. Double-click the `.cer` to install it into your keychain
4. In Keychain Access, find the new "Developer ID Application: Your Name (TEAMID)" entry, right-click → **Export…**, save as `cinder-developer-id.p12`, set a strong export password (you will need this later)

### 1.3 App-specific password for notarisation

`notarytool` authenticates with an app-specific password, not your Apple ID password.

1. Go to <https://appleid.apple.com> → Sign-In and Security → App-Specific Passwords
2. Generate one labelled `Cinder CI notarisation`
3. Save the password (it is shown once)

### 1.4 Find your Team ID

<https://developer.apple.com/account> → Membership Details → Team ID (10-character alphanumeric, e.g. `A1B2C3D4E5`).

---

## 2. GitHub repository secrets

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**. Add the following.

| Secret name | Value | Where it comes from |
|-------------|-------|----------------------|
| `CSC_LINK` | Base64-encoded `.p12` certificate | `base64 -i cinder-developer-id.p12 \| pbcopy` then paste |
| `CSC_KEY_PASSWORD` | The export password you set on the `.p12` | Step 1.2 |
| `APPLE_ID` | Your Apple ID email | — |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password | Step 1.3 |
| `APPLE_TEAM_ID` | 10-char Team ID | Step 1.4 |

> **Security note:** these are the highest-trust secrets in the project. Treat the `.p12` file as if it were a private key (because it is). Delete the local copy from disk once it is in GitHub. Rotate the cert if it ever leaves your control.

For a future protected-branch policy, consider scoping these to a **deployment environment** named `release` and requiring manual approval before they are made available to a workflow run.

---

## 3. Workflow files

Create the following two files. Workflow YAML lives under `.github/workflows/`.

### 3.1 `.github/workflows/ci.yml` — PR and push checks

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  validate:
    runs-on: macos-latest    # arm64 by default on macos-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      # Python is required by node-gyp when prebuilt binaries are
      # unavailable for @journeyapps/sqlcipher's transitive native deps.
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build (no signing)
        env:
          CSC_IDENTITY_AUTO_DISCOVERY: false   # skip signing for PR builds
        run: npm run build
```

Notes:

- We deliberately **do not sign on PR builds**. The signing secrets are not exposed to forks (which is the right default), and we do not need a signed binary to verify the build succeeds.
- `CSC_IDENTITY_AUTO_DISCOVERY: false` tells `electron-builder` not to try to sign — without it, it errors when no cert is found.
- `npm ci` (rather than `npm install`) is the correct CI install command. It is faster, fails on lockfile drift, and never mutates the lockfile.

### 3.2 `.github/workflows/release.yml` — signed + notarised releases

```yaml
name: Release

on:
  push:
    tags: ['v*.*.*']

permissions:
  contents: write   # required to create a GitHub Release and upload assets

jobs:
  release:
    runs-on: macos-latest
    timeout-minutes: 45
    environment: release   # optional: gate on manual approval
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Build, sign, notarise and publish
        env:
          # Signing — picked up automatically by electron-builder
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          # Notarisation — consumed by scripts/notarize.js
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx electron-builder --mac --arm64 --x64 --publish always
```

> ⚠️ **The snippet above is the original Phase-0 sketch and is NOT how releases run today.** The live workflow differs in three load-bearing ways (see `release.yml` + ADR-0005):
> 1. **Fetch both SQLCipher prebuilts after `npm ci`** — `macos-latest` is arm64, so without an explicit `node-pre-gyp install --target_arch=x64` the x64 build ships the wrong-arch native binding and crashes on launch (this was the v1.2.4 outage).
> 2. **One dual-arch build, decoupled publish** — `electron-builder --mac --x64 --arm64 --publish never` (single invocation → one combined `latest-mac.yml`, arch-suffixed artifacts), then a single `gh release` upload. `--publish always` with both arches races to create the Release and 422s.
> 3. **CI gate** — the release waits for the `validate` CI job to pass on the tagged commit before building.

Notes:

- `secrets.GITHUB_TOKEN` is automatically provisioned by GitHub Actions for the workflow run; it has just enough scope to create releases in the same repo.
- The `environment: release` line is optional. If set, configure a protected environment in **Settings → Environments → New environment → release** with required reviewers — this gives you a manual approval step before secrets are released to the run. Recommended for the first few releases until you trust the pipeline.

### 3.3 Install `@electron/notarize`

The `scripts/notarize.js` script in the repo references `@electron/notarize` but the package is not yet a devDependency. Add it before the first release:

```sh
npm install -D @electron/notarize
```

---

## 4. Release process

Day-to-day flow once the pipelines are wired up:

```sh
# 1. Update the version in package.json (semver — patch / minor / major)
npm version patch    # or minor / major

# This creates a commit + tag like v0.1.1.

# 2. Push the tag (and the version-bump commit)
git push origin main --follow-tags

# 3. Watch the Release workflow in GitHub Actions.
#    On success you'll have a draft GitHub Release with:
#    - Cinder-<version>-universal.dmg
#    - latest-mac.yml (electron-updater manifest)
#    - Cinder-<version>-universal-mac.zip (used by auto-update)
#    - .blockmap files
#
# 4. Edit the release notes and publish.
```

Verification of the first release:

1. Download the DMG from the release page on a Mac that has **never run Cinder before**.
2. Open it — macOS Gatekeeper should let it run without warning. If you see "Cinder cannot be opened because the developer cannot be verified", notarisation didn't stick. Run `spctl --assess --verbose=4 /Applications/Cinder.app` to diagnose.
3. Run `codesign -dv --verbose=4 /Applications/Cinder.app` and confirm `Authority=Developer ID Application: Your Name (TEAMID)`.
4. Run `xcrun stapler validate /Applications/Cinder.app` — should report "The validate action worked!".

---

## 5. Auto-update channel — open decision

ARCHITECTURE.md §10 lists update channel hosting as an open question (private S3 + CloudFront vs. a managed service). The release pipeline above uses **GitHub Releases** as the update channel, which:

- Works out of the box with `electron-updater` via the `repository` field in `package.json` or `electron-builder.yml`.
- Is free.
- Tightly couples updates to a public-ish artefact host.

If you want a private channel (e.g. you don't want unreleased binaries publicly downloadable from your GitHub repo), the alternative is publishing to a private S3 bucket (`provider: s3` in `electron-builder.yml`) and exposing it via CloudFront, or using a managed service like Hazel or Nuts.

This is a decision to make before shipping a public release. For Phase 0 sign-off, using GitHub Releases is fine — it proves the end-to-end signing/notarisation works, which is the point.

---

## 6. Validating the Phase 0 deliverable

To call the "code signing and notarization green end-to-end in CI" deliverable done, you need:

- [ ] All five repository secrets configured
- [ ] `.github/workflows/ci.yml` merged and green on a PR
- [ ] `.github/workflows/release.yml` merged
- [ ] `@electron/notarize` installed
- [ ] A `v0.1.0` tag pushed and the Release workflow completed green
- [ ] The resulting DMG downloaded onto a fresh Mac, opened without Gatekeeper warning
- [ ] `xcrun stapler validate` passes against the installed `.app`

Once those six items check out, the security review gate is the only remaining Phase 0 blocker.

---

## 7. Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `Could not find any certificates with name "Developer ID Application"` | `CSC_LINK` not set, or `.p12` doesn't contain the Developer ID Application cert (you may have exported the wrong identity from Keychain) |
| `notarytool` returns `Invalid` with no details | Run `xcrun notarytool log <submission-id> --apple-id … --team-id … --password …` to fetch the detailed log; usually it's an unsigned helper binary or a missing entitlement |
| Hardened runtime errors at launch (`Killed: 9`) | An entitlement is missing in `build/entitlements.mac.plist`. The current entitlements deliberately deny JIT and library validation — if a future dep needs one of those, weigh the trade-off carefully before adding it |
| Build fails on macOS runner during `npm ci` with native module errors | `actions/setup-python` step missing, or the Python version doesn't include `distutils` (Python 3.12 dropped it; node-gyp uses `setuptools` instead — should be auto-installed but check) |
| GitHub Release is created but the DMG is missing the `latest-mac.yml` | The `--publish always` flag was dropped. Without it, `electron-builder` produces the DMG locally but doesn't upload the auto-update manifest |
