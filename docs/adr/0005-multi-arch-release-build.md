# 0005. Build both macOS arches in one invocation and fetch both SQLCipher prebuilts

Date: 2026-06-10  
Status: Accepted

---

## Context

v1.2.4 shipped a build that **crashed on launch on every Mac** with:

```
Cannot find module '…/@journeyapps/sqlcipher/lib/binding/napi-v6-darwin-x64/node_sqlite3.node'
```

Post-mortem (artifacts inspected directly off the GitHub Release):

- The published `Cinder-1.2.4.dmg` / `-mac.zip` was an **x86_64** app, but the
  only native binding bundled was `napi-v6-darwin-arm64`. The x64 app had no
  x64 binding, so it died the moment it required SQLCipher. (Apple Silicon
  users ran the x64 build under Rosetta — `process.arch === 'x64'` — and hit
  the identical crash.)

Two independent defects combined to produce this:

1. **Wrong-arch binding.** GitHub's `macos-latest` runner is now **arm64**.
   `npm ci` fetches only the arm64 SQLCipher prebuilt. electron-builder's
   `@electron/rebuild` does not cross-fetch node-pre-gyp prebuilts for a
   different target arch, so the `--x64` build packaged the arm64 binding it
   found in `node_modules` into an x64 app.

2. **Artifact + update-feed overwrite.** The workflow built each arch in a
   *separate* `electron-builder` invocation. Each emitted identically-named
   artifacts (`Cinder-<ver>.dmg`, `Cinder-<ver>-mac.zip`) **and its own
   `latest-mac.yml`**. The second invocation's upload overwrote the first on
   the Release, so the published feed described only one arch. (This was a
   regression from an earlier change that split the build into two sequential
   `--publish always` steps to dodge a parallel-create `422 already_exists`
   race — it traded the race for a silent overwrite.)

The fix had to guarantee (a) each arch app contains its own binding and (b) a
single `latest-mac.yml` correctly describes both arches, without re-introducing
the 422 race.

## Decision

**One build, both arches; explicit prebuilt fetch; decoupled publish.**

1. **Fetch both prebuilts after `npm ci`**, before packaging:
   ```sh
   cd node_modules/@journeyapps/sqlcipher
   npx node-pre-gyp install --target_arch=arm64 --target_platform=darwin
   npx node-pre-gyp install --target_arch=x64   --target_platform=darwin
   ```
   Both `napi-v6-darwin-arm64` and `napi-v6-darwin-x64` bindings are then
   present. Each arch app bundles both; SQLCipher's loader resolves
   `napi-v6-darwin-${process.arch}` at runtime, so every app finds its own.

2. **Build both arches in a single invocation** with arch-suffixed names:
   ```sh
   npx electron-builder --mac --x64 --arm64 --publish never
   ```
   `electron-builder.yml` sets `mac.artifactName:
   ${productName}-${version}-${arch}.${ext}`, yielding distinct
   `Cinder-<ver>-x64.{dmg,zip}` / `-arm64.{dmg,zip}` and **one combined
   `latest-mac.yml`** listing all four files.

3. **Publish in one `gh` call** (idempotent on re-run):
   ```sh
   gh release create "$TAG" --title "${TAG#v}" --generate-notes \
     dist/Cinder-*.dmg dist/Cinder-*.zip dist/Cinder-*.blockmap dist/latest-mac.yml
   ```
   Because nothing publishes during the build, there is no parallel
   release-create and therefore no 422.

Verified locally before shipping: a `--publish never` dual-arch build on the
arm64 dev machine produced arch-suffixed artifacts, a combined `latest-mac.yml`
with both arch entries, an x64 app carrying the `x86_64` binding, and an arm64
app carrying the `arm64` binding.

## Alternatives considered

| Option | Why not chosen |
|--------|---------------|
| Universal build (`--mac --universal`) | Simplest single artifact, but the same x64-prebuilt fetch is still required, and the lipo/`@electron/universal` merge of native modules adds a failure mode under production-down pressure. Per-arch is the better-understood path here. Reconsider later for UX. |
| Two sequential `--publish always` steps (the prior approach) | This *is* the code that shipped v1.2.4 broken — separate invocations overwrite each other's artifacts and `latest-mac.yml`. |
| Single dual-arch `--publish always` + pre-created draft release | Avoids the 422 by pre-creating the release, but still leans on electron-builder's GitHub publisher reuse semantics. `--publish never` + `gh` is more controllable and removes the publisher from the equation. |
| Build each arch on its own native runner (matrix) | Correct, but needs a separate job to merge two `latest-mac.yml` files and coordinate one Release. More moving parts than fetching the x64 prebuilt cross-arch, which works fine. |
| Drop x64; ship arm64-only | The crash report came from an x64 process — there is at least one Intel/Rosetta user. Not acceptable to abandon. |

## Consequences

**Positive**
- x64 and arm64 builds each ship a working SQLCipher binding; the startup
  crash is fixed for both Intel and Apple Silicon.
- One combined `latest-mac.yml` → electron-updater serves the correct arch.
- No parallel-create race; publish is a single atomic `gh` call.

**Negative / watch points**
- The explicit prebuilt-fetch step is load-bearing. If `@journeyapps/sqlcipher`
  is upgraded, confirm both arch prebuilts still exist on its S3 host
  (`https://journeyapps-node-binary.s3.amazonaws.com`) for the new version and
  napi level; otherwise the x64 fetch fails and the build aborts (loud, not
  silent — acceptable).
- If the napi build version changes (currently `napi-v6`), the binding path
  changes; the runtime symptom would again be `Cannot find module …`.

**Neutral**
- Artifact filenames changed from `Cinder-<ver>.dmg` to
  `Cinder-<ver>-<arch>.dmg`. Download links in any external docs should point
  at the Releases page rather than a hard-coded asset name.
- v1.2.4's broken assets remain on its Release; shipping v1.2.5 moves the
  update feed forward so existing installs upgrade to a working build.
