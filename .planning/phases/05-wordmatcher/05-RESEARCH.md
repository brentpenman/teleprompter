# Phase 5: WordMatcher - Research

**Researched:** 2026-01-24
**Domain:** Stateless fuzzy text matching with distance-weighted scoring for speech following
**Confidence:** HIGH

## Summary

This phase implements a stateless WordMatcher component that returns candidates scored by both fuzzy match quality and positional proximity. The key architectural shift from v1.0's TextMatcher is making the component stateless - it receives current position as input and returns scored candidates without maintaining internal state.

The standard approach is to continue using Fuse.js (already installed at v7.1.0) for fuzzy matching, but wrap it in a pure function that combines Fuse.js's match quality score with a distance penalty based on how far each match is from the current position. This creates a compound score where nearby matches rank higher than distant matches even if the distant match has slightly better text similarity.

For consecutive word matching (required for MATCH-03), the pattern is to search for N-gram windows (2-3 words) and verify matches form consecutive sequences in the script. This prevents false positives from single common words. The existing `textUtils.js` tokenization and normalization can be reused.

**Primary recommendation:** Implement WordMatcher as a pure function that takes (spokenWords, currentPosition, radius) and returns an array of candidate matches scored by `combinedScore = fuzzyScore * (1 - distancePenalty)`, where distancePenalty increases with distance from currentPosition.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fuse.js | 7.1.0 | Fuzzy string matching | Already installed, battle-tested, returns scores (0=perfect, 1=mismatch), supports `ignoreLocation` for our custom distance weighting |
| Native ES Modules | - | Pure function pattern | No additional libraries needed for stateless design |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| textUtils.js (existing) | - | Tokenization, normalization, filler word filtering | Reuse for all text preprocessing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fuse.js | fast-fuzzy | Faster for large datasets but less flexible scoring; Fuse.js already works and is installed |
| Custom distance weighting | Fuse.js built-in `location`/`distance` | Fuse.js location-based scoring isn't designed for our use case (moving position); custom weighting gives precise control |

**Installation:**
```bash
# No new dependencies needed - Fuse.js 7.1.0 already installed
```

## Architecture Patterns

### Recommended Module Structure
```
matching/
├── WordMatcher.js        # NEW: Stateless matching function (this phase)
├── textUtils.js          # EXISTING: Tokenization, normalization
├── Highlighter.js        # EXISTING: CSS Custom Highlight API
├── TextMatcher.js        # DEPRECATED: Will be removed in Phase 8
├── ScrollSync.js         # DEPRECATED: Will be replaced in Phase 7
└── ConfidenceLevel.js    # DEPRECATED: Absorbed into Phase 6
```

### Pattern 1: Stateless Pure Function Design
**What:** WordMatcher exports a pure function (or class with no mutable state) that takes inputs and returns results without side effects
**When to use:** Always - this is the architectural requirement (ARCH-01)
**Why:** Pure functions are easier to test, reason about, and compose. The stateful concern of "current position" moves to PositionTracker (Phase 6).

**Example:**
```javascript
// Source: v1.1 architecture decision
// WordMatcher is stateless - receives position, returns candidates

/**
 * Find matching candidates in script for spoken words
 * @param {string[]} spokenWords - Normalized words from speech recognition
 * @param {Object[]} scriptIndex - Pre-indexed script words with positions
 * @param {Fuse} fuseInstance - Pre-built Fuse.js index
 * @param {number} currentPosition - Current word index in script
 * @param {Object} options - Configuration options
 * @returns {Object[]} Scored candidates sorted by combined score
 */
export function findMatches(spokenWords, scriptIndex, fuseInstance, currentPosition, options = {}) {
  const {
    radius = 50,           // Search radius around currentPosition
    minConsecutive = 2,    // Minimum consecutive matches required
    fuzzyThreshold = 0.3,  // Fuse.js threshold
    distanceWeight = 0.3   // How much distance affects score (0-1)
  } = options;

  // Search within radius
  const searchStart = Math.max(0, currentPosition - radius);
  const searchEnd = Math.min(scriptIndex.length, currentPosition + radius);

  // Find candidates...
  // Return scored results
}
```

