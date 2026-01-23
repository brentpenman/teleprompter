# Phase 4: Intelligent Scroll Control - Research

**Researched:** 2026-01-23
**Domain:** Intelligent scroll behavior, confidence scoring, and off-script detection
**Confidence:** HIGH

## Summary

This phase implements intelligent scroll control that makes the teleprompter behave like a human operator - scrolling when confident in the position match, pausing when uncertain, and handling off-script moments gracefully. The research found that confidence scoring should combine multiple signals (fuzzy match scores, consecutive match counts, time since last match), and scroll dynamics should use exponential easing for natural deceleration and acceleration.

Key findings: The existing Fuse.js integration already provides match scores (0 = perfect, 1 = no match) that can be inverted and combined with consecutive match counts to create a compound confidence metric. For scroll dynamics, exponential decay (with time constant ~325ms) creates natural-feeling momentum/deceleration. The AudioVisualizer already exists and can be extended to show confidence through opacity/brightness changes. Skip detection requires higher thresholds for backward vs forward jumps.

The architecture should use a state-based approach with three states: CONFIDENT, UNCERTAIN, and OFF_SCRIPT. State transitions are determined by match confidence levels over time, not instantaneous readings. This prevents jittery behavior from momentary recognition hiccups.

**Primary recommendation:** Extend existing ScrollSync to track confidence state, implement compound confidence scoring in TextMatcher, and add opacity modulation to AudioVisualizer. Use exponential easing for all scroll dynamics (acceleration, deceleration, coasting).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fuse.js | 6.x (existing) | Fuzzy matching with scores | Already integrated, provides 0-1 scores with includeScore option |
| requestAnimationFrame | Native | Smooth animation loop | 60fps, throttled in background, synced with repaint |
| Canvas API | Native | Confidence visualization | AudioVisualizer already uses canvas, extend for opacity |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| performance.now() | Native | High-precision timing | For delta time calculations in animation loops |
| Date.now() | Native | Timestamp tracking | For time-since-last-match calculations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom state machine | XState | XState is powerful but overkill for 3-state machine; adds dependency |
| Custom easing | Tween.js | Unnecessary complexity; simple exponential decay suffices |
| Canvas opacity | CSS filter | Canvas already used; avoids DOM manipulation |

**Installation:**
```bash
# No new dependencies needed - all native APIs or already installed
```

## Architecture Patterns

### Recommended Module Structure
```
matching/
├── TextMatcher.js       # Add confidence scoring methods
├── ScrollSync.js        # Add state machine, easing, confidence tracking
├── Highlighter.js       # Remove dimming (per CONTEXT.md decision)
└── ConfidenceLevel.js   # NEW: Confidence calculation utilities

voice/
├── AudioVisualizer.js   # Add confidence opacity modulation
└── SpeechRecognizer.js  # Unchanged
```

### Pattern 1: Compound Confidence Scoring
**What:** Combine multiple signals into a single confidence level (HIGH/MEDIUM/LOW)
**When to use:** Every time a match is attempted, to feed the state machine
**Example:**
```javascript
// Source: Derived from Fuse.js scoring theory + MDN SpeechRecognition.confidence
// https://www.fusejs.io/concepts/scoring-theory.html

class ConfidenceCalculator {
  constructor(options = {}) {
    // Thresholds for confidence levels
    this.highThreshold = options.highThreshold || 0.7;
    this.lowThreshold = options.lowThreshold || 0.4;

    // Weights for combining signals
    this.matchScoreWeight = 0.5;      // Fuse.js match quality
    this.consecutiveWeight = 0.3;      // How many words matched in window
    this.recencyWeight = 0.2;          // Time since last match
  }

  // Convert Fuse.js score (0=perfect, 1=bad) to confidence (0=bad, 1=perfect)
  invertFuseScore(fuseScore) {
    return 1 - Math.min(fuseScore, 1);
  }

  // Calculate compound confidence from multiple signals
  calculate(fuseScore, consecutiveMatches, windowSize, msSinceLastMatch) {
    // Match quality: invert Fuse score
    const matchQuality = this.invertFuseScore(fuseScore);

    // Consecutive match ratio (e.g., 2/3 = 0.67)
    const consecutiveRatio = consecutiveMatches / windowSize;

    // Recency factor: decays over 5 seconds
    const recencyFactor = Math.max(0, 1 - (msSinceLastMatch / 5000));

    // Weighted combination
    const rawConfidence =
      (matchQuality * this.matchScoreWeight) +
      (consecutiveRatio * this.consecutiveWeight) +
      (recencyFactor * this.recencyWeight);

    return rawConfidence;
  }

  // Convert raw confidence (0-1) to discrete level
  toLevel(rawConfidence) {
    if (rawConfidence >= this.highThreshold) return 'high';
    if (rawConfidence >= this.lowThreshold) return 'medium';
    return 'low';
  }
}
```

