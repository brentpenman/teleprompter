# Phase 6: PositionTracker - Research

**Researched:** 2026-01-24
**Domain:** Stateful position confirmation with monotonic advancement and skip detection
**Confidence:** HIGH

## Summary

This phase implements PositionTracker, the stateful component that owns `confirmedPosition` as the single source of truth. It receives match candidates from the stateless WordMatcher (Phase 5) and decides when to advance position based on confidence thresholds and consecutive-word confirmation for skips.

The key architectural insight is the two-position model: a `confirmedPosition` (floor) that only moves forward on high-confidence matches, and a `candidatePosition` (ceiling) that can explore ahead tentatively. This creates a stable reference for ScrollController while allowing the system to detect skips without jumping prematurely.

For skip detection, the pattern is distance-dependent confirmation: small skips (10-30 words) require 4 consecutive matches, while large skips (50+ words) require 5-6 consecutive matches. This prevents false jumps on repeated phrases while still allowing intentional navigation.

**Primary recommendation:** Implement PositionTracker as a stateful class with `confirmedPosition` and `candidatePosition` properties. Expose `processMatch(candidate)` that applies confirmation logic and `getConfirmedPosition()` for ScrollController. Use the consecutive-match-streak pattern for skip confirmation.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native ES Modules | - | Class-based state management | No external dependencies needed |
| Jest | 29.x | Unit testing | Already configured from Phase 5 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| WordMatcher (Phase 5) | - | Provides match candidates | Always - upstream in pipeline |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom state class | XState/state machine library | XState adds complexity; our state is simple (confirmed vs exploring), not a full FSM |
| Class with methods | Functional reducer pattern | Class is more intuitive for stateful tracking with internal counters |

**Installation:**
```bash
# No new dependencies needed
```

## Architecture Patterns

### Recommended Module Structure
```
matching/
├── WordMatcher.js        # EXISTING: Stateless matching (Phase 5)
├── WordMatcher.test.js   # EXISTING: Tests for WordMatcher
├── PositionTracker.js    # NEW: Stateful position management (this phase)
├── PositionTracker.test.js # NEW: Tests for PositionTracker
├── textUtils.js          # EXISTING: Tokenization, normalization
└── Highlighter.js        # EXISTING: CSS Custom Highlight API
```

### Pattern 1: Two-Position Model (Floor + Ceiling)
**What:** Maintain two internal positions - `confirmedPosition` (stable, only moves forward on high confidence) and `candidatePosition` (exploratory, tracks potential matches)
**When to use:** Always - this is the architectural requirement (POS-02)
**Why:** Separating confirmed from candidate allows exploring potential skips without losing the stable position. If the candidate doesn't confirm within a threshold, we fall back to confirmed.

**Example:**
```javascript
// Source: CONTEXT.md decisions + REQUIREMENTS.md (POS-01, POS-02)
class PositionTracker {
  constructor() {
    // Floor: stable position that only moves forward on confirmation
    this.confirmedPosition = 0;

    // Ceiling: exploratory position tracking potential matches
    this.candidatePosition = 0;

    // Streak tracking for skip confirmation
    this.consecutiveMatchCount = 0;
    this.streakStartPosition = null;
  }

  getConfirmedPosition() {
    return this.confirmedPosition;
  }

  getScrollBoundary() {
    // External code can query this for scroll limits
    return this.confirmedPosition;
  }
}
```

### Pattern 2: Confidence Threshold with Distance Scaling
**What:** Apply different confidence thresholds based on distance from current position
**When to use:** When deciding whether to accept a match (POS-03)
**Why (from CONTEXT.md):** "Nearby matches need less confidence than distant matches (~10 words = easier threshold)"

**Example:**
```javascript
// Source: CONTEXT.md confirmation threshold decisions
const NEARBY_THRESHOLD = 10;  // words
const BASE_CONFIDENCE_THRESHOLD = 0.7;
const DISTANT_CONFIDENCE_BONUS = 0.1;

function shouldAcceptMatch(candidate, currentPosition) {
  const distance = Math.abs(candidate.position - currentPosition);

  // Nearby matches: easier threshold
  if (distance <= NEARBY_THRESHOLD) {
    return candidate.combinedScore >= BASE_CONFIDENCE_THRESHOLD;
  }

  // Distant matches: need higher confidence
  return candidate.combinedScore >= BASE_CONFIDENCE_THRESHOLD + DISTANT_CONFIDENCE_BONUS;
}
```

