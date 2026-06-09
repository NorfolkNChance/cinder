# Security reviews

Historical security audit records for Cinder. These are point-in-time
snapshots — **all findings have since been resolved** and the resulting
invariants are captured under "Known gotchas" and "Security rules" in
[`CLAUDE.md`](../../CLAUDE.md). The live security policy lives in
[`SECURITY.md`](../../SECURITY.md) at the repo root.

| Date | Document | Evaluator | Notes |
|------|----------|-----------|-------|
| 2026-05-18 | [Security Review](2026-05-18-security-review.md) | Internal | Foundational hardening review — process isolation, IPC, CSP, SQLCipher |
| 2026-05-26 | [Security Evaluation Report](2026-05-26-security-evaluation.md) | Gemini CLI | Flagged the `will-navigate` startsWith bypass and `safeStorage` decryption handling — both fixed |
