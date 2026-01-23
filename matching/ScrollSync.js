// Scroll synchronization module
// Pace-based scrolling that follows speaking rhythm

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
    this.lastFrameTime = now;

    // Check if we should stop (no speech for overshootTime)
    const timeSinceLastMatch = Date.now() - this.lastMatchTime;
    if (timeSinceLastMatch > this.overshootTime) {
      // Quickly slow down and stop
      this.currentSpeed *= 0.85;
      if (this.currentSpeed < 10) {
        this.stopScrolling();
        return;
      }
    } else {
      // Adjust speed based on position relative to target
      this.adjustSpeed();
    }

    // Scroll
    const pixelsToScroll = this.currentSpeed * deltaTime;
    const newScrollTop = this.container.scrollTop + pixelsToScroll;
    const maxScroll = this.container.scrollHeight - this.container.clientHeight;

    if (newScrollTop >= maxScroll) {
      this.container.scrollTop = maxScroll;
      this.stopScrolling();
      return;
    }

    this.container.scrollTop = newScrollTop;

    this.animationId = requestAnimationFrame(() => this.tick());
  }

  adjustSpeed() {
    if (this.totalWords === 0) return;

    // Where we are vs where we should be
    const currentScrollFraction = this.container.scrollTop /
      (this.container.scrollHeight - this.container.clientHeight);
    const targetScrollFraction = this.targetWordIndex / this.totalWords;

    // How far behind/ahead we are (positive = behind, need to speed up)
    const gap = targetScrollFraction - currentScrollFraction;

    // Calculate target speed based on speaking pace
    // Estimate: average word is ~5 characters, line is ~60 chars,
    // so roughly 12 words per line. Adjust based on font size.
    const pixelsPerWord = (this.container.scrollHeight - this.container.clientHeight) / this.totalWords;
    const paceBasedSpeed = this.speakingPace * pixelsPerWord;

    // Base speed is either pace-based or minimum base speed
    let targetSpeed = Math.max(paceBasedSpeed, this.baseSpeed * 0.5);

    // Adjust for gap - speed up if behind, slow down if ahead
    if (gap > 0.01) {
      // We're behind - speed up proportionally
      targetSpeed *= (1 + gap * 8);
    } else if (gap < -0.01) {
      // We're ahead - slow down aggressively
      // gap of -0.05 means we're 5% ahead, should slow to ~25% speed
      targetSpeed *= Math.max(0.15, 1 + gap * 10);
    }

    // Clamp speed to reasonable range
    targetSpeed = Math.max(10, Math.min(targetSpeed, this.baseSpeed * 4));

    // Smooth speed changes
    this.currentSpeed = this.currentSpeed * 0.9 + targetSpeed * 0.1;
  }

  // Get state for debugging
  getState() {
    return {
      targetWordIndex: this.targetWordIndex,
      speakingPace: this.speakingPace.toFixed(1),
      currentSpeed: this.currentSpeed.toFixed(0),
      isScrolling: this.isScrolling
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
  }
}
