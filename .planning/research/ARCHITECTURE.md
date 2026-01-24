# Position-Tracking Architecture

**Domain:** Voice-controlled teleprompter position tracking
**Researched:** 2026-01-24
**Confidence:** HIGH

## Executive Summary

The v1.0 architecture conflates three distinct responsibilities into a tangled mess: word matching, position tracking, and scroll control all intermixed in TextMatcher and ScrollSync. The v1.1 architecture should cleanly separate these into a **pipeline** where each component has a single job:

1. **WordMatcher** - Given speech, find candidate word positions (pure matching, no state)
2. **PositionTracker** - Maintain confirmed position, decide whether to accept candidates (stateful)
3. **ScrollController** - Convert confirmed position to scroll actions (reactive, no matching logic)

The key architectural insight: **confirmed position is the single source of truth**. Matching produces candidates. Position tracking decides acceptance. Scrolling reacts to confirmed position changes. This separation makes each component simple to reason about and tune independently.

## Component Design

### 1. WordMatcher (Pure Function, Stateless)

**Responsibility:** Given spoken words and a search window, return candidate match positions with quality scores.

**What it does:**
- Receives speech transcript (already tokenized)
- Searches for phrase matches within a specified position range
- Returns array of candidates: `{ position, score, matchedWords }`
- Has NO knowledge of current position or history