### Pattern 2: Distance-Weighted Scoring Formula
**What:** Combine fuzzy match quality with positional distance to create compound score
**When to use:** When ranking multiple match candidates (MATCH-01, MATCH-04)
**Formula:**
```
distancePenalty = min(1, abs(matchPosition - currentPosition) / radius)
combinedScore = (1 - fuseScore) * (1 - distanceWeight * distancePenalty)
```
Where:
- `fuseScore` is Fuse.js score (0 = perfect match, 1 = no match)
- `distancePenalty` ranges from 0 (at current position) to 1 (at edge of radius)
- `distanceWeight` controls how much position matters (0.3 = 30% of score is distance-based)
- Higher `combinedScore` is better (0-1 range, 1 = perfect nearby match)

**Example:**
```javascript
// Source: Adapted from fuzzy matching best practices
function calculateCombinedScore(fuseScore, matchPosition, currentPosition, radius, distanceWeight = 0.3) {
  // Convert Fuse score to quality (Fuse: 0=perfect, we want: 1=perfect)
  const matchQuality = 1 - fuseScore;

  // Calculate distance penalty (0 = at position, 1 = at edge of radius)
  const distance = Math.abs(matchPosition - currentPosition);
  const distancePenalty = Math.min(1, distance / radius);

  // Combine: higher is better
  // At current position (penalty=0): score = matchQuality
  // At edge of radius (penalty=1): score = matchQuality * (1 - distanceWeight)
  const combinedScore = matchQuality * (1 - distanceWeight * distancePenalty);

  return combinedScore;
}
```

### Pattern 3: Consecutive Word Matching (N-gram Window)
**What:** Require 2+ consecutive words to match at adjacent positions in script
**When to use:** Always - prevents false positives from single common words (MATCH-03)
**How it works:**
1. Take last N words from spoken input (N = window size, typically 2-3)
2. For each potential starting position in search range, check if ALL window words match consecutively
3. Score based on average fuzzy score of matched words + distance penalty

**Example:**
```javascript
// Source: Sliding window pattern from existing TextMatcher
function findConsecutiveMatches(spokenWindow, scriptIndex, fuse, searchStart, searchEnd, threshold) {
  const candidates = [];

  // Iterate through possible starting positions
  for (let startPos = searchStart; startPos <= searchEnd - spokenWindow.length; startPos++) {
    let matchCount = 0;
    let totalScore = 0;

    // Check each word in the window
    for (let i = 0; i < spokenWindow.length; i++) {
      const scriptWord = scriptIndex[startPos + i].word;
      const results = fuse.search(spokenWindow[i]);

      // Find if any result matches this exact position
      const match = results.find(r =>
        r.item.index === startPos + i && r.score <= threshold
      );

      if (match) {
        matchCount++;
        totalScore += match.score;
      }
    }

    // Require ALL words to match (consecutive phrase matching)
    if (matchCount === spokenWindow.length) {
      candidates.push({
        position: startPos + spokenWindow.length - 1, // End position
        matchCount,
        avgFuseScore: totalScore / matchCount,
        startPosition: startPos
      });
    }
  }

  return candidates;
}
```

### Pattern 4: Pre-indexed Script for Performance
**What:** Build Fuse.js index once when script loads, pass to matcher
**When to use:** Always - avoids rebuilding index on every match attempt
**How it works:**
1. When script text is set, tokenize and build `scriptIndex` array
2. Create Fuse.js instance with the index
3. Pass both to WordMatcher function on each call

**Example:**
```javascript
// Source: Existing TextMatcher pattern
function buildScriptIndex(scriptText) {
  const words = tokenize(scriptText);
  return words.map((word, index) => ({
    word,
    index,
    // Include character offsets for highlighting (from existing Highlighter)
  }));
}

function createFuseIndex(scriptIndex) {
  return new Fuse(scriptIndex, {
    keys: ['word'],
    threshold: 0.3,
    includeScore: true,
    ignoreLocation: true,  // We handle location ourselves with distance weighting
    minMatchCharLength: 2
  });
}
```

