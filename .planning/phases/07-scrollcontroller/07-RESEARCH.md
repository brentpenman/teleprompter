# Phase 7: ScrollController - Research

**Researched:** 2026-01-24
**Domain:** Reactive scroll control driven by position confirmations with speech-derived speed
**Confidence:** HIGH

## Summary

This phase implements ScrollController, the reactive component that scrolls the teleprompter display based on position confirmations from PositionTracker. The controller keeps upcoming text at a fixed caret position (upper third of screen), derives scroll speed from the user's actual speech pace, and provides visual feedback for tracking vs holding states.

The key architectural insight is that ScrollController is purely reactive (ARCH-03): it responds to position events rather than driving them. PositionTracker owns the confirmed position; ScrollController translates that position into smooth scroll animations. This separation keeps concerns clean and avoids the state machine complexity that plagued v1.0.

For scroll animation, the proven approach is exponential smoothing with requestAnimationFrame. The formula `position += (target - position) * (1 - exp(-speed * dt))` provides frame-rate independent animation that handles interruptions gracefully. Speech pace is calculated from word position deltas over time (words spoken / seconds elapsed), then converted to pixels/second using the container's scroll height.

**Primary recommendation:** Implement ScrollController as a class that subscribes to PositionTracker.getConfirmedPosition(), calculates target scroll position to keep caret at upper third, derives speed from word-to-pixel pace calculation, and animates smoothly with exponential easing. Use simple tracking/holding state (no complex transitions) with CSS class toggle for visual feedback.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native ES Modules | - | Class-based scroll controller | No external dependencies needed |
| requestAnimationFrame | - | 60fps animation loop | Browser-native, optimal for smooth scroll |
| CSS Custom Highlight API | - | Text highlighting (existing) | Already implemented in Highlighter.js |
| localStorage | - | Persist caret position preference | Built-in, simple settings storage |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| PositionTracker (Phase 6) | - | Provides confirmed position | Always - upstream in pipeline |
| Highlighter (existing) | - | Visual text highlighting | Continue using for current phrase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom exponential easing | CSS scroll-behavior: smooth | CSS scroll-behavior doesn't support speed control; need precise pace matching |
| requestAnimationFrame | setInterval | RAF syncs with display refresh; setInterval causes jank |
| Lenis smooth scroll | Native scrollTop | Lenis adds 15KB; native is sufficient for our use case |
| GSAP ScrollTrigger | Native scroll | GSAP is overkill for single-direction scroll tracking |

**Installation:**
```bash
# No new dependencies needed
```

## Architecture Patterns

### Recommended Module Structure
```
matching/
├── WordMatcher.js        # EXISTING: Stateless matching (Phase 5)
├── PositionTracker.js    # EXISTING: Stateful position (Phase 6)
├── ScrollController.js   # NEW: Reactive scroll control (this phase)
├── ScrollController.test.js # NEW: Tests for ScrollController
├── Highlighter.js        # EXISTING: CSS Custom Highlight API
└── textUtils.js          # EXISTING: Tokenization
```

### Pattern 1: Reactive Position Consumption
**What:** ScrollController polls or subscribes to PositionTracker, never owns position state
**When to use:** Always - this is the architectural requirement (ARCH-03)
**Why:** Single source of truth in PositionTracker; ScrollController just translates position to scroll

**Example:**
```javascript
// Source: REQUIREMENTS.md (ARCH-03), CONTEXT.md decisions
class ScrollController {
  constructor(container, positionTracker, options = {}) {
    this.container = container;
    this.positionTracker = positionTracker;

    // Don't store position - always query PositionTracker
    // This ensures we never drift from the source of truth
  }

  tick() {
    // Query current confirmed position on each frame
    const confirmedPosition = this.positionTracker.getConfirmedPosition();
    const targetScroll = this.positionToScrollTop(confirmedPosition);

    // Animate toward target
    // ...
  }
}
```

