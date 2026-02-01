# PRD-002: Voice Performance with Large Scripts

**GitHub Issue**: [#2 — Voice is VERY SLOW and unresponsive when working with large scripts](https://github.com/promptsmart/teleprompter/issues/2)
**Status**: Draft
**Priority**: High

---

## Problem Statement

Voice mode becomes slow and unresponsive when working with large scripts. The voice matching pipeline processes every transcript event by searching across the entire script, creating a compounding performance bottleneck as script length increases.

Users report: *"I think it's constantly searching the whole script or something."*

## Background

The voice-follow pipeline works as follows:

1. `SpeechRecognizer` fires `onTranscript` callbacks with interim and final transcripts (multiple times per second)
2. `handleSpeechTranscript()` (`script.js:357`) calls `findMatches()` for each transcript event
3. `findMatches()` (`matching/WordMatcher.js:134`) performs fuzzy search within a ±50 word radius of the current position
4. Matches feed into `PositionTracker` and `ScrollController` to advance the teleprompter

The bottleneck is in steps 2–3. While the search is bounded to a ±50 word radius around the current position, the underlying Fuse.js index covers the entire script.

## Root Cause Analysis

### `createMatcher()` — Full-script Fuse.js index (`WordMatcher.js:76-113`)

When `initMatchingSystem()` is called (`script.js:660`), `createMatcher()` builds a `scriptIndex` array of every word in the script and creates a single Fuse.js instance indexing all of them:

```javascript
const fuse = new Fuse(scriptIndex, {
  keys: ['word'],
  threshold: options.threshold || 0.3,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2
});
```

For a 5,000-word script, this index contains 5,000 entries.

### `findMatches()` — Repeated full-index search (`WordMatcher.js:134-224`)

The matching loop iterates over positions within the search bounds (`searchStart` to `searchEnd`, up to 100 positions for radius=50), and for each position checks up to `windowSize` (default 3) words. Each word check calls `fuse.search()`, which scans the entire Fuse.js index — not just the entries within the radius.

The result is then filtered to find matches at the specific position being checked:

```
Per transcript event:
  positions_checked = radius * 2 = 100
  fuse_searches_per_position = windowSize = 3
  total_fuse_searches = 100 × 3 = 300 calls to fuse.search()
```

Each `fuse.search()` iterates all 5,000+ entries in a large script. With interim transcripts firing 2–4 times per second, this means **600–1,200 full-index searches per second**.

### Compounding factors

- **Interim transcripts**: `SpeechRecognizer` is configured with `interimResults: true` (`SpeechRecognizer.js:66`), so partial results fire frequently before a final result arrives.
- **No debouncing**: `handleSpeechTranscript()` processes every transcript event immediately with no throttling.
- **Main thread**: All matching runs on the main thread, blocking scroll animation (`scrollLoop` at `script.js:146`) and UI updates.

## Proposed Solutions

### Option A: Windowed Fuse.js Index (Recommended)

Replace the single full-script Fuse.js index with a dynamically scoped index that only covers words within the search radius.

**Approach**: In `findMatches()`, before the matching loop, slice `scriptIndex` to entries between `searchStart` and `searchEnd`, then create a temporary Fuse.js instance over just those entries (or maintain a cache of recent windowed indices).

**Trade-offs**:
- Building a Fuse.js index per call has overhead, but for ~100 entries it is negligible compared to searching 5,000
- Could cache and reuse the windowed index when the position hasn't changed significantly

### Option B: Pre-filtered Position Lookup

Instead of calling `fuse.search()` and then filtering by position, reverse the approach: for each position in the radius, do a direct string comparison first (exact or normalized match), and only fall back to Fuse.js fuzzy search for non-exact matches.

**Approach**: Add a fast path in the inner loop that checks `scriptIndex[pos].word === searchWord` before invoking `fuse.search()`. Most words in natural speech will match exactly or near-exactly.

**Trade-offs**:
- Simpler change with high impact for typical speech
- Fuzzy matching is still needed for accents, mumbled words, and recognition errors

### Option C: Transcript Debouncing / Throttling

Throttle calls to `findMatches()` so that interim transcripts don't trigger redundant searches.

**Approach**: In `handleSpeechTranscript()`, skip processing if the previous call was less than N milliseconds ago (e.g., 150ms), unless the transcript is `isFinal`.

**Trade-offs**:
- Quick to implement, reduces load by 2–4×
- Does not fix the underlying algorithmic inefficiency
- May introduce slight latency in voice tracking

### Option D: Web Worker Offloading

Move `findMatches()` and the Fuse.js index into a Web Worker so matching doesn't block the main thread.

**Approach**: Create a `MatchingWorker.js` that receives transcript messages and posts back match results. The main thread sends `{transcript, currentPosition}` and receives `{bestMatch}`.

**Trade-offs**:
- Keeps the UI fully responsive regardless of matching cost
- Adds complexity: serialization overhead, worker lifecycle, message coordination
- Should be combined with Option A or B for best results

## Recommended Approach

Combine **Option B** (fast exact-match path) and **Option C** (transcript throttling) as a first pass. These two changes are low-risk and address both the algorithmic cost and the call frequency. If performance is still insufficient for very large scripts (10,000+ words), follow up with **Option A** (windowed index).

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Voice matching must remain accurate (no regression in match quality) | Must have |
| FR-2 | Interim transcripts should be processed no more frequently than once per 150ms | Should have |
| FR-3 | Final transcripts must always be processed immediately | Must have |
| FR-4 | The matching algorithm must short-circuit on exact word matches | Must have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | `findMatches()` must complete in under 16ms (one frame) for scripts up to 5,000 words | Must have |
| NFR-2 | `findMatches()` must complete in under 50ms for scripts up to 10,000 words | Should have |
| NFR-3 | No perceptible lag in scroll animation while voice mode is active | Must have |
| NFR-4 | Memory usage should not increase by more than 2× compared to current implementation | Should have |

## Success Criteria

- Voice mode remains responsive (no dropped frames, smooth scrolling) with scripts of **5,000+ words**
- Match accuracy does not regress — existing `WordMatcher.test.js` tests continue to pass
- Measured `findMatches()` execution time is under 16ms for 5,000-word scripts (profiled in Chrome DevTools)

## Scope

### In Scope

- Optimizing `findMatches()` in `matching/WordMatcher.js`
- Adding transcript throttling in `handleSpeechTranscript()` in `script.js`
- Updating/adding unit tests in `matching/WordMatcher.test.js`
- Performance benchmarking

### Out of Scope

- Changes to the Fuse.js library itself
- Rewriting the entire matching pipeline
- Web Worker implementation (deferred to follow-up if needed)
- Changes to `PositionTracker`, `ScrollController`, or `Highlighter`

## Affected Files

| File | Changes |
|------|---------|
| `matching/WordMatcher.js` | Add exact-match fast path in `findMatches()`, potentially windowed index |
| `script.js` | Add throttling to `handleSpeechTranscript()` |
| `matching/WordMatcher.test.js` | Add performance regression tests, tests for exact-match path |
