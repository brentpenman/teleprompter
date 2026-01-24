# Position-Tracking Algorithms

**Domain:** Real-time position tracking for voice-controlled teleprompter
**Researched:** 2026-01-24
**Confidence:** HIGH (algorithms well-established; application-specific tuning required)

## Executive Summary

Position tracking in streaming text requires solving three interconnected problems:

1. **Positional bias matching** - Finding where the user is, preferring nearby matches over distant ones
2. **Confirmed position tracking** - Distinguishing "where user definitely is" from "where they might be"
3. **Skip detection** - Knowing when a large jump is intentional vs. a false match

The v1.0 implementation partially addresses these but has critical gaps:
- Positional bias uses search order (near-to-far) rather than distance-weighted scoring
- Confirmed position tracks "last matched position" but still allows scroll ahead during confident state
- Skip detection uses maxSkip threshold but lacks consecutive-word confirmation for skips

**Key algorithmic insight:** The core problem is that fuzzy matching returns "is this phrase anywhere in the script?" when we need "is this phrase near where the user should be?" These require fundamentally different algorithms.

**Recommended approach:** Implement a **Distance-Weighted Scoring** algorithm that combines fuzzy match quality with positional proximity into a single score, with a **Two-Position Model** that separates "confirmed floor" (never scroll past) from "candidate ceiling" (where we think user is heading).

## Positional Bias Matching

### Problem Analysis

Current implementation searches in expanding rings (near, then far) but treats all matches within a ring equally. A match 5 words ahead scores the same as one 14 words ahead if both fall in the "near" window.

**What we need:** A continuous scoring function where closer matches score higher than distant ones, even within the same search region.

### Algorithm 1: Distance-Weighted Scoring (Recommended)

Combine fuzzy match score with positional proximity into a unified relevance score.

```
FinalScore = FuzzyScore * PositionalWeight

Where:
  FuzzyScore = 1 - (LevenshteinDistance / MaxLength)  // 0-1, higher is better
  PositionalWeight = 1 / (1 + |distance| * DecayFactor)  // Decays with distance

DecayFactor controls how aggressively proximity is weighted:
  - DecayFactor = 0.05: Gentle decay (15 words away = 0.57 weight)
  - DecayFactor = 0.10: Moderate decay (15 words away = 0.40 weight)
  - DecayFactor = 0.20: Aggressive decay (15 words away = 0.25 weight)
```

**Pseudocode:**

```javascript
function findBestMatch(spokenPhrase, scriptWords, currentPosition, options = {}) {
  const {
    fuzzyThreshold = 0.7,     // Minimum fuzzy score to consider
    decayFactor = 0.1,        // Distance penalty strength
    searchRadius = 50,        // How far to search (words)
    requireConsecutive = 2    // Minimum consecutive matches
  } = options;

  const spokenWords = tokenize(spokenPhrase);
  let bestMatch = null;
  let bestScore = 0;

  // Search within radius of current position
  const searchStart = Math.max(0, currentPosition - searchRadius);
  const searchEnd = Math.min(scriptWords.length, currentPosition + searchRadius);

  for (let pos = searchStart; pos <= searchEnd - spokenWords.length; pos++) {
    // Calculate fuzzy match quality for this position
    const matchResult = matchPhraseAt(spokenWords, scriptWords, pos, fuzzyThreshold);

    if (matchResult.consecutiveMatches >= requireConsecutive) {
      // Calculate distance from current position
      const distance = pos - currentPosition;

      // Apply asymmetric decay: penalize backward moves more than forward
      const effectiveDecay = distance < 0
        ? decayFactor * 2  // Backward: double penalty
        : decayFactor;

      const positionalWeight = 1 / (1 + Math.abs(distance) * effectiveDecay);
      const finalScore = matchResult.fuzzyScore * positionalWeight;

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestMatch = {
          position: pos + matchResult.consecutiveMatches - 1,  // End of match
          fuzzyScore: matchResult.fuzzyScore,
          positionalWeight,
          finalScore,
          distance
        };
      }
    }
  }

  return bestMatch;
}

function matchPhraseAt(spokenWords, scriptWords, startPos, threshold) {
  let consecutiveMatches = 0;
  let totalScore = 0;

  for (let i = 0; i < spokenWords.length && startPos + i < scriptWords.length; i++) {
    const fuzzyScore = fuzzyCompare(spokenWords[i], scriptWords[startPos + i]);

    if (fuzzyScore >= threshold) {
      consecutiveMatches++;
      totalScore += fuzzyScore;
    } else {
      break;  // Consecutive requirement broken
    }
  }

  return {
    consecutiveMatches,
    fuzzyScore: consecutiveMatches > 0 ? totalScore / consecutiveMatches : 0
  };
}
```

