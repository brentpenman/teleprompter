# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-24)

**Core value:** The teleprompter follows YOU, not the other way around.
**Current focus:** v1.1 Following-Along Rewrite

## Current Position

Phase: 5 - WordMatcher COMPLETE ✓
Plan: All plans complete, verified
Status: Ready for Phase 6
Last activity: 2026-01-24 - Phase 5 verified (10/10 must-haves)

Progress: [███░░░░░░░] 25% (1/4 phases complete for v1.1)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans executed | 2 |
| Plans passed first try | 2 |
| Verifications passed | 2 |
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

### Blockers/Concerns

None.

### Decisions from 05-01

| Decision | Rationale |
|----------|-----------|
| Distance weighting formula: `matchQuality * (1 - distanceWeight * distancePenalty)` | Linear penalty is simple to understand and tune |
| Jest with ES modules (--experimental-vm-modules) | Standard test framework, works with ES modules |
| distanceWeight default: 0.3 | 30% weight to position gives good balance |

### Decisions from 05-02

| Decision | Rationale |
|----------|-----------|
| Clamp currentPosition before calculating search bounds | Prevents searchStart/searchEnd from going negative or exceeding script length |
| Track character offsets via linear scan in createMatcher | Simple O(n) approach that matches tokenization order; enables direct CSS Custom Highlight API usage |

## Session Continuity

Last session: 2026-01-24
Stopped at: Phase 5 complete and verified
Resume file: .planning/ROADMAP.md

### Next Steps

1. `/gsd:plan-phase 6` - Plan PositionTracker phase
2. Execute Phase 6 plans
3. Continue through Phases 7-8

---
*Updated: 2026-01-24 after Phase 5 verification*