### Pattern 2: Caret-Fixed Scrolling (Content Scrolls to Caret)
**What:** Fixed caret position on screen (upper third), content scrolls to bring upcoming text there
**When to use:** Always - this is the core UX requirement (SCROLL-02)
**Why (from CONTEXT.md):** "Position at upper third (~33%) of screen - more upcoming text visible below"

**Example:**
```javascript
// Source: CONTEXT.md caret positioning decisions
const DEFAULT_CARET_PERCENT = 33; // Upper third

function positionToScrollTop(wordIndex, totalWords, containerHeight, scrollHeight) {
  // Calculate where this word should be in the document
  const wordPercent = wordIndex / totalWords;
  const wordPositionInDoc = wordPercent * scrollHeight;

  // Scroll so the word appears at the caret position
  const caretOffsetFromTop = (this.caretPercent / 100) * containerHeight;
  return wordPositionInDoc - caretOffsetFromTop;
}
```

### Pattern 3: Exponential Smoothing Animation
**What:** Smooth scroll animation using exponential easing that's frame-rate independent
**When to use:** For continuous scroll tracking (CONTEXT.md: "text glides steadily")
**Why:** Handles variable frame rates, interruptions, and changing targets gracefully

**Example:**
```javascript
// Source: https://lisyarus.github.io/blog/posts/exponential-smoothing.html
// Formula: position += (target - position) * (1 - exp(-speed * dt))

tick(timestamp) {
  const dt = (timestamp - this.lastTimestamp) / 1000; // seconds
  this.lastTimestamp = timestamp;

  const target = this.targetScrollTop;
  const current = this.container.scrollTop;

  // speed parameter: higher = faster convergence
  // 1/speed is the time to close gap by factor of e (2.718)
  const factor = 1 - Math.exp(-this.scrollSpeed * dt);
  const newScroll = current + (target - current) * factor;

  this.container.scrollTop = newScroll;

  if (this.isTracking) {
    requestAnimationFrame(this.tick.bind(this));
  }
}
```

### Pattern 4: Speech Pace Calculation
**What:** Calculate speaking speed in words/second from position confirmations, convert to pixels/second
**When to use:** For deriving scroll speed from speech (SCROLL-05)
**Why (from CONTEXT.md):** "Scroll speed derived from speech pace, not a separate parameter"

**Example:**
```javascript
// Source: STATE.md design principle, SCROLL-05 requirement
updatePaceFromPosition(newPosition, timestamp) {
  if (this.lastPositionUpdate > 0 && newPosition > this.lastPosition) {
    const timeDelta = (timestamp - this.lastPositionUpdate) / 1000; // seconds
    const wordsDelta = newPosition - this.lastPosition;

    if (timeDelta > 0 && timeDelta < 5) { // Ignore long gaps
      const instantPace = wordsDelta / timeDelta; // words per second

      // Exponential moving average for smoothing
      this.speakingPace = this.speakingPace * 0.7 + instantPace * 0.3;
    }
  }

  this.lastPosition = newPosition;
  this.lastPositionUpdate = timestamp;
}

calculateScrollSpeed() {
  // Convert words/second to pixels/second
  const pixelsPerWord = this.maxScroll / this.totalWords;
  return this.speakingPace * pixelsPerWord;
}
```

### Pattern 5: Simple Tracking State (No Complex State Machine)
**What:** Two states only - tracking (scroll follows speech) and holding (scroll paused)
**When to use:** For pause detection and visual feedback (SCROLL-03, VIS-01)
**Why (from REQUIREMENTS.md Out of Scope):** "State machine transitions - Simpler reactive model"