### Algorithm 2: Tiered Search with Local Optimization

An alternative that preserves the v1.0 ring search pattern but adds scoring within each ring.

```javascript
function findMatchTiered(spokenPhrase, scriptWords, currentPosition) {
  const tiers = [
    { start: -5, end: 15, name: 'immediate' },    // Natural reading range
    { start: -15, end: 30, name: 'nearby' },       // Slight jump
    { start: -50, end: 100, name: 'far' }          // Large skip
  ];

  for (const tier of tiers) {
    const searchStart = Math.max(0, currentPosition + tier.start);
    const searchEnd = Math.min(scriptWords.length, currentPosition + tier.end);

    // Find ALL matches in this tier
    const matches = findAllMatchesInRange(spokenPhrase, scriptWords, searchStart, searchEnd);

    if (matches.length > 0) {
      // Return the closest match within this tier
      matches.sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
      return { ...matches[0], tier: tier.name };
    }
  }

  return null;
}
```

### Comparison: Distance-Weighted vs. Tiered

| Aspect | Distance-Weighted | Tiered Search |
|--------|-------------------|---------------|
| Simplicity | More complex scoring | Simpler logic |
| Tuning | Single decay factor | Multiple tier boundaries |
| Edge cases | Smooth degradation | Abrupt tier transitions |
| Repeated phrases | Better disambiguation | Can pick wrong tier |
| Performance | O(searchRadius) | O(searchRadius) but early exit |

**Recommendation:** Use Distance-Weighted Scoring. The continuous scoring function handles repeated phrases better by always preferring the closest viable match, not just "any match in the near tier."

## Confirmed Position Model

### Problem Analysis

The v1.0 implementation conflates two concepts:
- `targetWordIndex`: Where we're scrolling toward (can be speculative)
- `lastMatchedPosition`: A boundary we shouldn't scroll past

But during CONFIDENT state, scrolling still happens based on `targetWordIndex`, which can get ahead of where the user actually is confirmed to be.

**What we need:** A two-position model that separates "confirmed floor" from "candidate ceiling."

### Algorithm: Two-Position Tracking Model

```
ConfirmedPosition: Highest word index where we KNOW the user has been
  - Only advances with high-confidence matches
  - NEVER decreases (monotonic)
  - Scrolling boundary: never scroll past this + small buffer

CandidatePosition: Where we THINK the user currently is
  - Can advance speculatively on medium-confidence matches
  - Can be reset/adjusted when confidence improves
  - Used for match context, not scroll control

ScrollTarget: Visual scroll position
  - Follows CandidatePosition during CONFIDENT state
  - HARD LIMIT: Never exceeds ConfirmedPosition + buffer
```

**Pseudocode:**

```javascript
class PositionTracker {
  constructor() {
    this.confirmedPosition = 0;    // Floor: user definitely reached here
    this.candidatePosition = 0;    // Ceiling: user probably at/near here
    this.confirmationThreshold = 0.85;  // High confidence required
    this.scrollBuffer = 3;         // Words of buffer past confirmed
  }

  // Called when we get a new match result
  updatePosition(matchResult) {
    const { position, confidence, level } = matchResult;

    if (position === null) {
      // No match - don't change positions
      return { confirmed: this.confirmedPosition, candidate: this.candidatePosition };
    }

    // Update candidate position (more permissive)
    if (level === 'high' || level === 'medium') {
      // Only move candidate forward, or allow significant backward jump
      if (position > this.candidatePosition ||
          position < this.confirmedPosition - 10) {  // Intentional skip back
        this.candidatePosition = position;
      }
    }

    // Update confirmed position (strict)
    if (level === 'high' && confidence >= this.confirmationThreshold) {
      // Confirmed position only moves forward, never back
      if (position > this.confirmedPosition) {
        this.confirmedPosition = position;
      }
    }

    return {
      confirmed: this.confirmedPosition,
      candidate: this.candidatePosition,
      maxScroll: this.confirmedPosition + this.scrollBuffer
    };
  }

  // Called by scroll controller to get scroll boundary
  getScrollBoundary() {
    return this.confirmedPosition + this.scrollBuffer;
  }
}
```