### Pattern 2: State Machine for Off-Script Detection
**What:** Track scroll behavior state based on confidence over time
**When to use:** To determine scroll behavior (confident scrolling, uncertain pausing, off-script waiting)
**Example:**
```javascript
// Source: Finite state machine pattern
// https://kentcdodds.com/blog/implementing-a-simple-state-machine-library-in-javascript

const ScrollState = {
  CONFIDENT: 'confident',     // Scrolling at speaking pace
  UNCERTAIN: 'uncertain',     // Still scrolling but slowing/ready to pause
  OFF_SCRIPT: 'off_script'    // Paused, waiting for return to script
};

class ScrollStateMachine {
  constructor(options = {}) {
    this.state = ScrollState.CONFIDENT;
    this.patientThreshold = options.patientThreshold || 4000; // 3-5 seconds
    this.uncertainStartTime = null;

    // Callbacks for state changes
    this.onStateChange = options.onStateChange || (() => {});
  }

  // Update state based on confidence level
  update(confidenceLevel, timestamp) {
    const prevState = this.state;

    switch (this.state) {
      case ScrollState.CONFIDENT:
        if (confidenceLevel === 'high') {
          // Stay confident
        } else if (confidenceLevel === 'medium') {
          this.state = ScrollState.UNCERTAIN;
          this.uncertainStartTime = timestamp;
        } else {
          this.state = ScrollState.UNCERTAIN;
          this.uncertainStartTime = timestamp;
        }
        break;

      case ScrollState.UNCERTAIN:
        if (confidenceLevel === 'high') {
          this.state = ScrollState.CONFIDENT;
          this.uncertainStartTime = null;
        } else {
          // Check if we've been uncertain long enough
          const duration = timestamp - this.uncertainStartTime;
          if (duration > this.patientThreshold) {
            this.state = ScrollState.OFF_SCRIPT;
          }
        }
        break;

      case ScrollState.OFF_SCRIPT:
        if (confidenceLevel === 'high') {
          // Found position again - return to confident
          this.state = ScrollState.CONFIDENT;
          this.uncertainStartTime = null;
        }
        break;
    }

    if (prevState !== this.state) {
      this.onStateChange(this.state, prevState);
    }

    return this.state;
  }
}
```

### Pattern 3: Exponential Easing for Scroll Dynamics
**What:** Natural acceleration/deceleration using exponential decay
**When to use:** Catch-up acceleration, pause deceleration, resume ramp-up
**Example:**
```javascript
// Source: Kinetic scrolling exponential decay
// https://ariya.io/2013/11/javascript-kinetic-scrolling-part-2

class ScrollEasing {
  constructor() {
    // Time constant for exponential decay (ms)
    // Lower = faster response, Higher = more gradual
    this.accelerationTimeConstant = 1500;  // ~1.5s to reach full speed
    this.decelerationTimeConstant = 500;   // ~0.5s coast when pausing
    this.resumeTimeConstant = 1000;        // ~1s ramp up on resume
  }

  // Exponential ease-out: starts fast, slows to target
  // Returns value between current and target
  easeOut(current, target, deltaMs, timeConstant) {
    const factor = 1 - Math.exp(-deltaMs / timeConstant);
    return current + (target - current) * factor;
  }

  // Calculate speed for catch-up (when behind target)
  getCatchUpSpeed(currentSpeed, targetSpeed, deltaMs) {
    return this.easeOut(currentSpeed, targetSpeed, deltaMs, this.accelerationTimeConstant);
  }

  // Calculate speed for coasting to stop
  getDeceleratingSpeed(currentSpeed, deltaMs) {
    return this.easeOut(currentSpeed, 0, deltaMs, this.decelerationTimeConstant);
  }

  // Calculate speed when resuming from pause
  getResumingSpeed(currentSpeed, targetSpeed, deltaMs) {
    return this.easeOut(currentSpeed, targetSpeed, deltaMs, this.resumeTimeConstant);
  }
}
```

