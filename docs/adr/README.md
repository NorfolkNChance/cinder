# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Cinder project.

An ADR captures a significant decision: what was decided, why, what alternatives were considered, and what the consequences are. They are written at decision time and are never deleted — superseded records are marked as such and link to the replacing record.

## Format

Each ADR is a markdown file named `NNNN-short-title.md` with the following structure:

```
# NNNN. Title

Date: YYYY-MM-DD  
Status: Proposed | Accepted | Deprecated | Superseded by [NNNN](NNNN-...)

## Context
## Decision
## Alternatives considered
## Consequences
```

## Index

| # | Title | Status |
|---|-------|--------|
| [0001](0001-sqlcipher-binding.md) | SQLCipher binding: `@journeyapps/sqlcipher` | Accepted |
| [0002](0002-triage-queue-for-note-captured-tasks.md) | Triage queue for note-captured tasks | Accepted |
| [0003](0003-capture-window-url-query-param.md) | Shared renderer bundle for capture popup via `?mode=capture` | Accepted |
| [0004](0004-vault-root-authorization-allowlist.md) | Authorize vault roots via a session allowlist, not a persisted path | Accepted |
| [0005](0005-multi-arch-release-build.md) | Build both macOS arches in one invocation and fetch both SQLCipher prebuilts | Accepted |
| [0006](0006-cross-domain-projects-and-note-task-links.md) | Make projects cross-domain (notes + tasks) and add note ↔ task links | Accepted |
| [0007](0007-embed-excalidraw-self-hosted-assets.md) | Embed Excalidraw via a self-hosted asset scheme under strict CSP | Accepted |
| [0008](0008-drawings-as-excalidraw-bodytype-notes.md) | Store drawings as notes with `bodyType: 'excalidraw'` | Accepted |
| [0009](0009-live-drawing-embeds-via-image-nodeview.md) | Live drawing embeds via a `drawing://` image NodeView | Accepted |
| [0010](0010-self-contained-markdown-export.md) | Self-contained markdown export via data-URI inlining | Accepted |
| [0011](0011-mcp-connector-in-main-process.md) | Run the MCP connector in the main process over loopback HTTP | Accepted |
| [0012](0012-application-and-in-document-search.md) | Application-wide search overlay (⌘⇧F) and in-document find (⌘F) | Accepted |