### Scroll Control Integration

```javascript
class ScrollController {
  tick() {
    // ... existing speed calculation ...

    // Calculate where we WANT to scroll to (based on candidate)
    const targetScroll = this.positionToPixels(tracker.candidatePosition);

    // Calculate MAXIMUM we're ALLOWED to scroll to (based on confirmed)
    const maxScroll = this.positionToPixels(tracker.getScrollBoundary());

    // Never exceed the boundary
    const actualTarget = Math.min(targetScroll, maxScroll);

    // Smooth scroll toward actual target
    this.scrollToward(actualTarget);
  }
}
```

### Why This Prevents "Getting Ahead"

1. **User says "Four score"** - matches at position 2, confirmedPosition=2
2. **Scroll starts** - limited to position 2+buffer=5
3. **Interim garbage** - candidatePosition might jump to 50, but scroll capped at 5
4. **User says "and seven years"** - matches at position 4, confirmedPosition=4
5. **Scroll can advance** - now limited to position 7

The user experience: scroll follows confirmed speech, never races ahead on false matches.

## Skip Detection

### Problem Analysis

v1.0 uses a simple `maxSkip` threshold: reject any match more than N words away. This fails because:
- A single transient false match shouldn't trigger a skip
- Intentional skips (user skips a paragraph) ARE valid
- Repeated phrases can cause matches exactly at `maxSkip` boundary

**What we need:** Require consecutive confirmation before accepting a skip, and differentiate intentional skips from false matches.

### Algorithm: Consecutive-Word Skip Confirmation

```
For any position change > SKIP_THRESHOLD words:
  1. Don't immediately accept the match
  2. Store as "pending skip" with timestamp
  3. Require N consecutive matches at the new position
  4. Only then accept the skip and update confirmed position
```

**Pseudocode:**

```javascript
class SkipDetector {
  constructor(options = {}) {
    this.skipThreshold = options.skipThreshold || 10;      // Words
    this.requiredConfirmations = options.requiredConfirmations || 2;
    this.confirmationTimeout = options.confirmationTimeout || 2000;  // ms

    this.pendingSkip = null;
    this.confirmationCount = 0;
  }

  checkSkip(newPosition, currentPosition, timestamp) {
    const distance = Math.abs(newPosition - currentPosition);

    // Not a skip - accept immediately
    if (distance <= this.skipThreshold) {
      this.clearPending();
      return {
        accepted: true,
        position: newPosition,
        isSkip: false
      };
    }

    // This is a potential skip - needs confirmation
    if (this.pendingSkip === null || this.pendingSkip.position !== newPosition) {
      // New skip target - start confirmation
      this.pendingSkip = {
        position: newPosition,
        startTime: timestamp,
        distance
      };
      this.confirmationCount = 1;

      return {
        accepted: false,
        position: currentPosition,  // Stay at current position
        pendingSkip: this.pendingSkip,
        reason: 'awaiting_confirmation'
      };
    }

    // Same skip target - check if confirmed
    this.confirmationCount++;

    // Timeout check
    if (timestamp - this.pendingSkip.startTime > this.confirmationTimeout) {
      this.clearPending();
      return {
        accepted: false,
        position: currentPosition,
        reason: 'confirmation_timeout'
      };
    }

    // Confirmation check
    if (this.confirmationCount >= this.requiredConfirmations) {
      const confirmedSkip = this.pendingSkip;
      this.clearPending();
      return {
        accepted: true,
        position: confirmedSkip.position,
        isSkip: true,
        skipDistance: confirmedSkip.distance
      };
    }

    return {
      accepted: false,
      position: currentPosition,
      pendingSkip: this.pendingSkip,
      confirmations: this.confirmationCount,
      required: this.requiredConfirmations,
      reason: 'awaiting_more_confirmations'
    };
  }

  clearPending() {
    this.pendingSkip = null;
    this.confirmationCount = 0;
  }
}
```

