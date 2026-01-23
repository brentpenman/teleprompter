// Scroll synchronization module
// Pace-based scrolling that follows speaking rhythm with state-based control

// Scroll state enum for state machine
export const ScrollState = {
  CONFIDENT: 'confident',
  UNCERTAIN: 'uncertain',
  OFF_SCRIPT: 'off_script'
};

export class ScrollSync {
  constructor(containerElement, textElement, options = {}) {
    this.container = containerElement;
    this.textElement = textElement;

    // Base scroll speed (pixels per second)
    this.baseSpeed = options.baseSpeed || 60;

    // Current scroll speed (adjusts based on speaking pace)
    this.currentSpeed = 0;

    // Target position from matcher
    this.targetWordIndex = 0;
    this.totalWords = 0;

    // Timing
    this.lastMatchTime = 0;
    this.lastWordIndex = 0;
    this.speakingPace = 0; // words per second

    // How long to keep scrolling after last match (ms)
    this.overshootTime = 500;

    // Animation
    this.animationId = null;
    this.lastFrameTime = 0;
    this.isScrolling = false;

    // State machine
    this.scrollState = ScrollState.CONFIDENT;
    this.uncertainStartTime = null;
    this.patientThreshold = options.patientThreshold || 4000; // 4 seconds before off-script

    // Easing time constants (ms)
    this.accelerationTimeConstant = 1500;
    this.decelerationTimeConstant = 500;
    this.resumeTimeConstant = 1000;

    // Skip detection
    this.shortSkipThreshold = 20;  // words - below this, smooth scroll
    this.longSkipThreshold = 100;  // words - above this, instant jump
    this.forwardSkipConfidence = 0.85;
    this.backwardSkipConfidence = 0.92;

    // Boundary tracking (never scroll past last matched position)
    this.lastMatchedPosition = 0; // word index of last confirmed match

    // Callbacks
    this.onStateChange = options.onStateChange || (() => {});
    this.onConfidenceChange = options.onConfidenceChange || (() => {});
  }

  // Called when matcher finds a position
  scrollToWordIndex(wordIndex, totalWords) {
    if (wordIndex < 0 || totalWords <= 0) return;

    const now = Date.now();
    this.totalWords = totalWords;

    // Calculate speaking pace
    if (this.lastMatchTime > 0 && wordIndex > this.lastWordIndex) {
      const timeDelta = (now - this.lastMatchTime) / 1000; // seconds
      const wordsDelta = wordIndex - this.lastWordIndex;

      if (timeDelta > 0 && timeDelta < 5) { // Ignore long gaps
        const instantPace = wordsDelta / timeDelta;
        // Smooth the pace calculation
        this.speakingPace = this.speakingPace * 0.6 + instantPace * 0.4;
      }
    }

    this.lastMatchTime = now;
    this.lastWordIndex = wordIndex;
    this.targetWordIndex = wordIndex;

    // Start scrolling if not already
    if (!this.isScrolling) {
      this.startScrolling();
    }
  }

  // Update state machine based on match confidence
  // Called when TextMatcher produces a result
  updateConfidence(matchResult) {
    const now = Date.now();
    const prevState = this.scrollState;
    const level = matchResult.level; // 'high', 'medium', 'low'

    // Update last matched position if we have a match
    if (matchResult.position !== null) {
      this.lastMatchedPosition = Math.max(this.lastMatchedPosition, matchResult.position);
    }

    switch (this.scrollState) {
      case ScrollState.CONFIDENT:
        if (level === 'high') {
          // Stay confident - update position
          if (matchResult.position !== null) {
            this.handleMatch(matchResult);
          }
        } else {
          // Becoming uncertain
          this.scrollState = ScrollState.UNCERTAIN;
          this.uncertainStartTime = now;
        }
        break;

      case ScrollState.UNCERTAIN:
        if (level === 'high') {
          // Back to confident
          this.scrollState = ScrollState.CONFIDENT;
          this.uncertainStartTime = null;
          if (matchResult.position !== null) {
            this.handleMatch(matchResult);
          }
        } else {
          // Check patience threshold
          const duration = now - this.uncertainStartTime;
          if (duration > this.patientThreshold) {
            this.scrollState = ScrollState.OFF_SCRIPT;
          }
        }
        break;

      case ScrollState.OFF_SCRIPT:
        if (level === 'high' && matchResult.position !== null) {
          // Found position again
          this.scrollState = ScrollState.CONFIDENT;
          this.uncertainStartTime = null;
          this.handleMatch(matchResult);
        }
        break;
    }

    // Notify callbacks
    if (prevState !== this.scrollState) {
      this.onStateChange(this.scrollState, prevState);
    }
    this.onConfidenceChange(level, matchResult.confidence);

    return this.scrollState;
  }