### Pattern 3: Consecutive Match Streak for Skip Confirmation
**What:** Track consecutive matching words at a new position before confirming a skip
**When to use:** When match candidate is significantly ahead of confirmed position (SKIP-01)
**Why:** Prevents false jumps on repeated phrases. Distance-weighted scoring helps, but consecutive confirmation provides additional safety.

**Example:**
```javascript
// Source: CONTEXT.md skip behavior decisions
const SMALL_SKIP_THRESHOLD = 10;  // words
const LARGE_SKIP_THRESHOLD = 50;  // words
const SMALL_SKIP_CONSECUTIVE = 4;
const LARGE_SKIP_CONSECUTIVE = 5;

function getRequiredConsecutive(distance) {
  if (distance < SMALL_SKIP_THRESHOLD) {
    return 1;  // Normal tracking, single high-confidence match is enough
  }
  if (distance < LARGE_SKIP_THRESHOLD) {
    return SMALL_SKIP_CONSECUTIVE;  // 4 consecutive for 10-50 word skips
  }
  return LARGE_SKIP_CONSECUTIVE;  // 5-6 consecutive for large skips
}

function processMatch(candidate) {
  const distance = candidate.position - this.confirmedPosition;

  // Ignore backward matches entirely (POS-04, SKIP-02)
  if (distance < 0) {
    return;
  }

  const requiredConsecutive = getRequiredConsecutive(distance);

  if (this.isConsecutiveWithPrevious(candidate)) {
    this.consecutiveMatchCount++;
  } else {
    // New streak starting at this position
    this.consecutiveMatchCount = 1;
    this.streakStartPosition = candidate.startPosition;
  }

  if (this.consecutiveMatchCount >= requiredConsecutive) {
    // Confirmed! Advance position
    this.confirmedPosition = candidate.position;
    this.candidatePosition = candidate.position;
    this.resetStreak();
  } else {
    // Tentatively track as candidate
    this.candidatePosition = candidate.position;
  }
}
```

### Pattern 4: Monotonic Constraint (Forward-Only)
**What:** `confirmedPosition` only ever increases, never decreases
**When to use:** Always - this is the architectural requirement (POS-04)
**Why (from CONTEXT.md):** "Hold position when user reads earlier content - no automatic backward movement"

**Example:**
```javascript
// Source: REQUIREMENTS.md (POS-04), CONTEXT.md backward handling
function advanceConfirmedPosition(newPosition) {
  // Monotonic constraint: only move forward
  if (newPosition > this.confirmedPosition) {
    this.confirmedPosition = newPosition;
    return true;  // Position advanced
  }
  return false;  // Position held
}
```

### Pattern 5: Silent Hold with Auto-Resume
**What:** When user speaks earlier content, hold position silently. Resume when speech matches near held position again.
**When to use:** When receiving backward matches (CONTEXT.md backward handling)
**Why:** No visual indicator needed - the position simply doesn't move. When user returns to near confirmed position, normal tracking resumes.

**Example:**
```javascript
// Source: CONTEXT.md backward handling decisions
const RESUME_THRESHOLD = 5;  // words - how close to confirmedPosition to auto-resume

function processMatch(candidate) {
  const distance = candidate.position - this.confirmedPosition;

  if (distance < 0) {
    // Backward match - hold silently, don't update anything
    // No visual indicator needed per CONTEXT.md
    return { action: 'hold', reason: 'backward' };
  }

  if (distance <= RESUME_THRESHOLD) {
    // Near confirmed position - normal tracking resumes automatically
    // No special handling needed - just process as normal
  }

  // ... normal forward processing
}
```

### Anti-Patterns to Avoid
- **Automatic backward jumps:** Never move confirmedPosition backward automatically (SKIP-02)
- **Single-word skip confirmation:** Always require consecutive matches for skips (SKIP-01)
- **State machine complexity:** Don't add CONFIDENT/UNCERTAIN/OFF_SCRIPT states - that's v1.0's over-engineering (REQUIREMENTS.md Out of Scope)
- **Scroll handling in PositionTracker:** Don't control scroll - that's ScrollController's job (ARCH-03)
- **Storing match history:** Don't keep a buffer of past matches - only track current streak

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Match quality scoring | Custom scoring | WordMatcher.combinedScore | Already computed by Phase 5 with distance weighting |
| Fuzzy matching | Levenshtein | WordMatcher via Fuse.js | Already implemented in Phase 5 |
| Character offsets | Manual tracking | WordMatcher.startOffset/endOffset | Already tracked by Phase 5 for highlighting |
| State persistence | LocalStorage | In-memory only | Reset is fine for teleprompter use case |