### Pattern 4: Skip Detection with Distance-Based Thresholds
**What:** Detect forward and backward skips with different confidence requirements
**When to use:** When a match is found that's far from current position
**Example:**
```javascript
// Source: CONTEXT.md decisions - forward skips need high confidence,
// backward skips need even higher

class SkipDetector {
  constructor(options = {}) {
    // Distance thresholds (in words)
    this.shortSkipThreshold = 20;   // Below this, smooth scroll
    this.longSkipThreshold = 100;   // Above this, instant jump

    // Confidence requirements
    this.forwardSkipConfidence = 0.85;   // Very high for forward
    this.backwardSkipConfidence = 0.92;  // Even higher for backward
  }

  // Determine skip type and whether to allow it
  analyzeSkip(currentPosition, newPosition, confidence, totalWords) {
    const distance = newPosition - currentPosition;
    const absDistance = Math.abs(distance);
    const isForward = distance > 0;

    // Determine required confidence
    const requiredConfidence = isForward
      ? this.forwardSkipConfidence
      : this.backwardSkipConfidence;

    // Check if confidence is sufficient
    if (confidence < requiredConfidence) {
      return { allowed: false, reason: 'insufficient_confidence' };
    }

    // Determine animation type
    let animationType;
    if (absDistance <= this.shortSkipThreshold) {
      animationType = 'smooth';  // Smooth scroll for short skips
    } else if (absDistance >= this.longSkipThreshold) {
      animationType = 'instant'; // Instant jump for long skips
    } else {
      // Linear interpolation for medium distances
      const ratio = (absDistance - this.shortSkipThreshold) /
                    (this.longSkipThreshold - this.shortSkipThreshold);
      animationType = ratio > 0.5 ? 'instant' : 'smooth';
    }

    return {
      allowed: true,
      animationType,
      distance: absDistance,
      isForward
    };
  }
}
```

### Pattern 5: Canvas Opacity for Confidence Visualization
**What:** Modulate AudioVisualizer brightness based on confidence
**When to use:** Continuously update based on current confidence level
**Example:**
```javascript
// Source: MDN Canvas globalAlpha
// https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalAlpha

// Extend existing AudioVisualizer.draw() method
draw() {
  this.animationFrameId = requestAnimationFrame(this.draw);
  this.analyser.getByteFrequencyData(this.dataArray);

  const width = this.canvas.width;
  const height = this.canvas.height;
  this.ctx.clearRect(0, 0, width, height);

  // Map confidence level to opacity
  // high = 1.0 (bright), medium = 0.6, low = 0.3
  let targetOpacity;
  switch (this.confidenceLevel) {
    case 'high': targetOpacity = 1.0; break;
    case 'medium': targetOpacity = 0.6; break;
    case 'low': targetOpacity = 0.3; break;
    default: targetOpacity = 1.0;
  }

  // Smooth opacity transitions
  this.currentOpacity = this.currentOpacity || 1.0;
  this.currentOpacity += (targetOpacity - this.currentOpacity) * 0.1;

  // Apply global alpha for all drawing
  this.ctx.globalAlpha = this.currentOpacity;
  this.ctx.fillStyle = this.isError ? this.errorColor : this.normalColor;

  // ... rest of existing bar drawing code ...
}

// Add method to set confidence level
setConfidenceLevel(level) {
  this.confidenceLevel = level;  // 'high', 'medium', or 'low'
}
```

### Anti-Patterns to Avoid
- **Binary confidence (on/off):** User wants 3 levels, not 2 - implement high/medium/low
- **Instant state changes:** Use patience threshold (3-5s) before going off-script
- **Jumping to position on matches:** Use pace-based scrolling, not position jumping
- **Dimming read text:** User explicitly requested removal of dimming feature
- **Speed caps:** Never limit scroll speed - always match user's speaking pace
- **Backward jitter:** Require much higher confidence for backward skips

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy match scoring | Custom similarity algorithm | Fuse.js includeScore | Already integrated, optimized Bitap algorithm |
| Smooth easing curves | Linear interpolation | Exponential decay formula | Feels more natural, mimics physics |
| Animation timing | setTimeout/setInterval | requestAnimationFrame | 60fps, throttled in background, synced with GPU |
| State management | Nested if/else | Simple state machine | Clearer code, easier to debug, predictable transitions |