  // Handle a confident match - includes skip detection
  handleMatch(matchResult) {
    const distance = matchResult.position - this.targetWordIndex;
    const absDistance = Math.abs(distance);
    const isForward = distance > 0;

    // Check if this is a significant skip
    if (absDistance > 5) { // More than 5 words difference
      const requiredConfidence = isForward
        ? this.forwardSkipConfidence
        : this.backwardSkipConfidence;

      // Reject low-confidence skips
      if (matchResult.confidence < requiredConfidence) {
        return; // Don't update position
      }

      // Determine animation type
      if (absDistance >= this.longSkipThreshold) {
        // Instant jump for long skips
        this.targetWordIndex = matchResult.position;
        // Reset speed for fresh start
        this.currentSpeed = this.baseSpeed;
      } else {
        // Smooth scroll for short skips
        this.targetWordIndex = matchResult.position;
      }
    } else {
      // Normal incremental update
      this.targetWordIndex = matchResult.position;
    }

    this.lastMatchTime = Date.now();
    this.lastWordIndex = matchResult.position;
    this.totalWords = this.totalWords || matchResult.position + 100; // Estimate if not set

    if (!this.isScrolling) {
      this.startScrolling();
    }
  }

  // Exponential easing for smooth speed transitions
  easeToward(current, target, deltaMs, timeConstant) {
    const factor = 1 - Math.exp(-deltaMs / timeConstant);
    return current + (target - current) * factor;
  }

  // Calculate target speed based on speaking pace (no speed cap)
  calculatePaceBasedSpeed() {
    if (this.totalWords === 0) return this.baseSpeed;

    const maxScroll = this.container.scrollHeight - this.container.clientHeight;
    const pixelsPerWord = maxScroll / this.totalWords;
    const paceBasedSpeed = this.speakingPace * pixelsPerWord;

    // No speed cap per CONTEXT.md
    return Math.max(paceBasedSpeed, this.baseSpeed * 0.5);
  }

  startScrolling() {
    if (this.isScrolling) return;
    this.isScrolling = true;
    this.lastFrameTime = performance.now();
    this.currentSpeed = this.baseSpeed;
    this.tick();
  }