**Key insight:** PositionTracker is pure state management. All matching complexity is in WordMatcher. Keep PositionTracker focused on position confirmation logic only.

## Common Pitfalls

### Pitfall 1: Premature Skip Confirmation
**What goes wrong:** Position jumps to a distant match after just 1-2 matching words, then jumps back when user continues at original position
**Why it happens:** Not requiring enough consecutive matches before confirming skip
**How to avoid:**
- Distance-dependent consecutive requirements (4 for 10-30 words, 5-6 for 50+ words)
- Reset streak counter when matches are not consecutive
- Only update confirmedPosition when streak threshold is met
**Warning signs:** Position "flickers" between two locations; repeated phrases cause jumps

### Pitfall 2: Stuck Position on Paraphrasing
**What goes wrong:** User paraphrases slightly and position never advances
**Why it happens:** Confidence threshold too strict; not leveraging WordMatcher's fuzzy matching
**How to avoid:**
- Use WordMatcher's combinedScore which already factors in fuzzy match quality
- Set confidence threshold around 0.7 (not 0.9+)
- Test with real speech recognition output, not perfect text
**Warning signs:** Position stays stuck even when user is clearly speaking on-script

### Pitfall 3: Complex State Machine
**What goes wrong:** Adding states like TRACKING/HOLDING/SKIPPING makes code hard to reason about
**Why it happens:** Over-engineering from v1.0 patterns (CONFIDENT/UNCERTAIN/OFF_SCRIPT)
**How to avoid:**
- Only track two values: confirmedPosition and candidatePosition
- Use simple if/else logic for confirmation, not state transitions
- Avoid onStateChange callbacks and state enums
**Warning signs:** Multiple state variables, transition tables, callback chains

### Pitfall 4: Scroll Coupling
**What goes wrong:** PositionTracker directly updates scroll position or DOM
**Why it happens:** Confusion about component boundaries
**How to avoid:**
- PositionTracker only exposes `getConfirmedPosition()` and `getScrollBoundary()`
- ScrollController (Phase 7) polls or subscribes to position changes
- No references to DOM, container, or scroll in PositionTracker
**Warning signs:** Import of DOM APIs, scrollTop references, requestAnimationFrame

### Pitfall 5: Losing Track of Consecutive Matches
**What goes wrong:** Streak counter resets incorrectly, never reaching required threshold
**Why it happens:** Not properly detecting "consecutive" matches
**How to avoid:**
- Track `streakStartPosition` and `lastMatchPosition`
- Match is consecutive if `candidate.startPosition === lastMatchEndPosition + 1` or close
- Allow for small gaps (1-2 words) due to filler word filtering
**Warning signs:** Skip detection never triggers; always stuck at "waiting for consecutive"

## Code Examples

Verified patterns combining research and context decisions:

### Complete PositionTracker Interface
```javascript
// Source: REQUIREMENTS.md + CONTEXT.md decisions
/**
 * PositionTracker - Stateful Position Management
 *
 * Owns confirmedPosition as single source of truth.
 * Receives match candidates from WordMatcher.
 * Applies confirmation logic for position advancement.
 *
 * @module PositionTracker
 */

/**
 * @typedef {Object} MatchCandidate
 * @property {number} position - End word index of match
 * @property {number} startPosition - Start word index of match
 * @property {number} matchCount - Number of words matched
 * @property {number} combinedScore - Score from WordMatcher (0-1, higher=better)
 * @property {number} startOffset - Character offset for highlighting
 * @property {number} endOffset - Character offset for highlighting
 */

/**
 * @typedef {Object} ProcessResult
 * @property {'advanced'|'hold'|'exploring'} action - What happened
 * @property {number} confirmedPosition - Current confirmed position
 * @property {number} [candidatePosition] - Current candidate position (if exploring)
 */

export class PositionTracker {
  /**
   * @param {Object} options
   * @param {number} [options.confidenceThreshold=0.7] - Minimum score to accept match
   * @param {number} [options.nearbyThreshold=10] - Words considered "nearby"
   * @param {number} [options.smallSkipConsecutive=4] - Consecutive matches for small skip
   * @param {number} [options.largeSkipConsecutive=5] - Consecutive matches for large skip
   */
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? 0.7;
    this.nearbyThreshold = options.nearbyThreshold ?? 10;
    this.smallSkipConsecutive = options.smallSkipConsecutive ?? 4;
    this.largeSkipConsecutive = options.largeSkipConsecutive ?? 5;

    // Position state
    this.confirmedPosition = 0;
    this.candidatePosition = 0;

    // Streak tracking for skip confirmation
    this.consecutiveMatchCount = 0;
    this.lastMatchEndPosition = -1;
  }

  /**
   * Get confirmed position (single source of truth for scroll boundary)
   */
  getConfirmedPosition() {
    return this.confirmedPosition;
  }

  /**
   * Get scroll boundary for external code
   * Returns confirmedPosition - ScrollController should never scroll past this
   */
  getScrollBoundary() {
    return this.confirmedPosition;
  }

  /**
   * Process a match candidate from WordMatcher
   * @param {MatchCandidate} candidate - Match candidate from WordMatcher
   * @returns {ProcessResult} What action was taken
   */
  processMatch(candidate) {
    if (!candidate || candidate.combinedScore < this.confidenceThreshold) {
      // Low confidence - ignore
      return { action: 'hold', confirmedPosition: this.confirmedPosition };
    }

    const distance = candidate.position - this.confirmedPosition;

    // Backward matches: hold silently (POS-04, SKIP-02)
    if (distance < 0) {
      return { action: 'hold', confirmedPosition: this.confirmedPosition };
    }

    // Check if this match is consecutive with previous
    const isConsecutive = this.isConsecutiveMatch(candidate);

    if (isConsecutive) {
      this.consecutiveMatchCount++;
    } else {
      // New streak
      this.consecutiveMatchCount = 1;
    }
    this.lastMatchEndPosition = candidate.position;

    // Determine required consecutive matches based on distance
    const required = this.getRequiredConsecutive(distance);

    if (this.consecutiveMatchCount >= required) {
      // Confirmed! Advance position
      this.confirmedPosition = candidate.position;
      this.candidatePosition = candidate.position;
      this.resetStreak();

      return {
        action: 'advanced',
        confirmedPosition: this.confirmedPosition
      };
    } else {
      // Exploring potential skip
      this.candidatePosition = candidate.position;

      return {
        action: 'exploring',
        confirmedPosition: this.confirmedPosition,
        candidatePosition: this.candidatePosition,
        consecutiveCount: this.consecutiveMatchCount,
        requiredCount: required
      };
    }
  }

  /**
   * Check if candidate is consecutive with previous match
   * Allows small gap for filler word filtering
   */
  isConsecutiveMatch(candidate) {
    if (this.lastMatchEndPosition < 0) return false;

    // Allow gap of up to 2 words (filler words may be filtered)
    const gap = candidate.startPosition - this.lastMatchEndPosition - 1;
    return gap >= 0 && gap <= 2;
  }

  /**
   * Get required consecutive matches based on skip distance
   */
  getRequiredConsecutive(distance) {
    if (distance <= this.nearbyThreshold) {
      return 1;  // Normal tracking
    }
    if (distance <= 50) {
      return this.smallSkipConsecutive;  // 4 for 10-50 words
    }
    return this.largeSkipConsecutive;  // 5-6 for 50+ words
  }

  resetStreak() {
    this.consecutiveMatchCount = 0;
    this.lastMatchEndPosition = -1;
  }

  reset() {
    this.confirmedPosition = 0;
    this.candidatePosition = 0;
    this.resetStreak();
  }
}
```

### Integration with WordMatcher
```javascript
// Source: Pipeline architecture from STATE.md
import { createMatcher, findMatches } from './WordMatcher.js';
import { PositionTracker } from './PositionTracker.js';

// Setup
const matcher = createMatcher(scriptText);
const positionTracker = new PositionTracker();

// On each speech recognition result
function onSpeechResult(transcript) {
  const currentPosition = positionTracker.getConfirmedPosition();

  // WordMatcher finds candidates
  const result = findMatches(transcript, matcher, currentPosition);

  if (result.bestMatch) {
    // PositionTracker decides whether to advance
    const action = positionTracker.processMatch(result.bestMatch);

    // ScrollController (Phase 7) will query positionTracker.getScrollBoundary()
  }
}
```