### Integration with Matching

```javascript
function processMatch(matchResult) {
  const currentPos = tracker.confirmedPosition;

  // Get distance-weighted best match
  const match = findBestMatch(transcript, scriptWords, currentPos);
  if (!match) return;

  // Check if this is a skip needing confirmation
  const skipResult = skipDetector.checkSkip(match.position, currentPos, Date.now());

  if (skipResult.accepted) {
    tracker.updatePosition({
      position: skipResult.position,
      confidence: match.fuzzyScore,
      level: 'high',
      isSkip: skipResult.isSkip
    });
  } else {
    // Waiting for skip confirmation - don't update position
    console.log(`Skip pending: ${skipResult.reason}`);
  }
}
```

### Bidirectional Skip Handling

```javascript
// Different thresholds for forward vs backward skips
function getSkipThreshold(distance) {
  if (distance > 0) {
    // Forward skip: user skipped ahead in script
    return {
      threshold: 15,              // Allow larger forward skips
      requiredConfirmations: 2,   // But require 2 confirmations
      timeout: 3000              // Give more time to confirm
    };
  } else {
    // Backward skip: user went back to re-read something
    return {
      threshold: 10,              // Smaller threshold for backward
      requiredConfirmations: 3,   // Require MORE confirmations (unusual case)
      timeout: 2000              // Less patience
    };
  }
}
```

## Fuzzy Matching with Position

### Problem Analysis

Fuse.js provides position-agnostic fuzzy matching. It answers "does word X exist in the script?" not "does word X exist NEAR position Y?"

### Algorithm: Position-Constrained Fuzzy Search

Instead of searching the full Fuse.js index, pre-filter to positions within search radius.

```javascript
class PositionalMatcher {
  constructor(scriptWords) {
    this.scriptWords = scriptWords;

    // Create position-indexed structure
    // Map: word -> [positions where it appears]
    this.wordPositions = new Map();
    scriptWords.forEach((word, pos) => {
      const normalized = word.toLowerCase();
      if (!this.wordPositions.has(normalized)) {
        this.wordPositions.set(normalized, []);
      }
      this.wordPositions.get(normalized).push(pos);
    });
  }

  // Find fuzzy matches constrained to a position range
  findInRange(searchWord, startPos, endPos, fuzzyThreshold = 0.7) {
    const results = [];

    // Get all words in range
    for (let pos = startPos; pos < endPos && pos < this.scriptWords.length; pos++) {
      const scriptWord = this.scriptWords[pos];
      const similarity = this.fuzzyCompare(searchWord, scriptWord);

      if (similarity >= fuzzyThreshold) {
        results.push({
          position: pos,
          word: scriptWord,
          similarity
        });
      }
    }

    return results;
  }

  // For repeated phrases: find which occurrence is nearest to current position
  disambiguateRepeated(phrase, currentPosition) {
    const words = tokenize(phrase);
    const firstWord = words[0];

    // Find all occurrences of the first word
    const candidates = this.wordPositions.get(firstWord.toLowerCase()) || [];

    // Score each candidate by:
    // 1. Does the full phrase match at this position?
    // 2. How close is it to current position?
    const scoredCandidates = candidates
      .map(pos => {
        const phraseMatch = this.matchPhraseAt(words, pos);
        if (!phraseMatch.isMatch) return null;

        const distance = Math.abs(pos - currentPosition);
        return {
          position: pos,
          distance,
          phraseScore: phraseMatch.score,
          // Prefer closer matches, all else equal
          combinedScore: phraseMatch.score / (1 + distance * 0.1)
        };
      })
      .filter(c => c !== null);

    // Return closest high-scoring match
    scoredCandidates.sort((a, b) => b.combinedScore - a.combinedScore);
    return scoredCandidates[0] || null;
  }
}
```

### Handling Repeated Phrases

The Gettysburg Address has "we cannot" three times, "the people" three times. Current v1.0 can match the wrong occurrence.

