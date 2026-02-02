# Quick Task 002: Expand Lookahead Search Area for Scroll Recovery

## What Changed

Expanded the WordMatcher search radius and reduced the minimum consecutive match requirement to improve scroll recovery when speech recognition misses consecutive words.

## Parameter Changes

| Parameter | File | Before | After |
|-----------|------|--------|-------|
| `radius` | `matching/WordMatcher.js` | 50 | 100 |
| `radius` | `script.js` (findMatches call) | 50 | 100 |
| `minConsecutive` | `matching/WordMatcher.js` | 2 | 1 |
| `minConsecutive` | `script.js` (explicit override) | 2 | removed (uses default) |

## Why This Is Safe

The `PositionTracker` is the safety gate, not `minConsecutive`. Even with `minConsecutive=1`, a single match beyond the `nearbyThreshold` enters "exploring" state and requires 4-5 consecutive confirmed matches before the position actually jumps. False matches are filtered out by the streak requirement.

## Files Modified

- `matching/WordMatcher.js` — Updated defaults, JSDoc
- `matching/WordMatcher.test.js` — Updated test for new default, added explicit minConsecutive=2 test
- `script.js` — Updated radius in findMatches call, removed minConsecutive override

## Commit

`6f96c06` — feat(quick-002): expand search radius and allow single-word matching
