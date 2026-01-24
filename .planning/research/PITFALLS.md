# Position-Tracking Pitfalls

**Domain:** Voice-controlled teleprompter position tracking
**Researched:** 2026-01-24
**Mode:** Pitfalls analysis for v1.1 rewrite

## Executive Summary

Position tracking for voice-controlled teleprompters fails in predictable ways. The core tension: the system must be responsive enough to follow natural speech but conservative enough to avoid false jumps. v1.0 got this wrong by adding complexity (state machines, confidence thresholds, dwell times, skip detection) instead of simplifying the fundamental model.

**The key insight:** Most pitfalls stem from treating position tracking as a *prediction* problem rather than a *confirmation* problem. When you try to predict where the user *will be*, you inevitably get ahead of them. When you confirm where the user *is*, you stay in sync.

---

## v1.0 Failure Analysis

### What Failed

Looking at the v1.0 implementation (`TextMatcher.js`, `ScrollSync.js`, `ConfidenceLevel.js`), several design decisions created compounding problems:

**1. Speculative Position Updates**

v1.0 updated `currentPosition` immediately on match detection, then tried to constrain scroll with `lastMatchedPosition`. This creates two position concepts that can diverge:
- `currentPosition` (where we think the user is)
- `lastMatchedPosition` (where we've confirmed)

The scroll logic tried to "never scroll past boundary" but the boundary itself moved speculatively.

**2. Confidence as a Gate, Not a Signal**

v1.0 used confidence to decide whether to *accept* a match (gate), rather than how *far* to act on it (signal). Binary accept/reject means:
- High confidence: accept position, scroll
- Not high enough: reject position, coast

This creates jerky behavior - you're either tracking or not.

**3. State Machine Abstraction Mismatch**

`ScrollState.CONFIDENT/UNCERTAIN/OFF_SCRIPT` doesn't match the user's mental model. Users think:
- "I'm speaking and it's following" or "I'm speaking and it's lost"
- "I paused" or "I'm ad-libbing"

The state machine tried to infer these from confidence levels, adding latency and error.

**4. Parameter Explosion**

v1.0 ended up with 15+ tunable parameters:
- `threshold` (match quality)
- `highThreshold`, `lowThreshold` (confidence levels)
- `matchScoreWeight`, `consecutiveWeight`, `recencyWeight` (confidence weights)
- `patientThreshold`, `silenceThreshold` (timing)
- `matchDwellTime` (confirmation delay)
- `shortSkipThreshold`, `longSkipThreshold`, `maxSkip` (skip detection)
- `forwardSkipConfidence`, `backwardSkipConfidence` (skip thresholds)
- `behindThreshold`, `aheadThreshold`, `behindMax` (position adjustment)
- `accelerationTimeConstant`, `decelerationTimeConstant`, `resumeTimeConstant` (easing)

Each parameter was added to fix a specific edge case, but the interactions between parameters created new edge cases.

**5. Equal-Weight Position Search**

`searchRangeWithScore` searched in priority order (near, wide-back, far-forward, far-backward) but once a match was found, position didn't affect confidence. A match 100 words away got the same treatment as a match 3 words away if both had the same Fuse.js score.

### Why It Seemed Reasonable

Each v1.0 decision made local sense:
- State machine: "Professional pattern for complex behavior"
- Confidence levels: "Three states are better than two"
- Dwell time: "Prevents false jumps"
- Skip detection: "Handles intentional jumps"

The problem: these are solutions for *different* problems that don't compose well. A state machine for a simple behavior is over-engineering. Confidence levels without positional weighting are incomplete. Dwell time adds latency to the critical path. Skip detection is unnecessary if you have strong positional bias.

---

## Common Mistakes

### 1. Over-Engineering Confidence

**What the mistake looks like:**

Building elaborate confidence calculations with multiple weighted factors, thresholds, and decay functions.

```javascript
// v1.0 approach - too complex
const rawConfidence =
  (matchQuality * 0.5) +
  (consecutiveRatio * 0.3) +
  (recencyFactor * 0.2);
```

**Why it seems reasonable:**

"More signals = better decisions. We should consider match quality, how many words matched, and how recent the match is."

**Why it fails:**

1. The weights are arbitrary and interdependent
2. Tuning one weight affects the effective contribution of others
3. The *combination* of factors doesn't correspond to anything meaningful
4. Edge cases require adding more factors, making the system harder to understand

**Prevention:**

Confidence should primarily reflect *positional plausibility*, not match quality. A high-quality match 200 words away is suspicious. A mediocre match 2 words away is probably right.

```javascript
// Simpler: position-weighted confidence
const positionFactor = 1 / (1 + distance * 0.1);  // Nearby = high, far = low
const matchFactor = 1 - fuseScore;  // Quality matters less
const confidence = positionFactor * matchFactor;
```

**Connection to v1.0 failures:**

v1.0's `ConfidenceCalculator` combined match quality, consecutive ratio, and recency with fixed weights. The result was "too sensitive AND not sensitive enough" - high-quality matches far away got high confidence (false jumps), while mediocre matches nearby got medium confidence (stuttering).

---

### 2. Predictive vs. Reactive Scrolling

**What the mistake looks like:**

Scroll logic that tries to anticipate where the user will be, rather than following where they are.

```javascript
// Predictive: scroll toward expected position
this.targetWordIndex = matchResult.position;  // Update immediately
// Scroll animation tries to catch up

// The problem: targetWordIndex is already "ahead"
// Even without scrolling, the mental model is corrupted
```

**Why it seems reasonable:**

"Smooth scrolling needs a target. If we wait until we're certain, scrolling will feel laggy."

**Why it fails:**

1. "Anticipated position" is often wrong
2. When wrong, the display gets ahead of the user
3. Display being ahead breaks the fundamental contract: "next words at caret"
4. Recovery requires scrolling *backward*, which feels unnatural

**Prevention:**

Adopt a "confirmed position" model:
- Only one position concept: where the user has *confirmed* they are
- Scroll is purely reactive to confirmed position changes
- If uncertain, *hold*, don't coast forward
- Scroll speed is derived from *observed* speaking pace, not predicted

```javascript
// Reactive: only update on confirmed match
if (match.confidence > threshold) {
  this.confirmedPosition = match.position;
  // Scroll follows confirmedPosition, never ahead of it
}
```

**Connection to v1.0 failures:**

v1.0 had `targetWordIndex` (speculative) and `lastMatchedPosition` (confirmed) but the scroll logic used `targetWordIndex` primarily. The boundary constraint (`never scroll past lastMatchedPosition`) was a band-aid on a fundamental model problem.

---

### 3. Ignoring Positional Context

**What the mistake looks like:**

Matching algorithms that search the entire script with equal weight, then try to filter results by distance.

```javascript
// v1.0 approach: search in priority order, but don't weight by position
let result = this.searchRangeWithScore(nearStart, nearEnd, window);
if (!result) {
  result = this.searchRangeWithScore(wideBackStart, nearStart, window);
}
// Once found, position doesn't affect confidence
```

**Why it seems reasonable:**

"We prioritize nearby matches by checking them first. Isn't that positional bias?"

**Why it fails:**

1. Search order isn't the same as scoring weight
2. If the first search finds nothing, you fall through to increasingly desperate searches
3. A match found in "far-forward range" gets the same confidence as one found nearby
4. Common words/phrases exist multiple times in scripts - search order doesn't disambiguate

**Prevention:**

Positional context should be *intrinsic* to match scoring, not just search order:

```javascript
// Position-weighted matching
function scoreMatch(candidate, currentPosition) {
  const distance = Math.abs(candidate.index - currentPosition);
  const fuseScore = candidate.score;  // 0 = perfect

  // Nearby matches get bonus; distant matches get penalty
  const positionPenalty = distance * 0.05;  // Each word away costs 5%

  return (1 - fuseScore) * (1 - positionPenalty);
}
```

**Connection to v1.0 failures:**

v1.0's "repeated phrases caused false jumps" because the phrase "we cannot" appears 3x in Gettysburg within ~15 words. With equal-weight matching, any of the three could win. With strong positional bias, the *next* occurrence wins.

---

### 4. Parameter Explosion

**What the mistake looks like:**

Each edge case gets its own tunable parameter, creating a web of interdependent knobs.

| Edge Case | Parameter Added |
|-----------|-----------------|
| Jumpy matches | `matchDwellTime` |
| Slow response | `silenceThreshold` |
| False skips | `maxSkip`, `forwardSkipConfidence` |
| Backward jumps | `backwardSkipConfidence` |
| Getting ahead | `aheadThreshold` |
| Falling behind | `behindThreshold`, `behindMax` |
| State transitions | `patientThreshold` |

**Why it seems reasonable:**

"This specific edge case needs a specific fix. Adding a parameter lets users tune it."

**Why it fails:**

1. Parameters interact in unexpected ways (changing dwell time affects skip detection timing)
2. Users can't understand what parameters do or how to tune them
3. Default values become critical but are chosen arbitrarily
4. Each new parameter multiplies the testing surface

**Prevention:**

Derive behavior from fewer, more fundamental choices:

1. **Speaking pace** (observed) - derives scroll speed
2. **Positional bias strength** (one knob) - affects how strongly to prefer nearby matches
3. **Confirmation delay** (one knob) - trades responsiveness for stability

Everything else should be derived or hardcoded.

**Connection to v1.0 failures:**

v1.0 ended up with a debug tuning panel exposing 8+ parameters because no one parameter could be set correctly without affecting others. The "tuning nightmare" is a symptom of parameter explosion.

---

### 5. State Machine Complexity

**What the mistake looks like:**

Using a state machine for behavior that isn't naturally stateful.

```javascript
// v1.0: States that don't map to user perception
export const ScrollState = {
  CONFIDENT: 'confident',     // System thinks it knows position
  UNCERTAIN: 'uncertain',     // System is losing track
  OFF_SCRIPT: 'off_script'   // System has lost track
};
```

**Why it seems reasonable:**

"State machines are a clean pattern for behavior that changes based on context. We need different behavior when confident vs. uncertain."

**Why it fails:**

1. The states represent *system* confidence, not *user* state
2. User state (speaking on-script, paused, ad-libbing) is what actually matters
3. Mapping system confidence to user state requires heuristics that are often wrong
4. State transitions add latency (must be uncertain for X ms before going off-script)

**Prevention:**

If you need states, make them reflect *user* behavior, not system assessment:

```javascript
// Better: States that reflect user behavior
const UserState = {
  SPEAKING_ON_SCRIPT: 'speaking',  // We're matching
  PAUSED: 'paused',                // No audio input
  AD_LIBBING: 'ad-libbing'         // Audio input, no matches
};
```

Or: Don't use a state machine at all. Just react to match results directly:
- Match found: scroll to match (with positional weighting)
- No match: hold position
- No audio: hold position

**Connection to v1.0 failures:**

v1.0's state machine drove the "too sensitive AND not sensitive enough" problem. When uncertain, it slowed scrolling. When off-script, it stopped. But the transitions between states were based on confidence thresholds and timing, not on actual user behavior. The user would pause for 0.5 seconds (uncertain) then continue (confident again) - causing visible scroll speed oscillation.

---

### 6. Fuzzy Matching Without Boundaries

**What the mistake looks like:**

Using fuzzy matching (Fuse.js) with a single threshold applied globally.

```javascript
this.threshold = 0.3;  // Same threshold everywhere
// A 0.3 match on "the" is meaningless
// A 0.3 match on "Gettysburg" is significant
```

**Why it seems reasonable:**

"Fuse.js handles paraphrasing. A threshold of 0.3 catches most variations."

**Why it fails:**

1. Short common words match everything ("the", "and", "we")
2. Long unique words need less fuzzy matching
3. A single threshold can't be right for both cases
4. Fuse.js scores aren't calibrated to meaning

**Prevention:**

Either:
1. Match on phrases, not words (reduces common-word noise)
2. Use word-length-adjusted thresholds
3. Require consecutive matches to confirm position

```javascript
// Word-length adjusted threshold
function getThreshold(word) {
  if (word.length <= 3) return 0.1;  // Short words: near-exact
  if (word.length <= 6) return 0.25; // Medium words
  return 0.4;                         // Long words: more tolerance
}
```

**Connection to v1.0 failures:**

v1.0's `minConsecutiveMatches: 2` helped but wasn't enough. Phrases like "that we" could match in multiple places. The combination of fuzzy + no positional bias meant common short words dominated matching behavior.

---

### 7. Treating All Directions Equally

**What the mistake looks like:**

Symmetric handling of forward and backward movement.

```javascript
// v1.0: Different thresholds, but still searched backward
this.forwardSkipConfidence = 0.85;
this.backwardSkipConfidence = 0.92;  // Higher, but still allowed
```

**Why it seems reasonable:**

"Users might skip backward. We should support that."

**Why it fails:**

1. Backward skips are rare in natural reading
2. Backward matches are usually errors (repeated phrases)
3. High threshold isn't enough - the match exists and might clear it
4. Allowing backward at all creates a failure mode

**Prevention:**

Make backward movement an explicit user action, not an automatic behavior:
- Forward: automatic with positional bias
- Backward: only via manual override (click, button, voice command)

Or: Require much stronger evidence for backward (consecutive match must span across the "jump back" point).

**Connection to v1.0 failures:**

v1.0's backward skip detection with high threshold still allowed backward jumps when repeated phrases had high match quality. The failure mode: user says "we cannot" (first occurrence), system matches "we cannot" (third occurrence later in script), then matches second occurrence backward.

---

### 8. Animation Hiding Logical Problems

**What the mistake looks like:**

Smooth scroll animations that mask jumpy underlying position logic.

```javascript
// Smooth easing to target
this.currentSpeed = this.easeToward(
  this.currentSpeed, targetSpeed, deltaMs, timeConstant
);
```

**Why it seems reasonable:**

"Users want smooth scrolling. Animation makes everything feel better."

**Why it fails:**

1. The target position might be wrong - smoothly scrolling to wrong position is still wrong
2. Animation adds latency between decision and visible effect
3. When the target changes rapidly, animation creates oscillation
4. Debugging is harder because you can't see the logical jumps

**Prevention:**

Get the position logic right first, then add animation. During development:
1. Use immediate position updates to see logical behavior
2. Add animation only after position logic is stable
3. Keep animation time constants small enough that errors are visible

**Connection to v1.0 failures:**

v1.0's smooth scrolling made the "display ahead of user" problem less obvious but didn't fix it. The scroll would smoothly drift ahead, then users would notice they were behind the display, then they'd catch up - but the fundamental problem (speculative positioning) was hidden by nice animation.

---

### 9. Insufficient Silence Handling

**What the mistake looks like:**

Not distinguishing between "no audio" (user paused) and "audio but no match" (user ad-libbing).

```javascript
// v1.0: silenceThreshold triggered both cases
if (timeSinceMatch > this.silenceThreshold) {
  this.scrollState = ScrollState.UNCERTAIN;
}
```

**Why it seems reasonable:**

"Both result in no matches, so handle them the same way."

**Why it fails:**

1. Paused user: should hold position, ready to resume
2. Ad-libbing user: should hold position, don't scroll ahead
3. Both have same system-level signal but different correct responses
4. Treating them the same adds latency to pause recovery

**Prevention:**

Use audio-level detection separate from match detection:

```javascript
const hasAudio = audioLevel > silenceFloor;
const hasMatch = matchResult.position !== null;

if (!hasAudio) {
  // User paused - hold, but ready to resume instantly
  state = 'paused';
} else if (!hasMatch) {
  // User speaking but not matching - ad-lib
  state = 'ad-libbing';
} else {
  // Matched - update position
  state = 'tracking';
}
```

**Connection to v1.0 failures:**

v1.0 added silence detection (`silenceThreshold: 500ms`) but it was overlaid on the same confidence logic. A user pausing briefly (300ms) would get different treatment than one pausing longer (600ms) - even though both should just hold position.

---

## New Pitfalls (Beyond v1.0)

### 10. Over-Correcting from v1.0

**The risk:** The v1.1 rewrite swings too far in the opposite direction.

**Examples:**
- v1.0 had too many parameters -> v1.1 has zero tuning, even for legitimate preferences
- v1.0 was speculative -> v1.1 is so conservative it feels laggy
- v1.0 searched everywhere -> v1.1 only searches immediate vicinity, missing legitimate skips

**Prevention:**

Start conservative, but measure:
- Track latency between speech and scroll response
- Track false positive rate (unwanted jumps)
- Have escape hatches for edge cases (manual position reset)

---

### 11. Font Size Scroll Distance Coupling

**The risk:** Scroll distance in pixels doesn't account for font size changes.

If user increases font size:
- Same "scroll 100 pixels" moves fewer words
- Speaking pace -> scroll speed calculation becomes wrong
- Position tracking might work but scroll behavior breaks

**Prevention:**

Express scroll targets in *word positions*, not pixels. Calculate pixel distance at render time based on current layout.

---

### 12. Web Speech API Timing Assumptions

**The risk:** Assuming Web Speech API behaves consistently.

Reality:
- Interim results come at variable intervals
- Final results may revise earlier interim results
- Recognition can restart mid-word
- Different browsers have different timing

**Prevention:**

Design for asynchronous, potentially contradictory input:
- Don't assume interim results are stable
- Wait for final results before high-confidence actions
- Handle recognition restart gracefully

---

### 13. Script Content Edge Cases

**The risk:** Algorithms tuned for prose fail on other content.

Edge cases:
- Numbers ("fifteen" might be recognized as "15")
- Abbreviations ("USA" vs "U S A")
- Names (may be consistently misrecognized)
- Technical terms (ASR doesn't know them)
- Poetry/lyrics (repeated refrains)

**Prevention:**

Test with diverse content, not just Gettysburg Address. Include:
- A speech with numbers
- A technical document
- A poem with repeated lines
- A script with unusual names

---

## Prevention Strategies

### Strategy 1: Confirmed Position Model

**Principle:** One position concept, only updated on confirmation.

```javascript
class PositionTracker {
  confirmedPosition = 0;

  update(matchResult) {
    if (this.isConfident(matchResult)) {
      this.confirmedPosition = matchResult.position;
    }
    // Otherwise: no change
  }

  isConfident(matchResult) {
    // Position is intrinsic to confidence
    const distance = matchResult.position - this.confirmedPosition;
    const positionWeight = 1 / (1 + distance * 0.1);
    return matchResult.matchQuality * positionWeight > threshold;
  }
}
```

### Strategy 2: Derive, Don't Configure

**Principle:** Derive behavior from observable speech characteristics.

| Instead of | Derive from |
|------------|-------------|
| `scrollSpeed` parameter | Observed words per second |
| `confidenceThreshold` | Position distance + match quality |
| `skipThreshold` | Current position (can only skip forward) |
| `dwellTime` | Nothing - act immediately on confident match |

### Strategy 3: Strong Positional Bias

**Principle:** Distance is the primary confidence factor.

```javascript
function matchConfidence(matchQuality, distance) {
  // Nearby match with mediocre quality > distant match with high quality
  const positionFactor = Math.max(0, 1 - distance * 0.05);
  return matchQuality * positionFactor;
}
```

### Strategy 4: Never Ahead of User

**Principle:** Display can lag but never lead.

1. Only scroll to confirmed positions
2. If no confirmation, hold current position
3. Scroll speed <= speaking speed (catch up, don't predict)
4. Visual caret is at confirmed position, not target

### Strategy 5: Explicit Over Inferred

**Principle:** When in doubt, require explicit user action.

| Behavior | v1.0 (inferred) | v1.1 (explicit) |
|----------|-----------------|-----------------|
| Backward skip | Automatic with high threshold | Manual click/command |
| Large forward skip | Automatic with dwell time | Confirm with consecutive words |
| Resume after pause | Automatic after threshold | Immediate on next match |

---

## Testing Considerations

### Red Flags (You're Falling Into Pitfalls)

1. **Adding parameters to fix edge cases** - Step back and question the model
2. **Animation feels smooth but position is wrong** - Turn off animation, verify logic
3. **State machine has more than 3 states** - Probably over-engineered
4. **Confidence calculation has more than 2 factors** - Simplify
5. **Tests pass on Gettysburg but fail on other content** - Need diverse test corpus
6. **"Just need to tune the threshold"** - Wrong abstraction

### Test Scenarios

| Scenario | Expected | v1.0 Failure |
|----------|----------|--------------|
| Read straight through | Smooth following | Worked |
| Pause 2 seconds | Hold position | Worked |
| Pause 10 seconds | Still holds | Worked |
| Skip 5 words | Follow naturally | Sometimes false jumped |
| Skip 50 words | Confirm then jump | Sometimes false jumped |
| Ad-lib for 10 seconds | Hold position | Scrolled ahead |
| Repeated phrase | Match correct instance | Jumped to wrong instance |
| Change font size mid-read | Scroll adjusts | Scroll distance wrong |
| Speak very fast | Keep up | Fell behind |
| Speak very slow | Don't race ahead | Got ahead |

### Measurement Criteria

1. **Latency:** Time from spoken word to scroll response (target: <300ms)
2. **False positive rate:** Unwanted position jumps (target: <5%)
3. **False negative rate:** Failed to track correct position (target: <5%)
4. **Recovery time:** Time to re-sync after desync (target: <2s)
5. **Parameter count:** Number of tunables (target: <=3)

---

## Sources

### Codebase Analysis (HIGH confidence)

- `/Users/brent/project/matching/TextMatcher.js` - v1.0 matching implementation with proximity search
- `/Users/brent/project/matching/ScrollSync.js` - v1.0 scroll state machine with 15+ parameters
- `/Users/brent/project/matching/ConfidenceLevel.js` - v1.0 confidence calculation
- `/Users/brent/project/.planning/PROJECT.md` - v1.0 failure documentation and v1.1 goals
- `/Users/brent/project/.planning/STATE.md` - v1.1 design principles

### Web Research (MEDIUM confidence)

- [PromptSmart teleprompter](https://apps.apple.com/us/app/promptsmart-pro-teleprompter/id894811756) - Voice tracking confusion with repeated phrases
- [Open source voice teleprompter](https://github.com/jlecomte/voice-activated-teleprompter) - Robustness challenges
- [Forced alignment challenges](https://www.futurebeeai.com/knowledge-hub/forced-alignment-speech) - Speech-text alignment fundamentals
- [State pattern over-engineering](https://refactoring.guru/design-patterns/state) - When state machines are overkill
- [Confidence score pitfalls](https://www.mindee.com/blog/how-use-confidence-scores-ml-models) - Threshold tuning challenges
- [Scroll position UX](https://www.nngroup.com/articles/saving-scroll-position/) - User mental model for scroll
- [Speech rate estimation](https://pmc.ncbi.nlm.nih.gov/articles/PMC2860302/) - Robust pace calculation
- [DTW limitations](https://en.wikipedia.org/wiki/Dynamic_time_warping) - Over-warping and constraint issues

---

*Research mode: Pitfalls*
*Confidence: HIGH - Based on v1.0 code analysis + domain research*