**Example:**
```javascript
// Source: CONTEXT.md state decisions, VIS-01 requirement
// NOT a state machine - just a boolean with timeout

class ScrollController {
  constructor() {
    this.isTracking = false;
    this.lastAdvanceTime = 0;
    this.holdTimeout = 5000; // 5 seconds silence -> hold
  }

  onPositionAdvanced(timestamp) {
    this.lastAdvanceTime = timestamp;
    if (!this.isTracking) {
      this.isTracking = true;
      this.onStateChange('tracking'); // For visual indicator
    }
  }

  tick(timestamp) {
    // Check for silence -> hold transition
    if (this.isTracking && timestamp - this.lastAdvanceTime > this.holdTimeout) {
      this.isTracking = false;
      this.onStateChange('holding');
    }

    // Continue animation even when holding (scroll stops naturally)
    // ...
  }
}
```

### Pattern 6: Skip Jump Animation
**What:** Fast animated jump (not instant teleport) when skip detection confirms large position change
**When to use:** When PositionTracker confirms a skip (distance > nearbyThreshold)
**Why (from CONTEXT.md):** "On skip detection: quick animated jump - fast but visible transition"

**Example:**
```javascript
// Source: CONTEXT.md scroll animation decisions
onPositionAdvanced(newPosition, prevPosition) {
  const distance = newPosition - prevPosition;

  if (distance > this.nearbyThreshold) {
    // Skip detected - use faster animation speed for jump
    this.jumpSpeed = 15; // Higher speed = faster convergence
  } else {
    // Normal tracking - use pace-derived speed
    this.jumpSpeed = null;
  }

  this.targetScrollTop = this.positionToScrollTop(newPosition);
}

tick() {
  // Use jumpSpeed if set, otherwise pace-derived speed
  const speed = this.jumpSpeed ?? this.calculateScrollSpeed();
  // ... exponential smoothing with this speed

  // Clear jumpSpeed once we're close to target
  if (Math.abs(this.targetScrollTop - this.container.scrollTop) < 5) {
    this.jumpSpeed = null;
  }
}
```

### Anti-Patterns to Avoid
- **Storing position in ScrollController:** Position lives in PositionTracker only (ARCH-02)
- **Complex state machine:** Don't replicate v1.0's CONFIDENT/UNCERTAIN/OFF_SCRIPT (Out of Scope)
- **Predictive scrolling:** Never scroll ahead of confirmed position (SCROLL-01)
- **Instant teleport on skip:** Use quick animation, not jarring instant jump (CONTEXT.md)
- **CSS scroll-behavior:** Doesn't provide speed control needed for pace matching
- **Manual scroll speed parameter:** Derive from speech pace only (SCROLL-05)

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Position tracking | Custom position state | PositionTracker.getConfirmedPosition() | Single source of truth exists |
| Text highlighting | Custom highlight logic | Highlighter.js (existing) | Already uses CSS Custom Highlight API |
| Frame scheduling | setInterval | requestAnimationFrame | RAF syncs with display refresh |
| Settings persistence | Custom file storage | localStorage | Simple key-value, built-in |
| Easing curves | Complex bezier curves | Exponential smoothing | Simpler, handles interruptions better |

**Key insight:** ScrollController orchestrates existing components (PositionTracker, Highlighter) and native APIs (scrollTop, requestAnimationFrame). Keep it focused on the translation from word position to scroll position.

## Common Pitfalls

### Pitfall 1: Scrolling Ahead of Confirmed Position
**What goes wrong:** Display shows text the user hasn't spoken yet, creating confusing UX
**Why it happens:** Using candidate position instead of confirmed, or predictive scroll logic
**How to avoid:**
- Only use `positionTracker.getConfirmedPosition()`, never `candidatePosition`
- Calculate scroll target from confirmed position only
- Never add "look-ahead" or "buffer" to scroll position
**Warning signs:** User sees words they haven't said yet; text "jumps ahead"

### Pitfall 2: Jittery Scroll from Direct scrollTop Assignment
**What goes wrong:** Scroll stutters or jumps instead of smooth glide
**Why it happens:** Setting scrollTop directly without animation, or animation conflicts
**How to avoid:**
- Use exponential smoothing for all scroll changes
- Single animation loop (one requestAnimationFrame chain)
- Never mix CSS scroll-behavior with JavaScript scroll control
**Warning signs:** Visible stuttering; scroll "snaps" between positions

