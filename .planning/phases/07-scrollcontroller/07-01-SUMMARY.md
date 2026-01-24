---
phase: 07-scrollcontroller
plan: 01
subsystem: ui
tags: [scroll, animation, exponential-smoothing, reactive, teleprompter]

# Dependency graph
requires:
  - phase: 06-positiontracker
    provides: PositionTracker.getConfirmedPosition() API
provides:
  - ScrollController class for reactive scroll control
  - positionToScrollTop conversion with caret positioning
  - Speech pace tracking with exponential moving average
  - Frame-rate independent exponential smoothing animation
  - Tracking/holding state management with 5s timeout
affects: [08-integration, visual-feedback, pipeline-assembly]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Exponential smoothing animation (frame-rate independent)
    - Reactive position consumption (query, never store)
    - Speech pace derivation from position deltas

key-files:
  created:
    - matching/ScrollController.js
    - matching/ScrollController.test.js
  modified: []

key-decisions:
  - "lastPositionTime uses -1 as sentinel (not 0) to allow timestamp 0"
  - "Frame-rate independence tolerance of 10% (floating point precision)"
  - "Skip threshold of 10 words triggers jumpSpeed"
  - "EMA weights: 70% old pace, 30% new pace"

patterns-established:
  - "Exponential smoothing: position += (target - position) * (1 - exp(-speed * dt))"
  - "Pace clamping: minPace=0.5, maxPace=10 words/second"
  - "Holding timeout: 5000ms without position advance"

# Metrics
duration: 9min
completed: 2026-01-24
---

# Phase 7 Plan 1: ScrollController Core Summary

**Reactive scroll controller with exponential smoothing animation, speech pace derivation, and tracking/holding state management**

## Performance

- **Duration:** 9 min
- **Started:** 2026-01-24T19:26:44Z
- **Completed:** 2026-01-24T19:35:10Z
- **Tasks:** 3 (TDD: RED, GREEN, REFACTOR)
- **Files created:** 2

## Accomplishments
- ScrollController class implementing reactive scroll for teleprompter
- positionToScrollTop converts word index to scroll position with caret offset (upper third default)
- Speech pace tracking via exponential moving average from position deltas
- Frame-rate independent exponential smoothing animation
- Tracking/holding state with automatic resume on position advance
- 28 comprehensive tests covering all behaviors

## Task Commits

Each TDD phase was committed atomically:

1. **RED: Failing tests** - `ff1631d` (test)
2. **GREEN: Implementation** - `b79a7ac` (feat)
3. **REFACTOR: No changes needed** - N/A (code already clean)

## Files Created/Modified
- `matching/ScrollController.js` (342 lines) - Reactive scroll controller class
- `matching/ScrollController.test.js` (491 lines) - Comprehensive test suite

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| lastPositionTime uses -1 sentinel | Allows timestamp 0 to be valid (first call establishes baseline) |
| Frame-rate tolerance of 10% | Floating point and frame timing cause small differences |
| Skip threshold of 10 words | Matches PositionTracker nearbyThreshold default |
| EMA 70/30 weighting | Balances responsiveness with smoothness |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

1. **Jest ES modules + jest.fn()**: Required explicit import of jest from '@jest/globals'
2. **Node lacks requestAnimationFrame**: Mocked globally in tests
3. **Timestamp 0 edge case**: Original `lastPositionTime > 0` check failed when first timestamp was 0; fixed by using -1 as sentinel

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ScrollController ready for integration with PositionTracker and WordMatcher
- API follows reactive pattern: queries getConfirmedPosition(), notified via onPositionAdvanced()
- State callbacks (onStateChange) ready for visual feedback integration

---
*Phase: 07-scrollcontroller*
*Completed: 2026-01-24*
