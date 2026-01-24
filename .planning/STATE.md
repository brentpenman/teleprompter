# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-24)

**Core value:** The teleprompter follows YOU, not the other way around.
**Current focus:** v1.1 Following-Along Rewrite

## Current Position

Phase: 7 - ScrollController COMPLETE ✓
Plan: All plans complete, verified
Status: Ready for Phase 8
Last activity: 2026-01-24 - Phase 7 verified (6/6 must-haves)

Progress: [███████░░░] 75% (3/4 phases complete for v1.1)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans executed | 8 |
| Plans passed first try | 8 |
| Verifications passed | 8 |
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

### Decisions from 06-01

| Decision | Rationale |
|----------|-----------|
| Position 0 match from initial state is hold | Must be strictly forward to advance (>0 not >=0) |
| Same position match is hold | No lateral movement, only forward advancement |
| Null/undefined candidates return hold | Graceful handling prevents crashes |
| Default confidenceThreshold: 0.7 | Matches v1.1 design principle of conservative forward movement |
| Default nearbyThreshold: 10 | Reasonable default for Phase 1, skip detection uses this in 06-02 |

### Decisions from 06-02

| Decision | Rationale |
|----------|-----------|
| Small skip (10-50 words) requires 4 consecutive matches | Balances responsiveness with safety for moderate skips |
| Large skip (50+ words) requires 5 consecutive matches | Extra confirmation for significant jumps prevents false positives |
| Consecutive gap tolerance of 2 words | Allows for filler word filtering without breaking streaks |
| Reset streak on nearby advance | Prevents false carry-over from previous skip exploration |
| Distance calculated from confirmedPosition | Ensures skip detection is relative to stable floor position |

### Decisions from 07-01

| Decision | Rationale |
|----------|-----------|
| lastPositionTime uses -1 as sentinel | Allows timestamp 0 to be valid (first call establishes baseline) |
| Frame-rate tolerance of 10% | Floating point and frame timing cause small differences |
| Skip threshold of 10 words | Matches PositionTracker nearbyThreshold default |
| EMA 70/30 weighting for pace | Balances responsiveness with smoothness |

### Decisions from 07-02

| Decision | Rationale |
|----------|-----------|
| Caret slider in debug overlay | Keeps main UI clean; wiring happens in Phase 8 |
| Default 33% caret position | Matches existing reading-marker position |
| Three tracking states | Covers all ScrollController states from 07-01 |

## Session Continuity

Last session: 2026-01-24
Stopped at: Phase 7 complete and verified
Resume file: .planning/ROADMAP.md

### Next Steps

1. `/gsd:plan-phase 8` - Plan Integration phase
2. Execute Phase 8 plans
3. Complete v1.1 milestone

---
*Updated: 2026-01-24 after Phase 7 verification*
