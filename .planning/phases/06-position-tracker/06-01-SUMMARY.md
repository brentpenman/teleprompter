---
phase: 06-position-tracker
plan: 01
subsystem: matching
tags: [position-tracking, stateful, monotonic, tdd]

# Dependency graph
requires:
  - phase: 05-word-matcher
    provides: MatchCandidate type for processMatch input
provides:
  - PositionTracker class with two-position model
  - Monotonic forward movement constraint
  - Confidence-based position confirmation
  - getScrollBoundary for external scroll code
affects: [06-02-skip-detection, 07-scroll-controller]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-position model (confirmedPosition/candidatePosition)"
    - "Monotonic constraint pattern (position never goes backward)"
    - "ProcessResult action types (advanced/hold/exploring)"

key-files:
  created:
    - matching/PositionTracker.js
    - matching/PositionTracker.test.js
  modified: []

key-decisions:
  - "Position 0 match from initial state is hold (must be strictly forward)"
  - "Same position match is hold (no lateral movement)"
  - "Null/undefined candidates return hold action gracefully"

patterns-established:
  - "PositionTracker stateful class vs WordMatcher stateless functions"
  - "ProcessResult with action enum for state machine transitions"
  - "TDD with 18 tests covering all confirmation rules"

# Metrics
duration: 2min
completed: 2026-01-24
---

# Phase 6 Plan 01: Core PositionTracker Summary

**Two-position tracker with monotonic forward movement, confidence threshold (0.7 default), and stateful position management for v1.1 pipeline**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-24T17:13:36Z
- **Completed:** 2026-01-24T17:15:04Z
- **Tasks:** TDD cycle (RED-GREEN)
- **Files created:** 2

## Accomplishments
- Implemented PositionTracker class with two-position model (confirmed/candidate)
- Enforced monotonic forward movement constraint
- Applied confidence-based confirmation logic (0.7 threshold)
- Created comprehensive test suite with 18 tests covering all behaviors

## TDD Cycle

### RED Phase
- Created PositionTracker.test.js with 18 failing tests
- Covered: constructor, getConfirmedPosition, getScrollBoundary, processMatch, reset, edge cases
- Tests fail because module doesn't exist yet

### GREEN Phase
- Implemented PositionTracker class
- ES module with JSDoc types matching WordMatcher pattern
- All 18 tests pass

### REFACTOR Phase
- Not needed - code is clean and well-structured

## Task Commits

TDD plan produced 2 atomic commits:

1. **RED: Failing tests** - `188f449` (test)
2. **GREEN: Implementation** - `852281f` (feat)

## Files Created

- `matching/PositionTracker.js` (156 lines) - Stateful position management class with two-position model
- `matching/PositionTracker.test.js` (328 lines) - 18 TDD tests covering core behavior

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Position 0 match from initial state is hold | Must be strictly forward to advance (>0 not >=0) |
| Same position match is hold | No lateral movement, only forward advancement |
| Null/undefined candidates return hold | Graceful handling prevents crashes |
| Default confidenceThreshold: 0.7 | Matches v1.1 design principle of conservative forward movement |
| Default nearbyThreshold: 10 | Reasonable default for Phase 1, skip detection uses this in 06-02 |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Must-Haves Verification

**Truths:**
- [x] confirmedPosition only moves forward (never backward automatically)
- [x] High-confidence match near current position advances confirmedPosition
- [x] Low-confidence match does not advance confirmedPosition
- [x] Backward match is ignored (position holds)
- [x] getScrollBoundary returns confirmedPosition for external code

**Artifacts:**
- [x] matching/PositionTracker.js (156 lines > 80 minimum)
- [x] matching/PositionTracker.test.js (328 lines > 60 minimum)

**Key Links:**
- [x] PositionTracker.processMatch accepts MatchCandidate type from WordMatcher

## Next Phase Readiness

- PositionTracker foundation complete
- Ready for 06-02: Skip detection logic (farJumpThreshold, consecutiveConfirmations)
- candidatePosition tracking in place for skip detection to use
- No blockers

---
*Phase: 06-position-tracker*
*Completed: 2026-01-24*