**Solution: Phrase-Level Deduplication with Position Context**

```javascript
function handleRepeatedPhrase(spokenPhrase, scriptWords, currentPosition) {
  const words = tokenize(spokenPhrase);

  // Find ALL positions where this exact phrase appears
  const allOccurrences = findAllPhraseOccurrences(words, scriptWords);

  if (allOccurrences.length <= 1) {
    // Not repeated - use normal matching
    return allOccurrences[0] || null;
  }

  // Multiple occurrences - use position to disambiguate
  // Strategy: Pick the occurrence that makes most sense given current position

  // 1. Filter to occurrences AHEAD of current position (we're moving forward)
  const aheadOccurrences = allOccurrences.filter(pos => pos >= currentPosition);

  if (aheadOccurrences.length > 0) {
    // 2. Pick the NEAREST ahead occurrence
    return Math.min(...aheadOccurrences);
  }

  // 3. No ahead occurrences - user might have jumped back
  // Pick the nearest occurrence (could be behind)
  return allOccurrences.reduce((nearest, pos) => {
    return Math.abs(pos - currentPosition) < Math.abs(nearest - currentPosition)
      ? pos : nearest;
  });
}
```

## Recommended Approach

### Complete Algorithm Integration

```javascript
class PositionTrackingSystem {
  constructor(scriptText) {
    this.scriptWords = tokenize(scriptText);
    this.tracker = new PositionTracker();
    this.skipDetector = new SkipDetector({
      skipThreshold: 10,
      requiredConfirmations: 2
    });
    this.matcher = new PositionalMatcher(this.scriptWords);

    this.options = {
      fuzzyThreshold: 0.7,
      decayFactor: 0.1,
      searchRadius: 50,
      requireConsecutive: 2
    };
  }

  processTranscript(transcript) {
    const currentPosition = this.tracker.confirmedPosition;

    // Step 1: Find best match with positional bias
    const match = this.findBestMatch(transcript, currentPosition);
    if (!match) {
      return {
        status: 'no_match',
        confirmed: this.tracker.confirmedPosition,
        candidate: this.tracker.candidatePosition
      };
    }

    // Step 2: Check if this is a skip needing confirmation
    const skipResult = this.skipDetector.checkSkip(
      match.position,
      currentPosition,
      Date.now()
    );

    if (!skipResult.accepted) {
      return {
        status: 'skip_pending',
        reason: skipResult.reason,
        pendingPosition: match.position,
        confirmed: this.tracker.confirmedPosition,
        candidate: this.tracker.candidatePosition
      };
    }

    // Step 3: Update positions
    const positions = this.tracker.updatePosition({
      position: match.position,
      confidence: match.finalScore,
      level: match.finalScore > 0.7 ? 'high' : 'medium'
    });

    return {
      status: 'matched',
      position: match.position,
      isSkip: skipResult.isSkip,
      confirmed: positions.confirmed,
      candidate: positions.candidate,
      maxScroll: positions.maxScroll
    };
  }

  findBestMatch(transcript, currentPosition) {
    const spokenWords = tokenize(transcript);
    if (spokenWords.length < this.options.requireConsecutive) {
      return null;
    }

    // Take last N words for matching
    const matchWords = spokenWords.slice(-3);

    let bestMatch = null;
    let bestScore = 0;

    const searchStart = Math.max(0, currentPosition - this.options.searchRadius);
    const searchEnd = Math.min(
      this.scriptWords.length,
      currentPosition + this.options.searchRadius
    );

    for (let pos = searchStart; pos <= searchEnd - matchWords.length; pos++) {
      const matchResult = this.matchPhraseAt(matchWords, pos);

      if (matchResult.consecutive >= this.options.requireConsecutive) {
        const distance = pos - currentPosition;
        const effectiveDecay = distance < 0
          ? this.options.decayFactor * 2
          : this.options.decayFactor;
        const positionalWeight = 1 / (1 + Math.abs(distance) * effectiveDecay);
        const finalScore = matchResult.avgScore * positionalWeight;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestMatch = {
            position: pos + matchResult.consecutive - 1,
            fuzzyScore: matchResult.avgScore,
            positionalWeight,
            finalScore,
            distance
          };
        }
      }
    }

    return bestMatch;
  }

  matchPhraseAt(words, startPos) {
    let consecutive = 0;
    let totalScore = 0;

    for (let i = 0; i < words.length && startPos + i < this.scriptWords.length; i++) {
      const score = this.fuzzyCompare(words[i], this.scriptWords[startPos + i]);
      if (score >= this.options.fuzzyThreshold) {
        consecutive++;
        totalScore += score;
      } else {
        break;
      }
    }

    return {
      consecutive,
      avgScore: consecutive > 0 ? totalScore / consecutive : 0
    };
  }

  fuzzyCompare(word1, word2) {
    // Use Levenshtein-based similarity
    const maxLen = Math.max(word1.length, word2.length);
    if (maxLen === 0) return 1;
    const distance = levenshtein(word1.toLowerCase(), word2.toLowerCase());
    return 1 - (distance / maxLen);
  }

  getScrollBoundary() {
    return this.tracker.getScrollBoundary();
  }
}
```