**Key insight:** The existing codebase has most components needed. The challenge is connecting them with confidence scoring and state management, not building new UI components.

## Common Pitfalls

### Pitfall 1: Confidence Oscillation
**What goes wrong:** Confidence level flickers between states rapidly, causing jumpy behavior
**Why it happens:** Speech recognition has natural variability; single-sample confidence is noisy
**How to avoid:**
- Use sliding window for confidence (average over last 3-5 samples)
- Require sustained low confidence before transitioning to OFF_SCRIPT
- Use hysteresis (different thresholds for entering vs leaving states)
**Warning signs:** Visual indicator flickering, scroll speed changing rapidly

### Pitfall 2: Scrolling Past Last Spoken Text
**What goes wrong:** During pause/coast, scroll continues until spoken text leaves view
**Why it happens:** Momentum/coast continues after speech pauses
**How to avoid:**
- Track "last matched position" as hard boundary
- Check boundary BEFORE each scroll increment
- Clamp scroll position to never exceed boundary
**Warning signs:** User sees text they haven't spoken yet at top of screen

### Pitfall 3: False Skip Detection
**What goes wrong:** User pauses briefly and app interprets as skip to different section
**Why it happens:** Threshold too aggressive, or brief mismatches trigger jumps
**How to avoid:**
- Require very high confidence (0.85+) for forward skips
- Require even higher (0.92+) for backward skips (less common in practice)
- Consider position context (is this plausibly where user might skip to?)
**Warning signs:** App jumps to wrong section during normal speech pauses

### Pitfall 4: Jarring Speed Changes
**What goes wrong:** Scroll speed changes abruptly, feels robotic
**Why it happens:** Directly setting speed to new value without easing
**How to avoid:**
- Always use exponential easing for speed changes
- Different time constants for different transitions (faster decel, slower accel)
- Never instantly change speed; always blend toward target
**Warning signs:** Scroll feels mechanical, not like human operator

### Pitfall 5: Off-Script Never Recovers
**What goes wrong:** User goes off-script, app gets stuck and never re-syncs
**Why it happens:** Search only happens from current position, user jumped elsewhere
**How to avoid:**
- When returning from OFF_SCRIPT, search entire document for current speech
- Use broader search window when re-syncing
- Give high-confidence matches priority over position proximity
**Warning signs:** App stays stuck at one position even when user clearly returned to script

### Pitfall 6: Web Speech API Confidence is Unreliable
**What goes wrong:** Relying on SpeechRecognitionAlternative.confidence for match confidence
**Why it happens:** Firefox always returns 1.0; Chrome's values are inconsistent
**How to avoid:**
- Use Fuse.js match scores instead (more reliable)
- Combine with consecutive match count for compound confidence
- Do not depend on browser-provided speech confidence values
**Warning signs:** Confidence always shows high even for poor matches

## Code Examples

Verified patterns from official sources:

### Fuse.js with Score Access
```javascript
// Source: https://www.fusejs.io/api/options.html

const fuse = new Fuse(scriptIndex, {
  keys: ['word'],
  threshold: 0.3,
  includeScore: true,  // IMPORTANT: enables score in results
  findAllMatches: false,
  minMatchCharLength: 2
});

const results = fuse.search(spokenWord);
if (results.length > 0) {
  const bestMatch = results[0];
  const fuseScore = bestMatch.score;  // 0 = perfect, 1 = no match
  const matchedItem = bestMatch.item;

  // Invert for intuitive confidence (0 = bad, 1 = good)
  const confidence = 1 - fuseScore;
}
```

### requestAnimationFrame Animation Loop
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_animations

class ScrollAnimator {
  constructor() {
    this.lastFrameTime = 0;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.tick(t));
  }

  stop() {
    this.isRunning = false;
  }

  tick(timestamp) {
    if (!this.isRunning) return;

    const deltaMs = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    // Update scroll position based on delta time
    this.updateScroll(deltaMs);

    requestAnimationFrame((t) => this.tick(t));
  }

  updateScroll(deltaMs) {
    // ... scroll logic using deltaMs for frame-rate independence
  }
}
```

### Exponential Decay for Coasting
```javascript
// Source: https://ariya.io/2013/11/javascript-kinetic-scrolling-part-2

