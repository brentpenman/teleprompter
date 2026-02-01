/**
 * ScrollController - Velocity-Based Scroll Control for Teleprompter
 *
 * Provides smooth continuous scrolling driven by speaking pace with
 * proportional position correction. Unlike target-chasing approaches,
 * this maintains constant forward motion and adjusts speed to stay
 * in sync with confirmed speech position.
 *
 * Key design principles:
 * - Continuous motion: always scrolling forward at pace-derived speed
 * - Velocity-based: manipulates scroll speed, not position targets
 * - Proportional correction: gently adjusts speed to maintain sync
 * - Speech-driven: base scroll speed derived from speaking pace
 *
 * @module ScrollController
 */

/**
 * @typedef {Object} ScrollControllerOptions
 * @property {number} [caretPercent=33] - Caret position as % from top (33 = upper third)
 * @property {number} [holdTimeout=5000] - ms of silence before holding state
 * @property {number} [correctionGain=1.5] - Proportional gain for position correction
 * @property {number} [maxCorrectionSpeed=200] - Maximum correction speed in px/sec
 * @property {number} [syncDeadband=3] - Position error (px) to ignore
 * @property {number} [correctionSmoothing=3] - Smoothing rate for correction speed (higher = faster response)
 * @property {number} [minPace=0.5] - minimum words/second
 * @property {number} [maxPace=10] - maximum words/second
 * @property {number} [catchUpMultiplier=3] - Speed multiplier during skip catch-up
 * @property {Function} [onStateChange] - callback when tracking/holding state changes
 */

/**
 * Velocity-based scroll controller for teleprompter display.
 *
 * Maintains continuous forward scrolling at a speed derived from speaking
 * pace, with proportional correction to stay aligned with confirmed position.
 *
 * @example
 * const controller = new ScrollController(container, positionTracker, 100, {
 *   caretPercent: 33,
 *   onStateChange: (state) => console.log('State:', state)
 * });
 * controller.start();
 *
 * // When position advances:
 * controller.onPositionAdvanced(10, 5);
 */
export class ScrollController {
  /**
   * Create a new ScrollController.
   *
   * @param {HTMLElement} container - Scrollable container element
   * @param {PositionTracker} positionTracker - Position source (Phase 6)
   * @param {number} totalWords - Total words in script
   * @param {ScrollControllerOptions} [options] - Configuration options
   */
  constructor(container, positionTracker, totalWords, options = {}) {
    const {
      caretPercent = 33,
      holdTimeout = 5000,
      correctionGain = 1.5,
      maxCorrectionSpeed = 200,
      syncDeadband = 3,
      correctionSmoothing = 3,
      minPace = 0.5,
      maxPace = 10,
      catchUpMultiplier = 3,
      onStateChange = () => {}
    } = options;

    /** @type {HTMLElement} Scrollable container */
    this.container = container;

    /** @type {Object} PositionTracker instance */
    this.positionTracker = positionTracker;

    /** @type {number} Total words in script */
    this.totalWords = totalWords;

    /** @type {number} Caret position as percentage from top */
    this.caretPercent = caretPercent;

    /** @type {number} Timeout (ms) before transitioning to holding state */
    this.holdTimeout = holdTimeout;

    /** @type {number} Proportional gain for position correction */
    this.correctionGain = correctionGain;

    /** @type {number} Maximum correction speed in px/sec */
    this.maxCorrectionSpeed = maxCorrectionSpeed;

    /** @type {number} Position error (px) below which no correction is applied */
    this.syncDeadband = syncDeadband;

    /** @type {number} Smoothing rate for correction speed changes */
    this.correctionSmoothing = correctionSmoothing;

    /** @type {number} Minimum words per second */
    this.minPace = minPace;

    /** @type {number} Maximum words per second */
    this.maxPace = maxPace;

    /** @type {number} Speed multiplier during skip catch-up */
    this.catchUpMultiplier = catchUpMultiplier;

    /** @type {Function} Callback for state changes */
    this.onStateChange = onStateChange;

    // Animation state
    /** @type {number|null} requestAnimationFrame ID */
    this.animationId = null;

    /** @type {number} Last animation frame timestamp */
    this.lastTimestamp = 0;

    /** @type {boolean} Whether in catch-up mode (after skip) */
    this.isCatchingUp = false;

    /** @type {number} Smoothed correction speed (prevents sudden jumps) */
    this.smoothedCorrectionSpeed = 0;

    // Pace tracking
    /** @type {number} Current speaking pace in words/second */
    this.speakingPace = 2.5; // ~150wpm default

    /** @type {number} Last position for pace calculation */
    this.lastPosition = 0;

    /** @type {number} Timestamp of last position update (-1 = not set) */
    this.lastPositionTime = -1;

    // Tracking state
    /** @type {boolean} Whether actively tracking speech */
    this.isTracking = false;

    /** @type {number} Timestamp of last position advance */
    this.lastAdvanceTime = 0;

    /** @type {number} Smoothed display position for interpolation (avoids staircase jumps) */
    this.displayPosition = 0;

    // Bind methods for animation callback
    this.tick = this.tick.bind(this);
  }

