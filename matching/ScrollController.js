/**
 * ScrollController - Reactive Scroll Control for Teleprompter
 *
 * Translates confirmed positions from PositionTracker into smooth scroll
 * animations. Keeps upcoming text at a fixed caret position and derives
 * scroll speed from the user's actual speech pace.
 *
 * Key design principles:
 * - Purely reactive: queries PositionTracker for position, never stores it
 * - Frame-rate independent: exponential smoothing animation
 * - Speech-driven: scroll speed derived from speaking pace
 *
 * @module ScrollController
 */

/**
 * @typedef {Object} ScrollControllerOptions
 * @property {number} [caretPercent=33] - Caret position as % from top (33 = upper third)
 * @property {number} [holdTimeout=5000] - ms of silence before holding state
 * @property {number} [baseSpeed=5] - exponential smoothing base speed
 * @property {number} [jumpSpeed=15] - faster speed for skip jumps
 * @property {number} [minPace=0.5] - minimum words/second
 * @property {number} [maxPace=10] - maximum words/second
 * @property {Function} [onStateChange] - callback when tracking/holding state changes
 */

/**
 * Reactive scroll controller for teleprompter display.
 *
 * Responds to position events from PositionTracker rather than driving them.
 * Uses exponential smoothing for frame-rate independent animation.
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
      baseSpeed = 5,
      jumpSpeed = 15,
      minPace = 0.5,
      maxPace = 10,
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

    /** @type {number} Base exponential smoothing speed */
    this.baseSpeed = baseSpeed;

    /** @type {number} Faster speed for skip jumps */
    this.jumpSpeed = jumpSpeed;

    /** @type {number} Minimum words per second */
    this.minPace = minPace;

    /** @type {number} Maximum words per second */
    this.maxPace = maxPace;

    /** @type {Function} Callback for state changes */
    this.onStateChange = onStateChange;

    // Animation state
    /** @type {number|null} requestAnimationFrame ID */
    this.animationId = null;

    /** @type {number} Last animation frame timestamp */
    this.lastTimestamp = 0;

    /** @type {number} Target scroll position */
    this.targetScrollTop = 0;

    /** @type {number|null} Current jump speed (null = use pace-derived) */
    this.currentJumpSpeed = null;

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

    // Bind methods for animation callback
    this.tick = this.tick.bind(this);
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

    // Where this word is in the document (proportional)
    const wordPercent = wordIndex / this.totalWords;
    const wordPositionInDoc = wordPercent * scrollHeight;

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
   * Calculate scroll speed for exponential smoothing.
   *
   * Returns jumpSpeed if set (during skip), otherwise calculates
   * proportional speed based on current speaking pace.
   *
   * @returns {number} Speed for exponential smoothing formula
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
   * Animation frame callback.
   *
   * Implements exponential smoothing scroll animation:
   * newScroll = current + (target - current) * (1 - exp(-speed * dt))
   *
   * This formula is frame-rate independent.
   *
   * @param {number} timestamp - requestAnimationFrame timestamp
   */
  tick(timestamp) {
    const dt = (timestamp - this.lastTimestamp) / 1000; // seconds
    this.lastTimestamp = timestamp;

    // Query PositionTracker for current position
    const confirmedPosition = this.positionTracker.getConfirmedPosition();

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
   * Notify of position advance.
   *
   * Called after PositionTracker.processMatch returns 'advanced'.
   * Updates pace calculation, sets jump speed for skips, and
   * resumes tracking if in holding state.
   *
   * @param {number} newPosition - New confirmed position
   * @param {number} prevPosition - Previous confirmed position
   */
  onPositionAdvanced(newPosition, prevPosition) {
    const now = performance.now();

    // Update pace calculation
    this.updatePace(newPosition, now);

    // Check for skip (large jump)
    const distance = newPosition - prevPosition;
    if (distance > 10) {
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
   * Set caret position.
   *
   * Updates caret percent and recalculates target for current position.
   * Clamps to valid range (10-90%).
   *
   * @param {number} percent - Caret position as percentage from top
   */
  setCaretPercent(percent) {
    this.caretPercent = Math.max(10, Math.min(90, percent));
    // Recalculate target for current position
    const currentPosition = this.positionTracker.getConfirmedPosition();
    this.targetScrollTop = this.positionToScrollTop(currentPosition);
  }

  /**
   * Reset to initial state.
   *
   * Stops animation, resets scroll position, clears all tracking state.
   */
  reset() {
    this.stop();
    this.container.scrollTop = 0;
    this.targetScrollTop = 0;
    this.lastPosition = 0;
    this.lastPositionTime = -1;
    this.speakingPace = 2.5;
    this.currentJumpSpeed = null;
  }
}