### Pitfall 3: Speed Calculation Spikes
**What goes wrong:** Scroll speeds up dramatically then slows, creating jarring motion
**Why it happens:** Single word match after pause creates huge instant pace calculation
**How to avoid:**
- Ignore pace calculations from time gaps > 5 seconds
- Use exponential moving average for pace smoothing
- Clamp pace to reasonable bounds (0.5 to 10 words/second)
**Warning signs:** Scroll races ahead after user pauses; erratic speed changes

### Pitfall 4: Lost Caret Position on Window Resize
**What goes wrong:** Caret marker no longer aligns with scroll target after resize
**Why it happens:** Fixed pixel offset instead of percentage; no resize handler
**How to avoid:**
- Store caret position as percentage (default 33%)
- Recalculate scroll target on resize
- Consider debounced resize handler
**Warning signs:** After resize, text doesn't line up with caret marker

### Pitfall 5: Animation Loop Leaks
**What goes wrong:** Multiple animation loops running, memory leaks, performance degradation
**Why it happens:** Starting new loop without canceling previous; not cleaning up on stop
**How to avoid:**
- Track animationFrameId, cancel before starting new
- Clean up in stop() method
- Single animation loop entry point
**Warning signs:** Performance degrades over time; multiple callbacks firing

### Pitfall 6: Holding State Never Resumes
**What goes wrong:** After pause, user speaks but scroll doesn't resume
**Why it happens:** Not detecting new position advances; overly strict resume conditions
**How to avoid:**
- Track `lastAdvanceTime` from position confirmations
- Resume automatically on any forward movement (SCROLL-04)
- No manual "restart" action required
**Warning signs:** Scroll stays stuck after pause; user must reset to continue

## Code Examples

Verified patterns combining research and context decisions:

### Complete ScrollController Interface
```javascript
// Source: REQUIREMENTS.md + CONTEXT.md decisions + exponential smoothing research
/**
 * ScrollController - Reactive Scroll Control
 *
 * Reacts to PositionTracker confirmations to scroll teleprompter display.
 * Keeps upcoming text at fixed caret position, derives speed from speech pace.
 * Purely reactive - never owns position state.
 *
 * @module ScrollController
 */

/**
 * @typedef {Object} ScrollControllerOptions
 * @property {number} [caretPercent=33] - Caret position as % from top (33 = upper third)
 * @property {number} [holdTimeout=5000] - ms of silence before holding
 * @property {number} [baseSpeed=5] - exponential smoothing base speed
 * @property {number} [jumpSpeed=15] - faster speed for skip jumps
 * @property {number} [minPace=0.5] - minimum words/second
 * @property {number} [maxPace=10] - maximum words/second
 * @property {Function} [onStateChange] - callback when tracking/holding state changes
 */

export class ScrollController {
  /**
   * @param {HTMLElement} container - Scrollable container element
   * @param {HTMLElement} textElement - Text content element
   * @param {PositionTracker} positionTracker - Position source (Phase 6)
   * @param {number} totalWords - Total words in script
   * @param {ScrollControllerOptions} [options]
   */
  constructor(container, textElement, positionTracker, totalWords, options = {}) {
    this.container = container;
    this.textElement = textElement;
    this.positionTracker = positionTracker;
    this.totalWords = totalWords;

    // Options with defaults
    this.caretPercent = options.caretPercent ?? 33;
    this.holdTimeout = options.holdTimeout ?? 5000;
    this.baseSpeed = options.baseSpeed ?? 5;
    this.jumpSpeed = options.jumpSpeed ?? 15;
    this.minPace = options.minPace ?? 0.5;
    this.maxPace = options.maxPace ?? 10;
    this.onStateChange = options.onStateChange ?? (() => {});

    // Animation state
    this.animationId = null;
    this.lastTimestamp = 0;
    this.targetScrollTop = 0;
    this.currentJumpSpeed = null; // null = use pace-derived speed

    // Pace tracking
    this.speakingPace = 2.5; // words/second, ~150wpm default
    this.lastPosition = 0;
    this.lastPositionTime = 0;

    // Tracking state
    this.isTracking = false;
    this.lastAdvanceTime = 0;

    // Bind methods
    this.tick = this.tick.bind(this);
  }

  /**
   * Start scroll control
   */
  start() {
    this.lastTimestamp = performance.now();
    this.lastAdvanceTime = this.lastTimestamp;
    this.isTracking = true;
    this.onStateChange('tracking');
    this.tick(this.lastTimestamp);
  }

  /**
   * Stop scroll control
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.isTracking = false;
    this.onStateChange('stopped');
  }

  /**
   * Notify of position advance (call after PositionTracker.processMatch returns 'advanced')
   * @param {number} newPosition - New confirmed position
   * @param {number} prevPosition - Previous confirmed position
   */
  onPositionAdvanced(newPosition, prevPosition) {
    const now = performance.now();

    // Update pace calculation
    this.updatePace(newPosition, now);

    // Check for skip (large jump)
    const distance = newPosition - prevPosition;
    if (distance > 10) { // Skip threshold
      this.currentJumpSpeed = this.jumpSpeed;
    }

    // Update target scroll
    this.targetScrollTop = this.positionToScrollTop(newPosition);

    // Resume tracking if holding
    this.lastAdvanceTime = now;
    if (!this.isTracking) {
      this.isTracking = true;
      this.onStateChange('tracking');
    }
  }

  /**
   * Calculate target scrollTop to position word at caret
   */
  positionToScrollTop(wordIndex) {
    const scrollHeight = this.container.scrollHeight;
    const containerHeight = this.container.clientHeight;
    const maxScroll = scrollHeight - containerHeight;

    // Where this word is in the document
    const wordPercent = wordIndex / this.totalWords;
    const wordPositionInDoc = wordPercent * scrollHeight;

    // Offset to position at caret
    const caretOffset = (this.caretPercent / 100) * containerHeight;
    const targetScroll = wordPositionInDoc - caretOffset;

    // Clamp to valid range
    return Math.max(0, Math.min(maxScroll, targetScroll));
  }

  /**
   * Update speaking pace from position change
   */
  updatePace(newPosition, timestamp) {
    if (this.lastPositionTime > 0 && newPosition > this.lastPosition) {
      const timeDelta = (timestamp - this.lastPositionTime) / 1000;
      const wordsDelta = newPosition - this.lastPosition;

      if (timeDelta > 0 && timeDelta < 5) { // Ignore long gaps
        const instantPace = wordsDelta / timeDelta;
        const clampedPace = Math.max(this.minPace, Math.min(this.maxPace, instantPace));

        // Exponential moving average
        this.speakingPace = this.speakingPace * 0.7 + clampedPace * 0.3;
      }
    }

    this.lastPosition = newPosition;
    this.lastPositionTime = timestamp;
  }

  /**
   * Calculate scroll speed in exponential smoothing units
   */
  calculateSpeed() {
    if (this.currentJumpSpeed !== null) {
      return this.currentJumpSpeed;
    }

    // Convert pace to exponential smoothing speed
    // Higher pace = higher speed (faster convergence)
    return this.baseSpeed * (this.speakingPace / 2.5);
  }

  /**
   * Animation frame callback
   */
  tick(timestamp) {
    const dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // Check for silence -> hold transition
    if (this.isTracking && timestamp - this.lastAdvanceTime > this.holdTimeout) {
      this.isTracking = false;
      this.onStateChange('holding');
    }

    // Exponential smoothing scroll animation
    const target = this.targetScrollTop;
    const current = this.container.scrollTop;
    const speed = this.calculateSpeed();

    const factor = 1 - Math.exp(-speed * dt);
    const newScroll = current + (target - current) * factor;

    this.container.scrollTop = newScroll;

    // Clear jump speed once close to target
    if (this.currentJumpSpeed !== null && Math.abs(target - newScroll) < 5) {
      this.currentJumpSpeed = null;
    }

    // Continue animation loop
    this.animationId = requestAnimationFrame(this.tick);
  }

  /**
   * Set caret position (persisted setting)
   * @param {number} percent - Caret position as percentage from top
   */
  setCaretPercent(percent) {
    this.caretPercent = Math.max(10, Math.min(90, percent));
    // Recalculate target for current position
    const currentPosition = this.positionTracker.getConfirmedPosition();
    this.targetScrollTop = this.positionToScrollTop(currentPosition);
  }

  /**
   * Reset to initial state
   */
  reset() {
    this.stop();
    this.container.scrollTop = 0;
    this.targetScrollTop = 0;
    this.lastPosition = 0;
    this.lastPositionTime = 0;
    this.speakingPace = 2.5;
    this.currentJumpSpeed = null;
  }
}
```

