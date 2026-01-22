---
phase: 03-basic-text-matching
plan: 01
subsystem: text-matching
tags: [fuzzy-matching, text-normalization, sliding-window, fuse.js, stopword]
status: complete
completed: 2026-01-22
duration: 2m

dependencies:
  requires: []
  provides:
    - TextMatcher class with fuzzy matching
    - Text normalization utilities
    - Filler word filtering
  affects:
    - 03-02 (will use TextMatcher for position tracking)
    - 04-* (integration plans will connect TextMatcher to voice and display)

tech-stack:
  added:
    - fuse.js@7.1.0 (fuzzy text search)
    - stopword@3.1.5 (filler word removal)
  patterns:
    - Sliding window pattern for consecutive match detection
    - Forward-first search for performance optimization
    - Threshold-based fuzzy matching (0.3 = permissive)

key-files:
  created:
    - matching/textUtils.js
    - matching/TextMatcher.js
    - test-matcher.html
    - package.json
  modified: []

decisions:
  - id: fuzzy-threshold
    choice: "0.3 threshold for Fuse.js"
    rationale: "Balance between strictness and handling speech recognition errors"
    impact: "May need tuning based on real-world usage"

  - id: sliding-window-size
    choice: "3-word window with 2+ consecutive matches required"
    rationale: "Large enough to disambiguate, small enough for responsiveness"
    impact: "Works well for normal speech cadence"

  - id: forward-search-first
    choice: "Search forward from current position before backward"
    rationale: "Performance optimization + handles repeated phrases correctly"
    impact: "Assumes user mostly reads forward (normal use case)"

  - id: stopword-filtering
    choice: "Use stopword library + custom filler words"
    rationale: "Ignore speech artifacts and common English stopwords"
    impact: "Reduces false matches from 'um', 'uh', 'like', etc."
---

# Phase 03 Plan 01: Basic Text Matching Summary

**One-liner:** Fuzzy text matching engine using Fuse.js with sliding window, filler word filtering, and number normalization.

## What Was Built

Created the core text matching intelligence that enables voice-controlled scrolling by fuzzy-matching spoken words to script positions.

**Key components:**

1. **textUtils.js** - Text normalization utilities
   - normalizeText: lowercase, remove punctuation, Unicode normalization
   - normalizeNumber: converts digits to word equivalents (1 → "one")
   - isFillerWord: detects speech artifacts (um, uh, like, etc.)
   - filterFillerWords: removes stopwords and custom fillers
   - tokenize: splits text into normalized word array

2. **TextMatcher.js** - Sliding window matcher
   - Constructor accepts script text and options (windowSize, threshold, minConsecutiveMatches)
   - Uses Fuse.js for fuzzy search with 0.3 threshold (permissive)
   - Maintains 3-word sliding window buffer of recent spoken words
   - Requires 2+ consecutive matches to confirm position
   - Searches forward from current position first (performance + handles repeated phrases)
   - Falls back to backward search if no forward match
   - State management for current position and spoken buffer

3. **test-matcher.html** - Manual testing interface
   - Script input textarea
   - Spoken word simulation input
   - Live state display (position, buffer, progress)
   - Highlighted script display showing current position
   - Validates matching logic before voice integration

## Technical Decisions

**Fuzzy Matching Approach:**
- Chose Fuse.js over exact matching or regex
- Threshold 0.3 is quite permissive - handles speech recognition errors well
- May need tuning based on real-world usage patterns

**Sliding Window Pattern:**
- 3-word window provides enough context to disambiguate
- Requiring 2+ consecutive matches prevents false positives
- Balance between responsiveness and accuracy

**Search Strategy:**
- Forward search first: most users read forward, so search ahead from current position
- Backward search fallback: handles case where user jumps back or restarts
- Performance optimization: avoid searching entire script every time

**Stopword Handling:**
- Combined approach: standard English stopwords + custom speech fillers
- Filler words: um, uh, like, you know, actually, basically, so, well
- Prevents false matches from speech artifacts

## Deviations from Plan

None - plan executed exactly as written.

## Testing & Validation

**Manual testing via test-matcher.html:**

Test cases to verify:
1. Load script, type "Welcome to our" → should match position 0
2. Type "presentation today" → should advance to ~position 3
3. Type "um uh like" → should be ignored (filler words)
4. Type "voyce recognishun" → should still match "voice recognition" (fuzzy)

**Dependencies verified:**
- fuse.js@7.1.0 installed
- stopword@3.1.5 installed

**Module structure verified:**
- matching/textUtils.js exports 5 functions
- matching/TextMatcher.js exports TextMatcher class
- All imports working correctly

## Next Phase Readiness

**Ready for Phase 03-02 (Script Position Highlighting):**
- TextMatcher provides match positions
- Can track current word index in script
- State management exposes position for UI updates

**Blockers/Concerns:**
- Fuzzy threshold (0.3) may need tuning after real voice testing
- Window size (3 words) and consecutive match requirement (2+) are estimates - may need adjustment
- Number normalization only covers 0-1000 - may need expansion for larger numbers
- No character-level position tracking yet (only word-level) - will need this for exact highlighting

**Integration points for future phases:**
- TextMatcher.addSpokenWord() will be called from voice recognition
- TextMatcher.currentPosition will drive scroll position
- TextMatcher.getState() provides debugging info for UI

## Commits

| Commit | Type | Description | Files |
|--------|------|-------------|-------|
| 995e2fd | feat | add text normalization utilities | package.json, matching/textUtils.js |
| 3fec352 | feat | implement TextMatcher with sliding window | matching/TextMatcher.js |
| c30ec1c | feat | add TextMatcher test page | test-matcher.html |

## Performance Notes

**Execution time:** ~2 minutes

**Runtime performance considerations:**
- Fuse.js search is O(n) where n = script length
- Sliding window limits search scope
- Forward-first search reduces average case significantly
- Should handle scripts up to ~10,000 words without lag

## Files Changed

**Created:**
- `/Users/brent/project/package.json` - npm package configuration
- `/Users/brent/project/matching/textUtils.js` - text normalization utilities
- `/Users/brent/project/matching/TextMatcher.js` - fuzzy text matcher with sliding window
- `/Users/brent/project/test-matcher.html` - manual testing interface

**Modified:**
- None

## Notes

This is the core intelligence that makes the teleprompter "smart" - it enables the system to follow the user's natural speaking rhythm despite speech recognition errors, filler words, and other real-world messiness.

The sliding window + consecutive match pattern provides good balance between responsiveness and accuracy. The forward-first search optimization is critical for handling scripts with repeated phrases (common in presentations and speeches).

Test page provides essential validation before voice integration - can manually verify the matching logic works as expected.