function autoScroll() {
  if (!amplitude) return;

  const elapsed = Date.now() - timestamp;
  const delta = -amplitude * Math.exp(-elapsed / timeConstant);

  // Continue until movement is negligible
  if (Math.abs(delta) > 0.5) {
    scroll(target + delta);
    requestAnimationFrame(autoScroll);
  } else {
    // Reached target, stop
    scroll(target);
  }
}

// To start coasting:
function beginCoast(velocity) {
  const timeConstant = 325;  // ms - tune for feel
  amplitude = 0.8 * velocity;
  target = Math.round(currentOffset + amplitude);
  timestamp = Date.now();
  requestAnimationFrame(autoScroll);
}
```

### Canvas globalAlpha for Opacity
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalAlpha

// Set transparency before drawing
ctx.globalAlpha = 0.5;  // 50% opacity
ctx.fillStyle = '#22c55e';
ctx.fillRect(0, 0, 100, 100);

// Reset for subsequent drawing
ctx.globalAlpha = 1.0;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Binary confidence | Compound multi-signal confidence | 2024+ | Better handling of edge cases, smoother transitions |
| Position-based scrolling | Pace-based scrolling with easing | 2024+ | Smoother feel, matches speaking rhythm |
| setTimeout for animation | requestAnimationFrame | 2012+ | 60fps, GPU-synced, power efficient |
| Linear speed changes | Exponential easing | Standard | Natural feel, mimics physics |

**Deprecated/outdated:**
- Relying on SpeechRecognition.confidence: Inconsistent across browsers (Firefox always returns 1)
- Fixed scroll speed: Modern teleprompters adapt to speaking pace
- Text dimming for read sections: User preference is clean display without dimming

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal patience threshold for off-script detection**
   - What we know: CONTEXT.md specifies 3-5 seconds
   - What's unclear: Exact sweet spot depends on user testing
   - Recommendation: Start at 4 seconds, make configurable if needed

2. **Short vs long skip threshold in words**
   - What we know: Need different animation for short (smooth) vs long (instant)
   - What's unclear: Exact word count threshold
   - Recommendation: Start with 20 words for short, 100 for long; tune based on testing

3. **Time constants for easing**
   - What we know: Kinetic scrolling uses 325ms for deceleration
   - What's unclear: Best values for acceleration and resume
   - Recommendation: Start with decel=500ms, accel=1500ms, resume=1000ms; tune based on feel

## Sources

### Primary (HIGH confidence)
- [Fuse.js scoring theory](https://www.fusejs.io/concepts/scoring-theory.html) - Match scoring algorithm
- [Fuse.js API options](https://www.fusejs.io/api/options.html) - includeScore and threshold configuration
- [MDN: Canvas Basic Animations](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_animations) - requestAnimationFrame patterns
- [MDN: SpeechRecognitionAlternative.confidence](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionAlternative/confidence) - Browser confidence API limitations

### Secondary (MEDIUM confidence)
- [Ariya Kinetic Scrolling](https://ariya.io/2013/11/javascript-kinetic-scrolling-part-2) - Exponential decay formula and time constants
- [CSS-Tricks: Easing Animations in Canvas](https://css-tricks.com/easing-animations-in-canvas/) - Easing function implementations
- [Kent C. Dodds: State Machine Library](https://kentcdodds.com/blog/implementing-a-simple-state-machine-library-in-javascript) - Simple state machine pattern

### Tertiary (LOW confidence - patterns from industry)
- [Teleprompter.com Voice Scroll](https://www.teleprompter.com/blog/voice-scroll-teleprompter-app-new-feature) - Commercial implementation concepts
- [VoiceScroll.me](https://voicescroll.me/) - Alternative approach using Levenshtein distance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All native APIs or already integrated libraries
- Architecture: HIGH - State machine and easing patterns are well-established
- Pitfalls: MEDIUM - Based on documented limitations and general patterns; needs real-world validation
- Code examples: HIGH - Verified against official documentation

**Research date:** 2026-01-23
**Valid until:** 2026-04-23 (90 days - stable browser APIs and established patterns)

**Key constraints honored:**
- Uses existing Fuse.js (no new matching library)
- Uses existing AudioVisualizer for confidence display
- Three confidence levels (high/medium/low) per CONTEXT.md
- No dimming of read text per CONTEXT.md
- Pace-based scrolling per Phase 3 decisions
- No speed caps per CONTEXT.md
