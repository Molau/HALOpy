# HALOpy Project — Copilot Instructions

This document provides workflow guidance for GitHub Copilot when working on HALOpy.

---

## Documentation Hierarchy

### Tier 1: HALOpy Codebase — AUTHORITATIVE SOURCE
- **Location**: `src/halo/`, `static/js/`, `templates/`, `resources/`
- **Authority**: PRIMARY — this is the living, authoritative implementation
- **Usage**: Always check existing code first before implementing anything

### Tier 2: copilot-context.md — Architecture & Decisions
- **Location**: `.github/copilot-context.md`
- **Authority**: HIGH — team decisions and coding standards
- **Usage**: Reference for understanding WHY things are implemented a certain way
- **Status**: Requires explicit approval before adding new decisions

### Tier 3: HALO_DATA_FORMAT.md — Data Standard (FIXED)
- **Location**: `docs/HALO_DATA_FORMAT.md`
- **Authority**: FIXED — community standard, NOT changeable
- **Content**: Observation record format (HALO key), field definitions, validation rules

### Historical: Pascal Source Code (ARCHIVED)
- **Location**: `c:\ASTRO\HALO\QUELLEN\*.PAS`
- **Status**: Migration completed. Use only for understanding original design decisions when needed.

---

## Core Principles

### 1. Code Reuse and DRY
- ALWAYS reuse existing code, data structures, and patterns
- Before implementing, search for similar existing code
- Reuse: alerts/dialogs, constants, functions, UI components, API patterns
- Use i18n strings for all user-visible text — never hardcode
- Never hardcode data that exists in i18n files

### 2. Data Integrity
- The HALO key observation record format is a community standard — it cannot be changed
- Maintain validation rules and field dependencies per HALO_DATA_FORMAT.md

### 3. Consistency
- Follow existing HALOpy code patterns and conventions
- Match established UI patterns (modals, buttons, notifications)
- Use existing utility functions rather than creating new ones

### 4. Controlled Evolution
- New features or architectural changes require explicit approval
- All approved decisions are documented in copilot-context.md

---

## Copilot Workflow

### When Starting a Task

1. **Check existing HALOpy implementation first**
   - How does HALOpy currently handle this?
   - Location: `src/halo/`, `static/js/`, `templates/`

2. **Search for existing code to reuse**
   - Similar functionality, patterns, components, i18n strings

3. **Check copilot-context.md** for relevant decisions

4. **When asked about specific UI text**: Search i18n files (`resources/strings_de.json`, `resources/strings_en.json`) first to find the key, then search code using that key

### During Implementation

1. Never update copilot-context.md without explicit user approval
2. Reuse existing patterns — don't reinvent dialogs, validations, formatters
3. Follow existing code style in HALOpy
4. All user-visible text must use i18n
5. **ALWAYS use VS Code editor tools** (`replace_string_in_file`, `create_file`, `multi_replace_string_in_file`) for file changes — never write files via Python scripts or terminal commands. The user needs to see inline diffs in the editor.

### When Making Changes

**Bug fixes and UI tweaks**: Update code directly, no approval needed.

**New features or architectural changes**: Explain what changes and why, get explicit approval, document in copilot-context.md.

---

## Quick Reference

### Where to look for...

- **Current implementation** → `src/halo/`, `static/js/`, `templates/`
- **Data format & validation** → `docs/HALO_DATA_FORMAT.md`
- **Architecture decisions** → `.github/copilot-context.md`
- **UI text (DE/EN)** → `resources/strings_de.json`, `resources/strings_en.json`
- **Original Pascal design (historical)** → `HALO\QUELLEN\*.PAS`

### Common Questions

**Q: Should I create a new modal or reuse existing?**
A: Always reuse existing patterns. Check `showWarningModal()`, Bootstrap modal patterns.

**Q: Can I add a new feature?**
A: Only with explicit approval. Propose with rationale first.

**Q: User mentions a specific UI text?**
A: Search i18n files for the actual text to find the key, then search code using that key. Don't guess function names.

**Q: Can I update copilot-context.md?**
A: Only with explicit approval. Propose the change and wait for approval.

---

*Last updated: 2026-03-08*