### Implementation Priorities

| Priority | Component | Why |
|----------|-----------|-----|
| 1 | Distance-Weighted Scoring | Fixes positional bias - most impactful change |
| 2 | Two-Position Model | Prevents scroll-ahead - core user experience fix |
| 3 | Skip Confirmation | Prevents false jumps - stability improvement |
| 4 | Repeated Phrase Handling | Handles edge cases - polish |

### Tuning Recommendations

Based on v1.0 testing with Gettysburg Address (270 words):

| Parameter | Recommended Value | Rationale |
|-----------|-------------------|-----------|
| fuzzyThreshold | 0.7 | Balance between tolerance and precision |
| decayFactor | 0.1 | 15 words away = 40% weight reduction |
| searchRadius | 50 | ~20% of script, covers reasonable skips |
| requireConsecutive | 2 | Minimum for confidence, responsive feel |
| skipThreshold | 10 | ~4% of script before requiring confirmation |
| requiredConfirmations | 2 | Quick enough for intentional skips |
| scrollBuffer | 3 | Small lookahead without getting ahead |

## Sources

**Positional Scoring:**
- [Distance matters! Cumulative proximity expansions for ranking documents](https://link.springer.com/article/10.1007/s10791-014-9243-x) - Term proximity scoring theory
- [Algolia Ranking Criteria](https://www.algolia.com/doc/guides/managing-results/relevance-overview/in-depth/ranking-criteria/) - Practical proximity ranking implementation
- [Observable: Distance-weighted proximity score](https://observablehq.com/@abenrob/distance-weighted-proximity-score/2) - Inverse quadratic decay function

**Alignment Algorithms:**
- [Smith-Waterman Algorithm - Wikipedia](https://en.wikipedia.org/wiki/Smith%E2%80%93Waterman_algorithm) - Local sequence alignment
- [Needleman-Wunsch Algorithm - Wikipedia](https://en.wikipedia.org/wiki/Needleman%E2%80%93Wunsch_algorithm) - Global alignment theory
- [Monotonic Alignment for TTS](https://arxiv.org/html/2409.07704v1) - Forward-only alignment constraint

**Fuzzy Matching:**
- [Fuse.js Scoring Theory](https://www.fusejs.io/concepts/scoring-theory.html) - Fuse.js internals
- [Approximate string matching - Wikipedia](https://en.wikipedia.org/wiki/Approximate_string_matching) - Fuzzy search algorithms
- [Hypothesis Fuzzy Anchoring](https://web.hypothes.is/blog/fuzzy-anchoring/) - Position-aware text anchoring

**Skip Detection:**
- [Speech recognition error detection - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3043851/) - Confidence-based error detection
- [Word confidence for speech recognition](https://www.sciencedirect.com/science/article/abs/pii/S0885230899901262) - Verification approaches

**Commercial Implementations:**
- [Autoscript Voice](https://autoscript.tv/voice/) - "Proprietary algorithms with advanced pattern matching"
- [PromptSmart VoiceTrack](https://promptsmart.com/) - "Stops when you pause or improvise"

---
*Algorithm research for: Voice-controlled teleprompter position tracking rewrite*
*Researched: 2026-01-24*