  /**
   * Calculate pixels per word based on container dimensions.
   *
   * @returns {number} Pixels scrolled per word of script
   */
  getPixelsPerWord() {
    const scrollHeight = this.container.scrollHeight;
    const containerHeight = this.container.clientHeight;

    // Content area excludes 50vh padding on top and bottom
    const paddingTop = containerHeight * 0.5;
    const paddingBottom = containerHeight * 0.5;
    const contentHeight = scrollHeight - paddingTop - paddingBottom;

    if (this.totalWords === 0) {
      return 0;
    }

    return contentHeight / this.totalWords;
  }

  /**
   * Start scroll control.
   *
   * Begins the animation loop and sets state to tracking.
   */
  start() {
    this.lastTimestamp = performance.now();
    this.lastAdvanceTime = this.lastTimestamp;
    this.isTracking = true;
    this.onStateChange('tracking');
    this.animationId = requestAnimationFrame(this.tick);
  }

  /**
   * Stop scroll control.
   *
   * Cancels the animation loop and sets state to stopped.
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
   * Calculate target scrollTop to position word at caret.
   *
   * Converts a word index to a scroll position that places that word
   * at the caret position (default upper third of screen).
   *
   * @param {number} wordIndex - Word position in script (0-indexed)
   * @returns {number} Target scrollTop value (clamped to valid range)
   */
  positionToScrollTop(wordIndex) {
    const scrollHeight = this.container.scrollHeight;
    const containerHeight = this.container.clientHeight;
    const maxScroll = scrollHeight - containerHeight;

    // Handle edge case of non-scrollable container
    if (maxScroll <= 0) {
      return 0;
    }

    // Handle edge case of zero words
    if (this.totalWords === 0) {
      return 0;
    }

    // Container has 50vh top and bottom padding
    // Content starts at 50vh and ends at scrollHeight - 50vh
    const paddingTop = containerHeight * 0.5;
    const paddingBottom = containerHeight * 0.5;
    const contentHeight = scrollHeight - paddingTop - paddingBottom;

    // Where this word is within the content area
    const wordPercent = wordIndex / this.totalWords;
    const wordPositionInContent = wordPercent * contentHeight;
    const wordPositionInDoc = paddingTop + wordPositionInContent;

    // Offset to position at caret
    const caretOffset = (this.caretPercent / 100) * containerHeight;
    const targetScroll = wordPositionInDoc - caretOffset;

    // Clamp to valid range
    return Math.max(0, Math.min(maxScroll, targetScroll));
  }

  /**
   * Update speaking pace from position change.
   *
   * Calculates instantaneous pace from word position deltas over time,
   * then smooths via exponential moving average.
   *
   * @param {number} newPosition - New word position
   * @param {number} timestamp - Current timestamp (ms)
   */
  updatePace(newPosition, timestamp) {
    if (this.lastPositionTime >= 0 && newPosition > this.lastPosition) {
      const timeDelta = (timestamp - this.lastPositionTime) / 1000; // seconds
      const wordsDelta = newPosition - this.lastPosition;

      // Only update if reasonable time gap (ignore long pauses)
      if (timeDelta > 0 && timeDelta < 5) {
        const instantPace = wordsDelta / timeDelta;

        // Clamp to reasonable bounds
        const clampedPace = Math.max(this.minPace, Math.min(this.maxPace, instantPace));

        // Exponential moving average (70% old, 30% new)
        this.speakingPace = this.speakingPace * 0.7 + clampedPace * 0.3;
      }
    }

    this.lastPosition = newPosition;
    this.lastPositionTime = timestamp;
  }

  /**
   * Calculate base scroll speed from speaking pace.
   *
   * Converts words/second to pixels/second using content dimensions.
   *
   * @returns {number} Base scroll speed in pixels/second
   */
  calculateBaseSpeed() {
    const pixelsPerWord = this.getPixelsPerWord();
    return this.speakingPace * pixelsPerWord;
  }

