---
phase: 04
plan: 03
subsystem: matching
tags: [confidence, state-machine, scroll-control, exponential-easing]

dependency-graph:
  requires: [04-01]
  provides: [TextMatcher-confidence-API, ScrollSync-state-machine]
  affects: [04-04]

tech-stack:
  added: []
  patterns: [state-machine, exponential-decay, compound-confidence]

key-files:
  created: []
  modified:
    - matching/TextMatcher.js
    - matching/ScrollSync.js

decisions:
  - Forward skip confidence threshold: 0.85
  - Backward skip confidence threshold: 0.92
  - Patient threshold before off-script: 4 seconds
  - Time constants: accel=1500ms, decel=500ms, resume=1000ms
  - Long skip threshold (instant jump): 100 words
  - Short skip threshold (smooth scroll): 20 words

metrics:
  duration: 2m
  completed: 2026-01-23
---

# Phase 04 Plan 03: Intelligent Scroll Control Summary

**One-liner:** State machine scroll control with exponential easing and confidence-gated skip detection

## What Was Done

### Task 1: Add confidence scoring to TextMatcher

Extended TextMatcher to return confidence data with matches:

- Imported ConfidenceCalculator from ConfidenceLevel.js
- Added `getMatchWithConfidence(transcript)` method that returns:
  - `position`: word index or null
  - `confidence`: raw confidence score (0-1)
  - `level`: 'high' | 'medium' | 'low'
  - `matchCount`: number of consecutive matches
  - `windowSize`: size of match window
  - `isBackwardSkip`: true if user jumped backward
- Added `searchRangeWithScore()` helper that returns match scores for confidence calculation

### Task 2: Add state machine and exponential easing to ScrollSync

Major overhaul of ScrollSync to implement intelligent scroll behavior:

**State Machine:**
- Three states: CONFIDENT, UNCERTAIN, OFF_SCRIPT
- CONFIDENT: High confidence matches, full speed scrolling
- UNCERTAIN: Low/medium confidence, slowing down (30% base speed)
- OFF_SCRIPT: 4+ seconds of low confidence, coasting to stop

**Exponential Easing:**
- `easeToward()` method using `1 - Math.exp(-deltaMs / timeConstant)` formula
- Acceleration: 1500ms time constant (smooth ramp up)
- Deceleration: 500ms time constant (quick slow down)

**Skip Detection:**
- Forward skip requires 0.85 confidence
- Backward skip requires 0.92 confidence (higher because jumping back is more disruptive)
- Short skips (<20 words): smooth scroll
- Long skips (>100 words): instant jump

**Boundary Enforcement:**
- Tracks `lastMatchedPosition` - highest confirmed word position
- Scroll NEVER exceeds this boundary
- When off-script, stops at boundary to keep last spoken text visible

## Key Code Patterns

**State transitions:**
```
CONFIDENT -> UNCERTAIN (on low/medium confidence)
UNCERTAIN -> CONFIDENT (on high confidence)
UNCERTAIN -> OFF_SCRIPT (after 4s of low confidence)
OFF_SCRIPT -> CONFIDENT (on high confidence match)
```

**Exponential decay for speed:**
```javascript
const factor = 1 - Math.exp(-deltaMs / timeConstant);
return current + (target - current) * factor;
```

## Verification Results

1. TextMatcher.getMatchWithConfidence() returns {position, confidence, level} - PASS
2. ScrollSync exports ScrollState enum with CONFIDENT/UNCERTAIN/OFF_SCRIPT - PASS
3. ScrollSync.updateConfidence() transitions between states - PASS
4. Math.exp used for exponential easing - PASS
5. tick() checks lastMatchedPosition boundary - PASS

## Commits

| Commit | Description |
|--------|-------------|
| 36c139c | feat(04-03): add confidence scoring to TextMatcher |
| 8298c5c | feat(04-03): add state machine and exponential easing to ScrollSync |

## Deviations from Plan

None - plan executed exactly as written.

## Next Plan Readiness

**For 04-04 (Integration):**
- TextMatcher now provides confidence data via getMatchWithConfidence()
- ScrollSync.updateConfidence() accepts match results with confidence
- Both modules ready for integration with TeleprompterController
- State callbacks (onStateChange, onConfidenceChange) available for UI updates