### Integration with Pipeline
```javascript
// Source: STATE.md pipeline architecture
import { createMatcher, findMatches } from './WordMatcher.js';
import { PositionTracker } from './PositionTracker.js';
import { ScrollController } from './ScrollController.js';
import { Highlighter } from './Highlighter.js';

// Setup
const matcher = createMatcher(scriptText);
const positionTracker = new PositionTracker();
const scrollController = new ScrollController(
  container,
  textElement,
  positionTracker,
  matcher.words.length,
  {
    onStateChange: (state) => {
      // Update visual indicator
      container.classList.toggle('tracking', state === 'tracking');
      container.classList.toggle('holding', state === 'holding');
    }
  }
);
const highlighter = new Highlighter(textElement);

scrollController.start();

// On each speech recognition result
function onSpeechResult(transcript) {
  const prevPosition = positionTracker.getConfirmedPosition();
  const result = findMatches(transcript, matcher, prevPosition);

  if (result.bestMatch) {
    const processResult = positionTracker.processMatch(result.bestMatch);

    if (processResult.action === 'advanced') {
      // Notify scroll controller of position change
      scrollController.onPositionAdvanced(
        processResult.confirmedPosition,
        prevPosition
      );

      // Update highlight
      highlighter.highlightPosition(
        processResult.confirmedPosition,
        matcher.words
      );
    }
  }
}
```

### Visual State Indicator CSS
```css
/* Source: VIS-01 requirement, CONTEXT.md tracking state */
.tracking-indicator {
  position: fixed;
  top: 20px;
  left: 20px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.3s ease;
}

.tracking-indicator.tracking {
  background: rgba(34, 197, 94, 0.2); /* green */
  color: #22c55e;
}

.tracking-indicator.holding {
  background: rgba(234, 179, 8, 0.2); /* yellow */
  color: #eab308;
}

/* Caret line indicator */
.caret-line {
  position: fixed;
  top: 33%; /* matches caretPercent default */
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.3);
  pointer-events: none;
  z-index: 10;
}
```

### Settings Slider for Caret Position
```javascript
// Source: CONTEXT.md "User-adjustable via settings slider"
const CARET_SETTING_KEY = 'teleprompter-caret-percent';

function loadCaretSetting() {
  const saved = localStorage.getItem(CARET_SETTING_KEY);
  return saved ? parseInt(saved, 10) : 33;
}

function saveCaretSetting(percent) {
  localStorage.setItem(CARET_SETTING_KEY, percent.toString());
}

// In UI setup
const caretSlider = document.getElementById('caret-slider');
caretSlider.value = loadCaretSetting();
caretSlider.addEventListener('input', (e) => {
  const percent = parseInt(e.target.value, 10);
  scrollController.setCaretPercent(percent);
  saveCaretSetting(percent);

  // Update caret line visual
  document.querySelector('.caret-line').style.top = `${percent}%`;
});
```

