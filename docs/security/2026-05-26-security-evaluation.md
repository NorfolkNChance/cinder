# Security Evaluation Report: Nexus (Cinder)

**Date:** May 26, 2026
**Status:** Completed
**Evaluator:** Gemini CLI

---

## 1. Executive Summary

This security evaluation provides a comprehensive review of the Nexus (Cinder) codebase, an Electron-based application designed with security as a foundational principle. The application demonstrates an exceptionally high standard of security engineering, particularly in its implementation of defense-in-depth strategies tailored for the Electron platform.

While the core architecture is robust, several specific vulnerabilities and inconsistencies were identified. The most significant concern is a potential bypass in navigation guards, which could allow a compromised renderer to navigate to unauthorized origins.

---

## 2. Architecture Overview

Nexus follows a strict process isolation model to minimize the impact of a potential compromise in the renderer process.

| Process  | Trust Level | Responsibilities | Security Constraints |
|----------|-------------|------------------|----------------------|
| **Main** | Trusted | Database access, Keychain interaction, Filesystem, IPC management | Full system access; must validate all IPC input. |
| **Preload**| Bridge | Exposing a narrow, typed API to the renderer | No Node.js primitives exposed; `contextBridge` only. |
| **Renderer**| Untrusted | UI rendering, user interaction | Sandboxed; `nodeIntegration: false`; `contextIsolation: true`. |

### Key Security Controls
- **SQLCipher:** Encrypted SQLite database using AES-256.
- **SafeStorage:** Encryption of the database key using OS-level security (macOS Keychain).
- **Zod Validation:** All IPC payloads are strictly validated at the Main process boundary.
- **Strict CSP:** Content Security Policy enforced via headers to mitigate XSS and data exfiltration.

---

## 3. Security Strengths

The following implementations represent "best-in-class" security practices for Electron applications:

1.  **Process Hardening:** The application correctly enforces `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false` for all `BrowserWindow` instances.
2.  **IPC Discipline:** The use of a dedicated `ipc-guard.ts` to assert that calls originate from the main frame (`assertMainFrame`) prevents IPC-from-iframe attacks.
3.  **Encrypted Storage:** The database key is never stored in plaintext on disk; it is protected by the `safeStorage` API, ensuring that access requires valid OS-level credentials.
4.  **Secure Protocols:** The `attachment:` protocol is implemented with robust path validation, including checks for UUID formats, filename sanitization, and `realpath` resolution to prevent symlink escapes.
5.  **Safe External Links:** Outgoing links are restricted to `https:` only via a central `openExternalSafe` utility, preventing URI-based attacks.

---

## 4. Findings & Recommendations

### 4.1 High Priority: URL Validation Bypass in Navigation Guards

**Location:** `src/main/index.ts` (`will-navigate` and `will-redirect` handlers)

**Finding:**
The navigation and redirect guards use `.startsWith(appUrl)` to validate outgoing URLs. This check is insufficient and can be bypassed.
*   **Bypass Example:** A URL like `http://localhost:5173@evil.com` will pass the `.startsWith('http://localhost:5173')` check but navigate to `evil.com` due to basic auth syntax parsing.
*   **Risk:** A compromised renderer could trick the app into navigating to a malicious site, potentially leading to phishing or credential theft.

**Recommendation:**
Use the standard `URL` API to compare origins and pathnames instead of string prefix matching.

```typescript
// Recommended Implementation
contents.on('will-navigate', (event, url) => {
  try {
    const parsedUrl = new URL(url);
    const parsedAppUrl = new URL(appUrl);
    if (parsedUrl.origin !== parsedAppUrl.origin || parsedUrl.pathname !== parsedAppUrl.pathname) {
      event.preventDefault();
    }
  } catch {
    event.preventDefault(); // Block if URL parsing fails
  }
});
```

### 4.2 Medium Priority: Unhandled `safeStorage` Decryption Failures

**Location:** `src/main/db/index.ts` (`getOrCreateDbKey` function)

**Finding:**
The application calls `safeStorage.decryptString(encryptedBlob)` without a try-catch block.
*   **Issue:** If the OS keychain becomes inaccessible (e.g., password change, data migration, or deletion of the keychain entry), this call will throw an unhandled exception.
*   **Risk:** The application will crash or hang during initialization.

**Recommendation:**
Wrap the decryption in a try-catch block and handle failures gracefully. The app should either prompt the user or offer a way to reset the database (since data is unrecoverable without the key).

### 4.3 Low Priority: Documentation and Implementation Discrepancy

**Location:** `CLAUDE.md` vs `package.json` / `src/main/db/index.ts`

**Finding:**
`CLAUDE.md` states the database engine is `better-sqlite3-multiple-ciphers` and implies a synchronous API. However, the implementation uses `@journeyapps/sqlcipher`, which is an asynchronous, callback-based driver.
*   **Risk:** Developer confusion and potential bugs if a developer assumes a synchronous API based on the documentation.

**Recommendation:**
Update `CLAUDE.md` and any other architectural documentation to accurately reflect the use of `@journeyapps/sqlcipher`.

### 4.4 Low Priority: Content Security Policy (CSP) Clarification

**Location:** `src/main/security/csp.ts`

**Finding:**
The CSP includes the `attachment:` scheme in `img-src`.
*   **Analysis:** While non-standard, this is correctly used in conjunction with the custom `attachment:` protocol registered in the app. However, ensure that no other non-standard schemes are added without similar rigorous validation.

---

## 5. Conclusion

Nexus (Cinder) exhibits a strong security posture. The vulnerabilities identified are "last-mile" refinements to an otherwise excellent security architecture. Addressing the navigation guard bypass and improving error handling for database decryption will ensure the application meets the highest standards for production readiness.

Regular dependency audits and continued adherence to the established IPC and process isolation patterns are recommended as the project moves into feature development.