  stopScrolling() {
    this.isScrolling = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  tick() {
    if (!this.isScrolling) return;

    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) / 1000; // seconds
    const deltaMs = (now - this.lastFrameTime);
    this.lastFrameTime = now;

    const maxScroll = this.container.scrollHeight - this.container.clientHeight;
    const currentScroll = this.container.scrollTop;

    // Calculate scroll boundary - never scroll past last matched position
    const boundaryScroll = (this.lastMatchedPosition / this.totalWords) * maxScroll;

    // Calculate target scroll position and overshoot
    const targetScroll = (this.targetWordIndex / this.totalWords) * maxScroll;
    const overshootPixels = currentScroll - targetScroll; // positive = ahead, negative = behind

    // Determine target speed based on state
    let targetSpeed;
    switch (this.scrollState) {
      case ScrollState.CONFIDENT:
        // Base speed from speaking pace
        targetSpeed = this.calculatePaceBasedSpeed();

        // Adjust for position - speed up if behind, slow down if ahead
        if (overshootPixels < -50) {
          // We're behind by 50+ pixels - speed up
          const behindFactor = Math.min((-overshootPixels) / 100, 3);
          targetSpeed *= (1 + behindFactor);
        } else if (overshootPixels > 10) {
          // We're ahead by 10+ pixels - slow down significantly
          targetSpeed *= Math.max(0.1, 1 - (overshootPixels / 50));
        }

        this.currentSpeed = this.easeToward(this.currentSpeed, targetSpeed, deltaMs, this.accelerationTimeConstant);
        break;

      case ScrollState.UNCERTAIN:
        // Slow down gradually
        targetSpeed = this.baseSpeed * 0.3;
        this.currentSpeed = this.easeToward(this.currentSpeed, targetSpeed, deltaMs, this.decelerationTimeConstant);
        break;

      case ScrollState.OFF_SCRIPT:
        // Coast to stop
        this.currentSpeed = this.easeToward(this.currentSpeed, 0, deltaMs, this.decelerationTimeConstant);
        if (this.currentSpeed < 1) {
          this.currentSpeed = 0;
        }
        break;
    }

    // Calculate new scroll position
    const pixelsToScroll = this.currentSpeed * deltaTime;
    let newScrollTop = currentScroll + pixelsToScroll;

    // CRITICAL: Never scroll past the boundary (last spoken position)
    if (newScrollTop > boundaryScroll) {
      newScrollTop = boundaryScroll;
      // If we hit the boundary and we're off-script, stop
      if (this.scrollState === ScrollState.OFF_SCRIPT) {
        this.currentSpeed = 0;
      }
    }

    // Clamp to valid range
    if (newScrollTop >= maxScroll) {
      this.container.scrollTop = maxScroll;
      this.stopScrolling();
      return;
    }

    this.container.scrollTop = Math.max(0, newScrollTop);

    this.animationId = requestAnimationFrame(() => this.tick());
  }

  adjustSpeed(overshootPixels) {
    if (this.totalWords === 0) return;

    // Calculate target speed based on speaking pace
    const maxScroll = this.container.scrollHeight - this.container.clientHeight;
    const pixelsPerWord = maxScroll / this.totalWords;
    const paceBasedSpeed = this.speakingPace * pixelsPerWord;

    // Base speed is either pace-based or minimum base speed
    let targetSpeed = Math.max(paceBasedSpeed, this.baseSpeed * 0.5);

    // Adjust for position - speed up if behind, slow down if ahead
    if (overshootPixels < -50) {
      // We're behind by 50+ pixels - speed up
      const behindFactor = Math.min((-overshootPixels) / 100, 3);
      targetSpeed *= (1 + behindFactor);
    } else if (overshootPixels > 10) {
      // We're ahead by 10+ pixels - slow down significantly
      targetSpeed *= Math.max(0.1, 1 - (overshootPixels / 50));
    }

    // Clamp speed to reasonable range
    targetSpeed = Math.max(5, Math.min(targetSpeed, this.baseSpeed * 4));

    // Smooth speed changes
    this.currentSpeed = this.currentSpeed * 0.85 + targetSpeed * 0.15;
  }

  // Get state for debugging
  getState() {
    return {
      targetWordIndex: this.targetWordIndex,
      speakingPace: this.speakingPace.toFixed(1),
      currentSpeed: this.currentSpeed.toFixed(0),
      isScrolling: this.isScrolling,
      scrollState: this.scrollState,
      lastMatchedPosition: this.lastMatchedPosition
    };
  }

  stop() {
    this.stopScrolling();
  }

  reset() {
    this.stop();
    this.targetWordIndex = 0;
    this.lastWordIndex = 0;
    this.lastMatchTime = 0;
    this.speakingPace = 0;
    this.currentSpeed = 0;
    this.totalWords = 0;
    this.scrollState = ScrollState.CONFIDENT;
    this.uncertainStartTime = null;
    this.lastMatchedPosition = 0;
  }
}
