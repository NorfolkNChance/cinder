# Security Review: Cinder

**Date:** May 18, 2026
**Status:** Historical record — all findings resolved (see CLAUDE.md "Known gotchas").

## 🛡️ Core Strengths

This security code review reveals an exceptionally high standard of security awareness. The project correctly implements multiple layers of defense-in-depth, specifically tailored for Electron's unique threat model.

1. **Process Isolation & Sandboxing:**
   - `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` are enforced. This is the "gold standard" for Electron security, ensuring that even a compromised renderer cannot directly access Node.js primitives.
2. **Strict IPC Discipline:**
   - The use of a dedicated `ipc-guard.ts` with `assertMainFrame` is excellent. It prevents "IPC-from-iframe" attacks, where a malicious third-party site embedded in an iframe could attempt to trigger privileged IPC handlers.
   - Payload validation via **Zod** ensures that the main process never trusts raw input from the renderer.
3. **Encrypted Data Storage:**
   - The project uses **SQLCipher** for the database.
   - Crucially, the encryption key is protected using Electron's `safeStorage` API (which uses OS-level encryption like macOS Keychain). The key is never stored in plaintext on disk.
4. **Strict Content Security Policy (CSP):**
   - The CSP is set via headers in the main process, which is more secure than `<meta>` tags. It correctly blocks `object-src`, `base-uri`, and limits `script-src` to `'self'`.
5. **Secure External Navigation:**
   - `openExternalSafe` restricts outgoing links to the `https:` protocol only, preventing common attacks using `file:`, `javascript:`, or `data:` URIs.
   - Navigation and redirection are restricted at the `WebContents` level.

---

## 🔍 Identified Vulnerabilities & Recommendations

### 1. Weak URL Validation in Navigation Guards (High Priority)
In `src/main/index.ts`, the `will-navigate` and `will-redirect` handlers use `.startsWith()` to validate URLs. This can be bypassed.
* **Vulnerability:** A URL like `http://localhost:5173@evil.com` will pass the `.startsWith('http://localhost:5173')` check but navigate to `evil.com` due to basic auth syntax parsing. Furthermore, in production, `file:///path/to/index.html/../../etc/passwd` would pass a `startsWith` check against the app's base path but resolve to a different location.
* **Recommendation:** Compare the `origin` and `pathname` using the standard `URL` API.

  ```typescript
  // Instead of url.startsWith(appUrl)
  try {
    const parsedUrl = new URL(url);
    const parsedAppUrl = new URL(appUrl);
    if (parsedUrl.origin !== parsedAppUrl.origin || parsedUrl.pathname !== parsedAppUrl.pathname) {
      event.preventDefault();
    }
  } catch {
    event.preventDefault(); // Block if URL parsing fails
  }
  ```

### 2. Database Key Decryption Failure Handling (Medium Priority)
In `src/main/db/index.ts`, `getOrCreateDbKey()` calls `safeStorage.decryptString(encryptedBlob)`.
* **Issue:** If the OS keychain becomes inaccessible (e.g., user changed their password, migrated to a new machine without a full backup, or the entry was deleted), this call will throw an unhandled exception. Currently, this would likely cause the app to crash or hang during `initDb()`.
* **Recommendation:** Wrap the decryption in a try-catch block. If it fails, the application should handle the error gracefully, potentially providing a clear error to the user or offering a "reset database" flow (since the existing encrypted data is unrecoverable without the key).

### 3. Non-standard CSP Scheme (Low Priority)
In `src/main/security/csp.ts`, the `img-src` directive includes the `attachment:` scheme.
* **Issue:** `attachment:` is not a standard URI scheme recognized by web browsers. Unless a custom protocol handler with this name is registered in Electron, this is likely a typo or a remnant of a different design.
* **Recommendation:** Verify if `attachment:` is intended to be used. If not, remove it to keep the CSP as strict as possible.

### 4. Discrepancy between Documentation and Implementation (Code Quality)
* **Issue:** `CLAUDE.md` states the database engine is `better-sqlite3-multiple-ciphers`, but `package.json` and `src/main/db/index.ts` actively use `@journeyapps/sqlcipher`.
* **Recommendation:** Update `CLAUDE.md` to reflect the actual usage of the `@journeyapps/sqlcipher` (async/callback-based) driver to avoid confusion for future developers regarding the API surface.

---

## 📝 Summary for Production Readiness
This project is very close to being "hardened" for production. Aside from the `startsWith` URL parsing bypass, the architectural decisions and implementations are top-tier. The use of macOS Hardened Runtime and Entitlements is correctly configured with minimal permissions, further reducing the overall attack surface.
