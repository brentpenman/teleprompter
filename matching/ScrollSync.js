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
    this.silenceThreshold = options.silenceThreshold || 2000; // 2 seconds of no speech -> uncertain

    // Easing time constants (ms)
    this.accelerationTimeConstant = options.accelerationTimeConstant || 1500;
    this.decelerationTimeConstant = options.decelerationTimeConstant || 500;
    this.resumeTimeConstant = options.resumeTimeConstant || 1000;

    // Position-based speed adjustment thresholds
    this.behindThreshold = options.behindThreshold || 50;  // pixels behind before speedup
    this.aheadThreshold = options.aheadThreshold || 10;    // pixels ahead before slowdown
    this.behindMax = options.behindMax || 0.5;             // max multiplier addition when behind

    // Skip detection
    this.shortSkipThreshold = 20;  // words - below this, smooth scroll
    this.longSkipThreshold = 100;  // words - above this, instant jump
    this.maxForwardSkip = options.maxForwardSkip || 50;  // max words to skip forward
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
  // Returns { state, positionAccepted } so caller knows if position was used
  updateConfidence(matchResult) {
    const now = Date.now();
    const prevState = this.scrollState;
    const level = matchResult.level; // 'high', 'medium', 'low'

    // Pre-check: would this position be rejected as too large a skip?
    let positionAccepted = false;
    if (matchResult.position !== null && level === 'high') {
      const distance = matchResult.position - this.targetWordIndex;
      const absDistance = Math.abs(distance);
      const isForward = distance > 0;

      if (absDistance > 5 && isForward && absDistance > this.maxForwardSkip) {
        // Reject this position - too large a forward skip
        console.log(`[Scroll] Rejecting forward skip of ${absDistance} words (max: ${this.maxForwardSkip})`);
        // Treat as if no position was found
        matchResult = { ...matchResult, position: null, level: 'low' };
      }
    }

    // Update last matched position only if we have an accepted match
    if (matchResult.position !== null && matchResult.level === 'high') {
      this.lastMatchedPosition = Math.max(this.lastMatchedPosition, matchResult.position);
      positionAccepted = true;
    }

    const effectiveLevel = matchResult.level;

    switch (this.scrollState) {
      case ScrollState.CONFIDENT:
        if (effectiveLevel === 'high') {
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
        if (effectiveLevel === 'high') {
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
        if (effectiveLevel === 'high' && matchResult.position !== null) {
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
    this.onConfidenceChange(effectiveLevel, matchResult.confidence);

    return { state: this.scrollState, positionAccepted };
  }

  // Handle a confident match - includes skip detection and pace calculation
  handleMatch(matchResult) {
    const now = Date.now();
    const distance = matchResult.position - this.targetWordIndex;
    const absDistance = Math.abs(distance);
    const isForward = distance > 0;

    // Calculate speaking pace before skip detection
    if (this.lastMatchTime > 0 && matchResult.position > this.lastWordIndex) {
      const timeDelta = (now - this.lastMatchTime) / 1000; // seconds
      const wordsDelta = matchResult.position - this.lastWordIndex;

      if (timeDelta > 0 && timeDelta < 5) { // Ignore long gaps
        const instantPace = wordsDelta / timeDelta;
        // Smooth the pace calculation
        this.speakingPace = this.speakingPace * 0.6 + instantPace * 0.4;
      }
    }

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

    this.lastMatchTime = now;
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

    // Check for silence (no matches for a while) - auto-transition to uncertain
    const timeSinceMatch = Date.now() - this.lastMatchTime;
    if (this.scrollState === ScrollState.CONFIDENT && this.lastMatchTime > 0) {
      if (timeSinceMatch > this.silenceThreshold) {
        this.scrollState = ScrollState.UNCERTAIN;
        this.uncertainStartTime = Date.now() - (timeSinceMatch - this.silenceThreshold);
        this.onStateChange(this.scrollState, ScrollState.CONFIDENT);
      }
    } else if (this.scrollState === ScrollState.UNCERTAIN && this.uncertainStartTime) {
      const uncertainDuration = Date.now() - this.uncertainStartTime;
      if (uncertainDuration > this.patientThreshold) {
        this.scrollState = ScrollState.OFF_SCRIPT;
        this.onStateChange(this.scrollState, ScrollState.UNCERTAIN);
      }
    }

    // Determine target speed based on state
    let targetSpeed;
    switch (this.scrollState) {
      case ScrollState.CONFIDENT:
        // Base speed from speaking pace
        targetSpeed = this.calculatePaceBasedSpeed();

        // Adjust for position - speed up if behind, slow down if ahead
        if (overshootPixels < -this.behindThreshold) {
          // We're behind - speed up gradually
          const behindFactor = Math.min((-overshootPixels) / (this.behindThreshold * 4), this.behindMax);
          targetSpeed *= (1 + behindFactor);
        } else if (overshootPixels > this.aheadThreshold) {
          // We're ahead - slow down significantly
          targetSpeed *= Math.max(0.1, 1 - (overshootPixels / (this.aheadThreshold * 5)));
        }

        this._lastTargetSpeed = targetSpeed;
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

  // Set tuning parameters at runtime
  setTuning(params) {
    if (params.baseSpeed !== undefined) this.baseSpeed = params.baseSpeed;
    if (params.behindMax !== undefined) this.behindMax = params.behindMax;
    if (params.behindThreshold !== undefined) this.behindThreshold = params.behindThreshold;
    if (params.aheadThreshold !== undefined) this.aheadThreshold = params.aheadThreshold;
    if (params.accelerationTimeConstant !== undefined) this.accelerationTimeConstant = params.accelerationTimeConstant;
    if (params.decelerationTimeConstant !== undefined) this.decelerationTimeConstant = params.decelerationTimeConstant;
    if (params.patientThreshold !== undefined) this.patientThreshold = params.patientThreshold;
    if (params.maxForwardSkip !== undefined) this.maxForwardSkip = params.maxForwardSkip;
    if (params.silenceThreshold !== undefined) this.silenceThreshold = params.silenceThreshold;
  }

  // Get state for debugging
  getState() {
    return {
      targetWordIndex: this.targetWordIndex,
      speakingPace: this.speakingPace.toFixed(1),
      currentSpeed: this.currentSpeed.toFixed(0),
      targetSpeed: this._lastTargetSpeed ? this._lastTargetSpeed.toFixed(0) : '0',
      isScrolling: this.isScrolling,
      scrollState: this.scrollState,
      lastMatchedPosition: this.lastMatchedPosition,
      totalWords: this.totalWords
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