### Testing Pattern
```javascript
// Source: Jest patterns from Phase 5
import { PositionTracker } from './PositionTracker.js';

describe('PositionTracker', () => {
  describe('monotonic constraint', () => {
    it('only moves forward, never backward', () => {
      const tracker = new PositionTracker();

      // Advance to position 10
      tracker.processMatch({ position: 10, startPosition: 8, combinedScore: 0.9 });
      expect(tracker.getConfirmedPosition()).toBe(10);

      // Backward match should be ignored
      tracker.processMatch({ position: 5, startPosition: 3, combinedScore: 0.95 });
      expect(tracker.getConfirmedPosition()).toBe(10);  // Still 10
    });
  });

  describe('skip confirmation', () => {
    it('requires consecutive matches for large skips', () => {
      const tracker = new PositionTracker({ smallSkipConsecutive: 4 });

      // At position 0, candidate at position 25 (skip of 25 words)
      tracker.processMatch({ position: 25, startPosition: 23, combinedScore: 0.9 });
      expect(tracker.getConfirmedPosition()).toBe(0);  // Not yet confirmed

      // More consecutive matches
      tracker.processMatch({ position: 26, startPosition: 24, combinedScore: 0.9 });
      tracker.processMatch({ position: 27, startPosition: 25, combinedScore: 0.9 });
      expect(tracker.getConfirmedPosition()).toBe(0);  // Still waiting

      // 4th consecutive match confirms the skip
      tracker.processMatch({ position: 28, startPosition: 26, combinedScore: 0.9 });
      expect(tracker.getConfirmedPosition()).toBe(28);  // Now confirmed
    });
  });
});
```

## State of the Art

| Old Approach (v1.0) | Current Approach (v1.1) | Reason for Change |
|---------------------|-------------------------|-------------------|
| State machine (CONFIDENT/UNCERTAIN/OFF_SCRIPT) | Simple two-position model | Over-engineered; complex transitions added bugs |
| Dwell time confirmation | Consecutive match confirmation | Dwell time is time-based; consecutive is content-based and more reliable |
| Position stored in TextMatcher | Position owned by PositionTracker | Single source of truth principle |
| Backward auto-jump allowed | Forward-only monotonic | Backward jumps caused confusion; manual override if needed |
| Confidence levels (high/medium/low) | Continuous score + threshold | Simpler, avoids arbitrary category boundaries |

**Deprecated/outdated:**
- `ConfidenceLevel.js`: Scoring now in WordMatcher.combinedScore; PositionTracker uses simple threshold
- `ScrollSync.js` state tracking: Position state moves to PositionTracker; scroll state to ScrollController (Phase 7)

## Open Questions

Things that couldn't be fully resolved:

1. **Exact confidence threshold value**
   - What we know: 0.7 is reasonable starting point
   - What's unclear: May need tuning based on real speech recognition quality
   - Recommendation: Make configurable, start with 0.7, tune during integration

2. **Gap tolerance in consecutive matching**
   - What we know: Allow 1-2 word gaps for filler filtering
   - What's unclear: Exact gap that still counts as "consecutive"
   - Recommendation: Start with gap <= 2, verify with real speech data

3. **Large skip confirmation count (5 vs 6)**
   - What we know: CONTEXT.md says "Claude's discretion (5-6 words)"
   - What's unclear: Whether 5 or 6 is better for repeated-phrase safety
   - Recommendation: Start with 5, increase to 6 if false skips observed

4. **Manual scroll interaction**
   - What we know: Phase 7/8 concern, not Phase 6
   - What's unclear: Should manual scroll reset confirmedPosition or pause tracking?
   - Recommendation: Defer to Phase 7; PositionTracker doesn't know about scroll

## Sources

### Primary (HIGH confidence)
- Phase 5 WordMatcher.js - Verified API and MatchCandidate structure
- Phase 5 05-RESEARCH.md - Architecture patterns and distance-weighted scoring
- CONTEXT.md (06-CONTEXT.md) - User decisions on thresholds and behavior
- REQUIREMENTS.md - POS-01 through POS-04, SKIP-01, SKIP-02, ARCH-02
- STATE.md - Pipeline architecture decisions

### Secondary (MEDIUM confidence)
- [Deep SORT Tracking Concepts](https://www.ikomia.ai/blog/deep-sort-object-tracking-guide) - Track confirmation pattern (consecutive frames before confirming)
- [State Machines in JavaScript](https://jonbellah.com/articles/intro-state-machines) - When to use vs when to keep simple
- [PromptSmart](https://promptsmart.com/) - Commercial teleprompter with voice tracking (validates use case)

### Tertiary (LOW confidence)
- WebSearch results for position tracking algorithms - General patterns, not speech-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries needed; patterns from Phase 5
- Architecture: HIGH - Two-position model is well-defined in CONTEXT.md; requirements are clear
- Pitfalls: HIGH - Based on v1.0 experience and CONTEXT.md warnings about repeated phrases
- Threshold values: MEDIUM - Starting points are reasonable but may need tuning

**Research date:** 2026-01-24
**Valid until:** 2026-04-24 (90 days - patterns are stable, implementation is custom)