### Anti-Patterns to Avoid
- **Stateful matcher:** Don't store currentPosition in WordMatcher - that's PositionTracker's job (Phase 6)
- **Global search without radius:** Always constrain search to radius around current position (MATCH-02)
- **Single word matching:** Require minConsecutive >= 2 to prevent false positives
- **Ignoring distance in scoring:** Always factor position into score, not just fuzzy quality
- **Rebuilding index per call:** Build Fuse index once when script changes

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy string matching | Custom Levenshtein | Fuse.js | Handles thresholds, scoring, edge cases; already tested |
| Text normalization | New normalizer | Existing textUtils.js | Already handles numbers, punctuation, unicode |
| Filler word detection | Hardcoded list | Existing textUtils.js | Already has FILLER_WORDS array |
| Distance formula | Complex sigmoid | Linear penalty | Simple formula is sufficient, easier to tune |

**Key insight:** The complexity in this phase is the architecture (stateless design, combining scores) not the algorithms. Reuse existing Fuse.js and textUtils.js; focus effort on the clean API design.

## Common Pitfalls

### Pitfall 1: False Positives from Common Words
**What goes wrong:** Single common words like "the", "and", "is" match at multiple positions, causing wrong candidates to rank high
**Why it happens:** Text contains many repeated common words; fuzzy matching finds them all
**How to avoid:**
- Require minConsecutive >= 2 (already in requirements MATCH-03)
- Filter filler words before matching (use existing textUtils.js)
- Don't match window sizes < 2 words
**Warning signs:** Candidates jump to wrong sections frequently; many ties in scoring

### Pitfall 2: Distant Match Outscoring Nearby Match
**What goes wrong:** A perfect fuzzy match far away beats a slightly-fuzzy match nearby
**Why it happens:** distanceWeight too low; fuzzy score dominates combined score
**How to avoid:**
- Set distanceWeight to at least 0.3 (30% of score is distance-based)
- Test with repeated phrases at different distances
- Consider increasing distanceWeight for scripts with many repeated phrases
**Warning signs:** Position jumps to distant matching phrase instead of nearby imperfect match

### Pitfall 3: Radius Too Small for Natural Speech
**What goes wrong:** User paraphrases or speaks slightly ahead; match falls outside radius
**Why it happens:** Radius constrains search too tightly for natural speech variation
**How to avoid:**
- Default radius = 50 words (covers ~20 seconds of normal speech)
- Allow radius to be configurable
- Return "no match" rather than distant match if nothing in radius
**Warning signs:** Frequent "no match" results even when user is on-script

### Pitfall 4: Threshold Too Strict for Speech Variation
**What goes wrong:** Speech recognition produces variants ("gonna" vs "going to") that don't match
**Why it happens:** Fuse.js threshold too low (too strict)
**How to avoid:**
- Use threshold 0.3-0.4 (existing TextMatcher uses 0.3)
- Test with real speech recognition output, not typed text
- Consider phonetic similarity for common variants
**Warning signs:** Matches fail on obvious paraphrases; user says correct words but no match found

### Pitfall 5: Mixing Stateful and Stateless Code
**What goes wrong:** WordMatcher ends up with state (position, buffer) making it hard to test and reason about
**Why it happens:** Copying patterns from existing stateful TextMatcher without refactoring
**How to avoid:**
- Never store currentPosition in WordMatcher
- Never maintain a spokenBuffer in WordMatcher
- All inputs come as function parameters; all outputs are return values
- No side effects (no logging that changes behavior, no caching)
**Warning signs:** WordMatcher has `this.currentPosition` or similar; tests require complex setup

## Code Examples

Verified patterns combining research and existing codebase:

### Complete WordMatcher Interface
```javascript
// Source: v1.1 architecture requirements + Fuse.js patterns
import Fuse from 'fuse.js';
import { tokenize, filterFillerWords } from './textUtils.js';

/**
 * WordMatcher - Stateless matching component
 * Scores candidates by both fuzzy match quality and positional proximity
 */

/**
 * Build script index and Fuse instance (call once when script changes)
 */
export function createMatcher(scriptText, options = {}) {
  const { threshold = 0.3 } = options;

  const scriptWords = tokenize(scriptText);
  const scriptIndex = scriptWords.map((word, index) => ({ word, index }));

  const fuse = new Fuse(scriptIndex, {
    keys: ['word'],
    threshold,
    includeScore: true,
    ignoreLocation: true,  // We handle location via distance weighting
    minMatchCharLength: 2
  });

  return { scriptIndex, fuse, scriptWords };
}

/**
 * Find matches for spoken transcript (pure function - no state)
 * @param {string} transcript - Raw spoken words from speech recognition
 * @param {Object} matcher - Result from createMatcher
 * @param {number} currentPosition - Current word position (from PositionTracker)
 * @param {Object} options - Search configuration
 * @returns {Object} Match result with candidates
 */
export function findMatches(transcript, matcher, currentPosition, options = {}) {
  const {
    radius = 50,
    minConsecutive = 2,
    windowSize = 3,
    distanceWeight = 0.3,
    threshold = 0.3
  } = options;

  const { scriptIndex, fuse } = matcher;

  // Tokenize and filter spoken input
  const words = tokenize(transcript);
  const filtered = filterFillerWords(words);

  if (filtered.length < minConsecutive) {
    return { candidates: [], bestMatch: null };
  }

  // Use last windowSize words
  const window = filtered.slice(-windowSize);

  // Calculate search bounds
  const searchStart = Math.max(0, currentPosition - radius);
  const searchEnd = Math.min(scriptIndex.length, currentPosition + radius);

  // Find consecutive matches
  const candidates = [];

  for (let pos = searchStart; pos <= searchEnd - window.length; pos++) {
    let matchCount = 0;
    let totalScore = 0;

    for (let i = 0; i < window.length; i++) {
      const results = fuse.search(window[i]);
      const match = results.find(r =>
        r.item.index === pos + i && r.score <= threshold
      );

      if (match) {
        matchCount++;
        totalScore += match.score;
      }
    }

    // Require ALL words to match
    if (matchCount === window.length) {
      const endPosition = pos + window.length - 1;
      const avgFuseScore = totalScore / matchCount;

      // Calculate combined score with distance penalty
      const distance = Math.abs(endPosition - currentPosition);
      const distancePenalty = Math.min(1, distance / radius);
      const matchQuality = 1 - avgFuseScore;
      const combinedScore = matchQuality * (1 - distanceWeight * distancePenalty);

      candidates.push({
        position: endPosition,
        startPosition: pos,
        matchCount,
        avgFuseScore,
        distance,
        combinedScore
      });
    }
  }

  // Sort by combined score (highest first)
  candidates.sort((a, b) => b.combinedScore - a.combinedScore);

  return {
    candidates,
    bestMatch: candidates[0] || null
  };
}
```

### Usage Example
```javascript
// In integration code (Phase 8)
import { createMatcher, findMatches } from './matching/WordMatcher.js';

// Build matcher once when script loads
const matcher = createMatcher(scriptText);

// On each speech recognition result
function onSpeechResult(transcript) {
  const currentPosition = positionTracker.getConfirmedPosition();

  const result = findMatches(transcript, matcher, currentPosition, {
    radius: 50,
    minConsecutive: 2,
    distanceWeight: 0.3
  });

  if (result.bestMatch) {
    // Pass to PositionTracker for confirmation logic
    positionTracker.onMatchCandidate(result.bestMatch);
  }
}
```