## State of the Art

| Old Approach (v1.0 ScrollSync) | Current Approach (v1.1 ScrollController) | Reason for Change |
|-------------------------------|------------------------------------------|-------------------|
| State machine (CONFIDENT/UNCERTAIN/OFF_SCRIPT) | Simple tracking/holding boolean | State machine added complexity without benefit |
| Owns scroll position state | Queries PositionTracker for position | Single source of truth principle |
| Time-based dwell confirmation | Immediate response to confirmed positions | Confirmation logic moved to PositionTracker |
| Linear interpolation with clamping | Exponential smoothing | Frame-rate independent, handles interruptions |
| Base speed + manual adjustments | Pace derived from speech only | SCROLL-05 requirement |
| Multiple speed parameters | Single pace calculation | Simpler, more predictable |
| Complex skip detection in scroll | Skip detection in PositionTracker | Separation of concerns |

**Deprecated/outdated:**
- `ScrollSync.js` - Full replacement with ScrollController; different architecture
- `ScrollState` enum - No state machine in v1.1
- `updateConfidence()` method - Confidence handled by PositionTracker
- `handleMatch()` method - Position decisions in PositionTracker

## Open Questions

Things that couldn't be fully resolved:

1. **Exact exponential smoothing speed constants**
   - What we know: baseSpeed=5 and jumpSpeed=15 are reasonable starting points
   - What's unclear: May need tuning for optimal "feel"
   - Recommendation: Make configurable, tune during integration testing

2. **Caret position for skip jumps**
   - What we know: Normal tracking keeps words at caret
   - What's unclear: After skip, should we overshoot slightly for orientation?
   - Recommendation: Start with same caret position, observe in testing

3. **Resize handling complexity**
   - What we know: Need to recalculate scroll target on resize
   - What's unclear: Debounce threshold, handling during animation
   - Recommendation: Simple resize listener, recalculate target; defer debouncing if needed

4. **Pause timeout value (5 seconds)**
   - What we know: CONTEXT.md mentions "5+ seconds" for pause detection
   - What's unclear: Exact threshold that feels responsive but not premature
   - Recommendation: Start with 5000ms, make configurable, tune in testing

## Sources

### Primary (HIGH confidence)
- PositionTracker.js (Phase 6) - Verified API: getConfirmedPosition(), processMatch()
- ScrollSync.js (v1.0) - Existing patterns for pace calculation, animation loop
- CONTEXT.md (07-CONTEXT.md) - User decisions on caret, animation, states
- REQUIREMENTS.md - SCROLL-01 through SCROLL-05, VIS-01, ARCH-03
- STATE.md - Pipeline architecture, design principles

### Secondary (MEDIUM confidence)
- [Exponential Smoothing Animation](https://lisyarus.github.io/blog/posts/exponential-smoothing.html) - Frame-rate independent easing formula
- [MDN CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) - Highlight patterns (existing implementation)
- [VirtualSpeech Speaking Rates](https://virtualspeech.com/blog/average-speaking-rate-words-per-minute) - Average 130-150 WPM baseline
- [PromptSmart](https://promptsmart.com/) - Commercial voice-tracking teleprompter (validates approach)

### Tertiary (LOW confidence)
- [Lenis Smooth Scroll](https://github.com/darkroomengineering/lenis) - Alternative approach (not using)
- [GitHub smart-teleprompter](https://github.com/amulyagarimella/smart-teleprompter) - Open source reference (limited documentation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries; native APIs sufficient
- Architecture: HIGH - Clear requirements from ARCH-03; clean separation from PositionTracker
- Animation: HIGH - Exponential smoothing is well-documented, proven pattern
- Pace calculation: MEDIUM - Formula is straightforward but may need tuning
- Visual feedback: HIGH - Simple CSS classes, existing patterns

**Research date:** 2026-01-24
**Valid until:** 2026-04-24 (90 days - patterns are stable, implementation is custom)