  /**
   * Animation frame callback.
   *
   * Implements velocity-based scrolling with proportional correction:
   * 1. Calculate base speed from speaking pace
   * 2. Calculate position error (expected vs actual)
   * 3. Apply proportional correction to speed
   * 4. Apply scroll increment
   *
   * @param {number} timestamp - requestAnimationFrame timestamp
   */
  tick(timestamp) {
    const dt = (timestamp - this.lastTimestamp) / 1000; // seconds
    this.lastTimestamp = timestamp;

    // Avoid huge jumps on first frame or after pause
    if (dt > 0.1) {
      this.animationId = requestAnimationFrame(this.tick);
      return;
    }

    // Query PositionTracker for current confirmed position
    const confirmedPosition = this.positionTracker.getConfirmedPosition();

    // Check for silence -> hold transition
    if (this.isTracking && timestamp - this.lastAdvanceTime > this.holdTimeout) {
      this.isTracking = false;
      this.onStateChange('holding');
    }

    // Smoothly interpolate display position toward confirmed position
    // This spreads bursty word-match updates into steady forward motion
    if (confirmedPosition > this.displayPosition) {
      const remaining = confirmedPosition - this.displayPosition;
      // Linear advance at speaking pace (consistent baseline motion)
      const paceAdvance = this.speakingPace * 1.5 * dt;
      // Proportional catch-up for larger gaps (prevents accumulating lag)
      const catchUpAdvance = remaining * 3 * dt;
      // Use whichever is larger
      const advance = Math.max(paceAdvance, catchUpAdvance);
      this.displayPosition = Math.min(confirmedPosition, this.displayPosition + advance);
    } else {
      this.displayPosition = confirmedPosition;
    }

    // Calculate expected scroll position for interpolated display word
    const expectedScroll = this.positionToScrollTop(this.displayPosition);
    const currentScroll = this.container.scrollTop;
    const maxScroll = this.container.scrollHeight - this.container.clientHeight;

    // Calculate position error
    const error = expectedScroll - currentScroll;

    // Calculate base scroll speed from speaking pace
    let baseSpeed = this.calculateBaseSpeed();

    // Apply catch-up multiplier if in catch-up mode
    if (this.isCatchingUp) {
      baseSpeed *= this.catchUpMultiplier;
      // Exit catch-up mode when close enough
      if (Math.abs(error) < this.syncDeadband * 2) {
        this.isCatchingUp = false;
      }
    }

    // Calculate target correction speed (proportional control)
    let targetCorrectionSpeed = 0;
    if (Math.abs(error) > this.syncDeadband) {
      // Apply proportional correction
      targetCorrectionSpeed = error * this.correctionGain;
      // Clamp correction to maximum
      targetCorrectionSpeed = Math.max(-this.maxCorrectionSpeed, Math.min(this.maxCorrectionSpeed, targetCorrectionSpeed));
    }

    // Smooth the correction speed (exponential smoothing, frame-rate independent)
    const smoothingFactor = 1 - Math.exp(-this.correctionSmoothing * dt);
    this.smoothedCorrectionSpeed += (targetCorrectionSpeed - this.smoothedCorrectionSpeed) * smoothingFactor;

    // Calculate effective speed
    const effectiveSpeed = baseSpeed + this.smoothedCorrectionSpeed;

    // Apply scroll increment
    const scrollDelta = effectiveSpeed * dt;
    let newScroll = currentScroll + scrollDelta;

    // Clamp to valid range
    newScroll = Math.max(0, Math.min(maxScroll, newScroll));
    this.container.scrollTop = newScroll;

    // Continue animation loop
    this.animationId = requestAnimationFrame(this.tick);
  }

  /**
   * Notify of position advance.
   *
   * Called after PositionTracker.processMatch returns 'advanced'.
   * Updates pace calculation and triggers catch-up mode for skips.
   *
   * @param {number} newPosition - New confirmed position
   * @param {number} prevPosition - Previous confirmed position
   */
  onPositionAdvanced(newPosition, prevPosition) {
    const now = performance.now();

    // Update pace calculation
    this.updatePace(newPosition, now);

    // Check for skip (large jump) - trigger catch-up mode
    const distance = newPosition - prevPosition;
    if (distance > 10) {
      this.isCatchingUp = true;
      // Snap display position closer to avoid prolonged catch-up animation
      this.displayPosition = Math.max(this.displayPosition, newPosition - 3);
    }

    // Resume tracking if holding
    this.lastAdvanceTime = now;
    if (!this.isTracking) {
      this.isTracking = true;
      this.onStateChange('tracking');
    }
  }

  /**
   * Set caret position.
   *
   * Updates caret percent. Position will naturally sync via correction.
   * Clamps to valid range (10-90%).
   *
   * @param {number} percent - Caret position as percentage from top
   */
  setCaretPercent(percent) {
    this.caretPercent = Math.max(10, Math.min(90, percent));
  }

  /**
   * Reset to initial state.
   *
   * Stops animation, resets scroll position, clears all tracking state.
   */
  reset() {
    this.stop();
    // Reset scroll to align first line with caret (don't set to 0)
    // Container has 50vh padding, caret at 33% by default
    const initialScroll = this.container.clientHeight * (0.5 - this.caretPercent / 100);
    this.container.scrollTop = initialScroll;
    this.lastPosition = 0;
    this.lastPositionTime = -1;
    this.speakingPace = 2.5;
    this.isCatchingUp = false;
    this.smoothedCorrectionSpeed = 0;
    this.displayPosition = 0;
  }
}
