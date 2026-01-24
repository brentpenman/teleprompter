# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-24)

**Core value:** The teleprompter follows YOU, not the other way around.
**Current focus:** v1.1 Following-Along Rewrite

## Current Position

Phase: 5 - WordMatcher (1 of 2 plans complete)
Plan: 05-01 complete, 05-02 pending
Status: In progress
Last activity: 2026-01-24 - Completed 05-01-PLAN.md (WordMatcher core)

Progress: [██░░░░░░░░] 12.5% (1/8 plans complete for v1.1)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans executed | 1 |
| Plans passed first try | 1 |
| Verifications passed | 1 |
| Blockers hit | 0 |

## Accumulated Context

### Decisions

**v1.1 Design Principles (from questioning):**
1. Next words to speak always at caret (fixed position)
2. Scroll is reactive to confirmed speech, not predictive
3. Strong positional bias - prefer nearby matches over distant
4. Conservative forward movement - never scroll ahead of confirmed position
5. Skip detection requires consecutive-word confirmation before jumping
6. Off-script: hold position, scroll back if display got ahead
7. Fuzzy matching for paraphrasing, but with positional context
8. Scroll speed derived from speech pace, not a separate parameter

**Architecture (from research):**
- Pipeline: SpeechRecognizer -> WordMatcher -> PositionTracker -> ScrollController
- WordMatcher: stateless pure function
- PositionTracker: owns confirmedPosition as single source of truth
- ScrollController: purely reactive to position events

**What to preserve from v1.0:**
- Smooth scroll animation mechanics
- Visual highlighting (CSS Custom Highlight API)
- SpeechRecognizer, AudioVisualizer
- Fuse.js for fuzzy matching

**What to rewrite:**
- TextMatcher -> WordMatcher (make stateless)
- ScrollSync -> PositionTracker + ScrollController (split concerns)
- Remove ConfidenceLevel.js (absorbed into PositionTracker)

### Pending Todos

- Execute 05-02-PLAN.md (edge cases, character offsets, JSDoc types)

### Blockers/Concerns

None.

### Decisions from 05-01

| Decision | Rationale |
|----------|-----------|
| Distance weighting formula: `matchQuality * (1 - distanceWeight * distancePenalty)` | Linear penalty is simple to understand and tune |
| Jest with ES modules (--experimental-vm-modules) | Standard test framework, works with ES modules |
| distanceWeight default: 0.3 | 30% weight to position gives good balance |

## Session Continuity

Last session: 2026-01-24 16:42 UTC
Stopped at: Completed 05-01-PLAN.md
Resume file: .planning/phases/05-wordmatcher/05-02-PLAN.md

### Next Steps

1. Execute 05-02-PLAN.md (edge cases, character offsets, JSDoc)
2. Execute Phase 6 plans (PositionTracker)
3. Continue through Phases 7-8

---
*Updated: 2026-01-24 after 05-01 completion*
