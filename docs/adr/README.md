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
