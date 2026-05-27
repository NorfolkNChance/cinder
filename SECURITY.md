# Security Policy

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report privately via [GitHub Security Advisories](https://github.com/NorfolkNChance/cinder/security/advisories/new) — this keeps the details confidential until a fix is available.

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- The version(s) affected

You'll receive an acknowledgement within 48 hours. If a fix is warranted, a patched release will be issued and a CVE requested where appropriate. You'll be credited in the release notes unless you prefer otherwise.

## Scope

Cinder is a local-first macOS app — it stores all data on-device and makes no outbound connections except to GitHub for update checks. The primary security concerns are:

- **IPC boundary** — sandboxed renderer → main process communication
- **SQLCipher key handling** — AES-256 database key stored in the macOS Keychain via `safeStorage`
- **Content injection** — `dangerouslySetInnerHTML`, XSS via note content
- **Supply chain** — compromised dependencies in the npm graph

## Supported versions

Only the latest release receives security fixes.
