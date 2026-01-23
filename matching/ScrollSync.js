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

    const maxScroll = this.container.scrollHeight - this.container.clientHeight;
    const targetScroll = (this.targetWordIndex / this.totalWords) * maxScroll;
    const currentScroll = this.container.scrollTop;

    // How far past target are we? (positive = past target)
    const overshootPixels = currentScroll - targetScroll;

    // Check if we should stop
    const timeSinceLastMatch = Date.now() - this.lastMatchTime;
    const isSpeechPaused = timeSinceLastMatch > this.overshootTime;

    if (isSpeechPaused) {
      // Speech has paused - stop if we're at or past target
      if (overshootPixels >= 0) {
        this.stopScrolling();
        return;
      }
      // Still behind target, keep going but slow down
      this.currentSpeed *= 0.9;
      if (this.currentSpeed < 10) {
        this.stopScrolling();
        return;
      }
    } else {
      // Still speaking - adjust speed based on position
      this.adjustSpeed(overshootPixels);
    }

    // Scroll
    const pixelsToScroll = this.currentSpeed * deltaTime;
    const newScrollTop = currentScroll + pixelsToScroll;

    if (newScrollTop >= maxScroll) {
      this.container.scrollTop = maxScroll;
      this.stopScrolling();
      return;
    }

    this.container.scrollTop = newScrollTop;

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
