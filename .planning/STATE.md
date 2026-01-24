# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-24)

**Core value:** The teleprompter follows YOU, not the other way around.
**Current focus:** v1.1 Following-Along Rewrite

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-01-24 — Milestone v1.1 started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions

**v1.1 Design Principles (from questioning):**
1. Next words to speak always at caret (fixed position)
2. Scroll is reactive to confirmed speech, not predictive
3. Strong positional bias — prefer nearby matches over distant
4. Conservative forward movement — never scroll ahead of confirmed position
5. Skip detection requires consecutive-word confirmation before jumping
6. Off-script: hold position, scroll back if display got ahead
7. Fuzzy matching for paraphrasing, but with positional context
8. Scroll speed derived from speech pace, not a separate parameter

**What to preserve from v1.0:**
- Smooth scroll animation mechanics
- Visual highlighting

**What to rewrite:**
- All position-tracking and scroll decision logic

### Pending Todos

None — starting fresh milestone.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-24
Stopped at: Defining requirements
Resume file: None

### Next Steps

Currently in `/gsd:new-milestone` flow.

---
*Updated: 2026-01-24 after v1.1 milestone start*