### Testing Pure Function
```javascript
// Source: Best practice for testing pure functions
import { createMatcher, findMatches } from './matching/WordMatcher.js';

// Test setup - no mocks needed for pure function
const script = "four score and seven years ago our fathers brought forth";
const matcher = createMatcher(script);

// Test 1: Exact match near position
const result1 = findMatches("score and seven", matcher, 1, { radius: 10 });
expect(result1.bestMatch.position).toBe(3); // "seven" is at index 3
expect(result1.bestMatch.combinedScore).toBeGreaterThan(0.9);

// Test 2: Prefer nearby match over distant
const result2 = findMatches("our fathers", matcher, 6, { radius: 50 });
expect(result2.bestMatch.position).toBe(7); // Nearby "fathers"

// Test 3: No match outside radius
const result3 = findMatches("brought forth", matcher, 0, { radius: 3 });
expect(result3.bestMatch).toBeNull(); // "brought forth" is at position 8-9, outside radius
```

## State of the Art

| Old Approach (v1.0) | Current Approach (v1.1) | Reason for Change |
|---------------------|-------------------------|-------------------|
| Stateful TextMatcher with internal position | Stateless WordMatcher receiving position | Cleaner architecture, easier testing, single source of truth for position in PositionTracker |
| Proximity window search (hardcoded ranges) | Configurable radius with distance-weighted scoring | More flexible, intrinsic position bias (MATCH-01) |
| Return single match or null | Return ranked candidates array | Allows PositionTracker to apply confirmation logic |
| Confidence levels (high/medium/low) | Combined score (0-1 continuous) | Simpler, more granular, PositionTracker decides thresholds |

**Deprecated/outdated:**
- `TextMatcher.js`: Will be removed in Phase 8; functionality split between WordMatcher (matching) and PositionTracker (state)
- `ConfidenceLevel.js`: Scoring now intrinsic to WordMatcher; discrete levels handled by PositionTracker

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal distanceWeight value**
   - What we know: 0.3 (30% distance-based) is a reasonable starting point
   - What's unclear: May need tuning based on script type (speeches with many repeated phrases vs unique text)
   - Recommendation: Make configurable, start with 0.3, tune during Phase 8 integration

2. **Handling very long scripts (1000+ words)**
   - What we know: Current approach searches within radius, so O(radius * windowSize) per call
   - What's unclear: Performance with very long scripts and frequent speech events
   - Recommendation: Profile during integration; radius constraint should keep it fast

3. **Speech recognition artifacts vs paraphrasing**
   - What we know: Fuse.js threshold 0.3 handles minor variations
   - What's unclear: Edge cases where ASR output differs significantly from script ("gonna" vs "going to")
   - Recommendation: Test with real speech; may need phonetic normalization in future version

## Sources

### Primary (HIGH confidence)
- [Fuse.js Official Documentation - Options](https://www.fusejs.io/api/options.html) - All configuration options verified
- [Fuse.js Scoring Theory](https://www.fusejs.io/concepts/scoring-theory.html) - Score interpretation (0=perfect, 1=mismatch)
- Existing TextMatcher.js, textUtils.js - Verified working patterns from v1.0
- v1.1 REQUIREMENTS.md - Architectural constraints (ARCH-01, MATCH-01 through MATCH-04)

### Secondary (MEDIUM confidence)
- [DataLadder - Fuzzy Matching 101](https://dataladder.com/fuzzy-matching-101/) - Best practices for threshold tuning, normalization
- [WinPure - Common Mistakes in Fuzzy Data Matching](https://winpure.com/fuzzy-matching-common-mistakes/) - Pitfalls verified against practical experience
- [Medium - N-grams in NLP](https://medium.com/@abhishekjainindore24/n-grams-in-nlp-a7c05c1aff12) - Consecutive word matching pattern
- [Teleprompter implementations](https://github.com/amulyagarimella/smart-teleprompter) - Confirms Levenshtein + position tracking approach

### Tertiary (LOW confidence)
- WebSearch results for distance-weighted scoring formulas - General patterns, not library-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Fuse.js 7.1.0 installed and working, API verified via official docs
- Architecture: HIGH - Stateless pattern is well-understood; existing code provides patterns
- Pitfalls: HIGH - Based on v1.0 experience and fuzzy matching literature
- Scoring formula: MEDIUM - Formula is sound but distanceWeight may need tuning

**Research date:** 2026-01-24
**Valid until:** 2026-04-24 (90 days - Fuse.js is stable, patterns are established)