**What it does NOT do:**
- Track current position (PositionTracker's job)
- Decide whether to accept matches (PositionTracker's job)
- Care about time/recency (PositionTracker's job)
- Trigger scrolling (ScrollController's job)

**Interface:**
```javascript
class WordMatcher {
  constructor(scriptWords, options) {
    this.scriptWords = scriptWords;
    this.fuse = new Fuse(/* ... */);
  }

  // Core method - pure function, no side effects
  findCandidates(spokenWords, searchRange) {
    // Returns: [{ position, score, matchedWords }, ...]
    // searchRange: { start: number, end: number }
  }
}
```

**Why stateless:** Matching is a pure operation. Given the same input (spoken words, search range), it should always produce the same output. State management belongs elsewhere.

### 2. PositionTracker (Stateful Core)

**Responsibility:** Maintain the single source of truth for "where the user is" in the script.

**What it does:**
- Holds `confirmedPosition` - the last position we're certain about
- Receives match candidates from WordMatcher
- Applies acceptance rules (proximity bias, skip limits, consecutive confirmation)
- Updates `confirmedPosition` only when confident
- Emits events when position changes

**What it does NOT do:**
- Fuzzy matching (WordMatcher's job)
- Scroll the display (ScrollController's job)
- Calculate scroll speed (ScrollController's job)

**State model:**
```javascript
{
  confirmedPosition: number,      // Last word index we're certain about
  tentativePosition: number|null, // Candidate being confirmed
  tentativeStartTime: number,     // When we first saw tentative
  lastConfirmTime: number,        // When we last confirmed a position
}
```

**Acceptance rules (the brain of v1.1):**
1. **Proximity bias:** Prefer candidates near `confirmedPosition`
2. **Forward preference:** Small forward moves (1-5 words) accepted immediately
3. **Backward skepticism:** Backward moves require longer confirmation
4. **Skip limit:** Large jumps (>N words) rejected unless confirmed multiple times
5. **Consecutive confirmation:** Same position seen M times over T ms = confirmed

**Interface:**
```javascript
class PositionTracker {
  constructor(options) {
    this.confirmedPosition = 0;
    this.onPositionConfirmed = options.onPositionConfirmed; // callback
  }

  // Main method - receives candidates, may update confirmedPosition
  processMatches(candidates, timestamp) {
    // Applies acceptance rules
    // If accepted, updates confirmedPosition and calls callback
    // Returns: { accepted: boolean, newPosition?: number }
  }

  // For scroll controller to know current position
  getConfirmedPosition() {
    return this.confirmedPosition;
  }

  reset() {
    this.confirmedPosition = 0;
    // ...
  }
}
```

### 3. ScrollController (Reactive Display)

**Responsibility:** Keep the confirmed position visible at the caret line.

**What it does:**
- Listens for position confirmations from PositionTracker
- Calculates target scroll position to place confirmed position at caret
- Applies smooth scrolling animation
- Tracks speaking pace for scroll speed
- Handles pause/resume gracefully

**What it does NOT do:**
- Match words (WordMatcher's job)
- Decide what position is confirmed (PositionTracker's job)
- Predict where user will be (no prediction, only reaction)

**Key constraint:** Never scroll ahead of `confirmedPosition`. The display only reacts to confirmed speech.

**Interface:**
```javascript
class ScrollController {
  constructor(container, textElement, options) {
    this.container = container;
    this.caret = options.caretPosition || 0.33; // 1/3 from top
  }

  // Called when position is confirmed
  onPositionConfirmed(wordIndex, totalWords) {
    // Calculate target scroll
    // Animate smoothly
  }

  // For pace-based speed
  updateSpeakingPace(wordsPerSecond) {
    // Adjust scroll animation speed
  }
}
```

## Data Flow

```
                    Speech Input
                         |
                         v
              +--------------------+
              |  SpeechRecognizer  |  (existing, keep)
              +--------------------+
                         |
                    transcript
                         |
                         v
              +--------------------+
              |    WordMatcher     |  (pure matching)
              +--------------------+
                         |
            candidates[] with scores
                         |
                         v
              +--------------------+
              |  PositionTracker   |  (acceptance logic)
              +--------------------+
                         |
              confirmedPosition (event)
                         |
                         v
              +--------------------+
              |  ScrollController  |  (display reaction)
              +--------------------+
                         |
                         v
                  DOM scroll update
```

### Event-Driven Communication

Components communicate via events/callbacks, not direct coupling:

```javascript
// In script.js setup
const wordMatcher = new WordMatcher(scriptWords);
const positionTracker = new PositionTracker({
  onPositionConfirmed: (position) => {
    scrollController.onPositionConfirmed(position, wordMatcher.totalWords);
    highlighter.highlightPosition(position, wordMatcher.scriptWords);
  }
});
const scrollController = new ScrollController(container, textElement);

// When speech arrives
speechRecognizer.onTranscript = (text, isFinal) => {
  const words = tokenize(text);
  const searchRange = positionTracker.getSearchRange(); // proximity window
  const candidates = wordMatcher.findCandidates(words, searchRange);
  positionTracker.processMatches(candidates, Date.now());
};
```

## State Model

### What State Is Needed

| Component | State | Purpose |
|-----------|-------|---------|
| WordMatcher | scriptWords, fuse index | Immutable after init |
| PositionTracker | confirmedPosition | Single source of truth |
| PositionTracker | tentativePosition, tentativeStartTime | Confirmation tracking |
| PositionTracker | lastConfirmTime | Recency for pace calculation |
| ScrollController | currentScrollTop | Current scroll position |
| ScrollController | targetScrollTop | Animation target |
| ScrollController | speakingPace | For scroll speed |

### Where State Lives

**PositionTracker owns the critical state:** `confirmedPosition`. This is the single source of truth that all other components react to.

**ScrollController owns display state:** Current scroll, target scroll, animation state. These are presentation concerns, not tracking concerns.

**WordMatcher is stateless:** Just a utility that takes input and returns output.

### State Transitions

```
PositionTracker State Machine (simplified):

  TRACKING (normal operation)
      |
      | No matches for T seconds
      v
  WAITING (lost position)
      |
      | High-confidence match found
      v
  TRACKING
```

Unlike v1.0's complex CONFIDENT/UNCERTAIN/OFF_SCRIPT, v1.1 has simpler states because the complexity moves to acceptance rules rather than scroll behavior. The scroll simply follows confirmed position - it doesn't need to know if we're confident or uncertain.

## Integration with Existing Code

### What to Keep

| Component | Keep/Modify/Replace | Reason |
|-----------|---------------------|--------|
| SpeechRecognizer.js | **Keep as-is** | Works well, auto-restart, error handling |
| AudioVisualizer.js | **Keep as-is** | Waveform display works |
| Highlighter.js | **Keep as-is** | CSS Custom Highlight API works |
| textUtils.js | **Keep as-is** | tokenize(), filler filtering work |
| Fuse.js | **Keep** | Fuzzy matching library, already integrated |
| CSS scroll animation | **Keep** | Smooth scroll mechanics work |

### What to Replace

| Component | Replace With | Reason |
|-----------|--------------|--------|
| TextMatcher.js | WordMatcher.js | Remove position tracking, make stateless |
| ScrollSync.js | PositionTracker.js + ScrollController.js | Split into two concerns |
| ConfidenceLevel.js | Absorbed into PositionTracker | Simplify, confidence = acceptance rules |

### What to Remove

| Component | Why Remove |
|-----------|-----------|
| State machine (CONFIDENT/UNCERTAIN/OFF_SCRIPT) | Overengineered for v1.0's needs |
| Dwell time in ScrollSync | Moves to PositionTracker's confirmation logic |
| Speed adjustment in ScrollSync | Simplify: pace-based only |
| behindThreshold/aheadThreshold | No longer needed with reactive model |

### Integration Points

**script.js changes:**
```javascript
// Before (v1.0)
const result = textMatcher.getMatchWithConfidence(matchWords.join(' '));
const { state, positionAccepted } = scrollSync.updateConfidence(result);

// After (v1.1)
const searchRange = positionTracker.getSearchRange();
const candidates = wordMatcher.findCandidates(matchWords, searchRange);
positionTracker.processMatches(candidates, Date.now());
// Scroll updates happen via callback, not here
```

**Highlighter integration:**
```javascript
// Subscribe to position changes
positionTracker.onPositionConfirmed = (position) => {
  highlighter.highlightPosition(position, wordMatcher.scriptWords);
  scrollController.onPositionConfirmed(position, wordMatcher.totalWords);
};
```

## Recommended Structure

### File Organization

```
matching/
  WordMatcher.js       # NEW: Pure matching, returns candidates
  PositionTracker.js   # NEW: Acceptance logic, confirmed position
  ScrollController.js  # NEW: Scroll animation, pace tracking
  Highlighter.js       # KEEP: CSS Custom Highlight API
  textUtils.js         # KEEP: tokenize, filler filtering

voice/
  SpeechRecognizer.js  # KEEP: Speech capture, auto-restart
  AudioVisualizer.js   # KEEP: Waveform display

script.js              # MODIFY: Wire up new components
```

### Suggested Implementation Order

1. **WordMatcher.js** - Extract matching from TextMatcher, make stateless
2. **PositionTracker.js** - New file with acceptance rules
3. **ScrollController.js** - Extract scroll from ScrollSync, simplify
4. **script.js** - Wire up new pipeline
5. **Delete** - TextMatcher.js, ScrollSync.js, ConfidenceLevel.js

### Configuration

Move tuning parameters to PositionTracker options:

```javascript
const positionTracker = new PositionTracker({
  // Acceptance rules
  maxForwardSkip: 5,        // Immediate accept for small forward
  maxBackwardSkip: 3,       // Stricter for backward
  skipConfirmTime: 200,     // ms to confirm large skip
  skipConfirmCount: 2,      // times to see same position

  // Search window
  proximityWindow: 15,      // words to search around confirmed

  // Callbacks
  onPositionConfirmed: (pos) => { /* ... */ }
});
```

## Patterns to Follow

### Pattern 1: Pipeline (Data Transformation Chain)

Data flows through stages: Speech -> Words -> Candidates -> Confirmed Position -> Scroll Command

Each stage transforms data and passes it forward. No stage reaches back to modify earlier stages.

**Reference:** [Pipeline Pattern](https://dev.to/wallacefreitas/the-pipeline-pattern-streamlining-data-processing-in-software-architecture-44hn)

### Pattern 2: Observer (Event-Driven Updates)

PositionTracker emits events when `confirmedPosition` changes. Observers (ScrollController, Highlighter) react independently.

**Benefits:**
- Loose coupling between components
- Easy to add new observers (e.g., debug logger)
- Components don't need to know about each other

**Reference:** [Observer Pattern in JavaScript](https://medium.com/@artemkhrenov/the-observer-pattern-in-modern-javascript-building-reactive-systems-9337d6a27ee7)

### Pattern 3: Single Source of Truth

`confirmedPosition` in PositionTracker is THE position. No other component maintains its own idea of "where we are."

**Why critical:** v1.0 had position in TextMatcher AND target position in ScrollSync. These could diverge, causing confusion.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Bidirectional Data Flow

**Bad:** ScrollController tells PositionTracker to update position
**Good:** PositionTracker updates, ScrollController reacts

Data flows one direction: Speech -> Match -> Position -> Scroll

### Anti-Pattern 2: Mixed Concerns in One Class

**Bad (v1.0):** ScrollSync does matching acceptance, scroll animation, speed calculation, state machine
**Good (v1.1):** Each class does one thing well

### Anti-Pattern 3: Prediction

**Bad:** Scroll ahead of where user might be
**Good:** Only scroll to where user demonstrably IS

### Anti-Pattern 4: Complex State Machines for Simple Problems

**Bad (v1.0):** 3-state machine with complex transitions for scroll behavior
**Good (v1.1):** Simple acceptance rules that either confirm or don't

## Sources

### Primary (HIGH confidence - implemented patterns)
- [Game Programming Patterns: State](https://gameprogrammingpatterns.com/state.html) - State management patterns
- [Observer Pattern in JavaScript](https://medium.com/@artemkhrenov/the-observer-pattern-in-modern-javascript-building-reactive-systems-9337d6a27ee7) - Event-driven reactive systems
- [Pipeline Pattern](https://dev.to/wallacefreitas/the-pipeline-pattern-streamlining-data-processing-in-software-architecture-44hn) - Data transformation chains
- [Separation of Concerns](https://www.geeksforgeeks.org/software-engineering/separation-of-concerns-soc/) - Architectural principle

### Secondary (MEDIUM confidence - informed by similar domains)
- [Aeneas Forced Alignment](https://github.com/readbeyond/aeneas) - Audio-text synchronization concepts
- [PromptSmart VoiceTrack](https://promptsmart.com/) - Commercial voice teleprompter approach
- [Autoscript Voice](https://autoscript.tv/voice/) - Professional teleprompter voice control

### Domain Knowledge (from v1.0 experience)
- PROJECT.md design principles (v1.1 requirements)
- 04-RESEARCH.md (confidence scoring, easing patterns)
- 04-CONTEXT.md (scroll behavior decisions)

## Quality Checklist

- [x] Clear component boundaries (WordMatcher, PositionTracker, ScrollController)
- [x] Data flow is explicit (pipeline: Speech -> Match -> Position -> Scroll)
- [x] State model is simple (confirmedPosition is single source of truth)
- [x] Integration with existing code considered (keep SpeechRecognizer, Highlighter, AudioVisualizer)
- [x] Patterns grounded in established software architecture
- [x] Anti-patterns identified from v1.0 experience
