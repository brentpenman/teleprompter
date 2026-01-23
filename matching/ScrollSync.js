// Scroll synchronization module
// Smoothly scrolls teleprompter to follow voice position

export class ScrollSync {
  constructor(containerElement, textElement, options = {}) {
    this.container = containerElement;
    this.textElement = textElement;

    // Tolerance: how many words ahead/behind before we consider it a "jump"
    this.jumpThreshold = options.jumpThreshold || 20;

    // Smooth follow speed (pixels per frame at 60fps)
    this.baseScrollSpeed = options.baseScrollSpeed || 3;

    // Target tracking
    this.targetWordIndex = 0;
    this.targetScrollTop = 0;
    this.totalWords = 0;

    // Animation loop
    this.animationId = null;
    this.isFollowing = false;

    // Track last position for jump detection
    this.lastWordIndex = 0;
  }

  // Update target position based on matched word
  scrollToWordIndex(wordIndex, totalWords) {
    if (wordIndex < 0 || totalWords <= 0) return;

    this.totalWords = totalWords;

    // Calculate target scroll position
    const progress = wordIndex / totalWords;
    const maxScroll = this.container.scrollHeight - this.container.clientHeight;
    this.targetScrollTop = Math.round(progress * maxScroll);

    // Detect if this is a jump (user skipped around)
    const wordDelta = Math.abs(wordIndex - this.lastWordIndex);
    const isJump = wordDelta > this.jumpThreshold;

    this.lastWordIndex = wordIndex;
    this.targetWordIndex = wordIndex;

    if (isJump) {
      // User skipped - do a quick animated jump
      this.jumpTo(this.targetScrollTop);
    } else {
      // Normal progression - start/continue smooth following
      if (!this.isFollowing) {
        this.startFollowing();
      }
    }
  }

  // Quick animated jump for when user skips around
  jumpTo(targetTop) {
    this.stopFollowing();

    const startTop = this.container.scrollTop;
    const distance = targetTop - startTop;

    if (Math.abs(distance) < 5) return;

    const startTime = performance.now();
    const duration = 400; // Quick but smooth jump

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);

      this.container.scrollTop = startTop + (distance * eased);

      if (progress < 1) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        this.animationId = null;
        // Resume following after jump completes
        this.startFollowing();
      }
    };

    this.animationId = requestAnimationFrame(animate);
  }

  // Start the smooth following animation loop
  startFollowing() {
    if (this.isFollowing) return;
    this.isFollowing = true;
    this.follow();
  }

  // Stop following
  stopFollowing() {
    this.isFollowing = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  // Smooth following loop - gradually moves toward target
  follow() {
    if (!this.isFollowing) return;

    const currentTop = this.container.scrollTop;
    const distance = this.targetScrollTop - currentTop;

    // If we're close enough, just stay here
    if (Math.abs(distance) < 2) {
      this.animationId = requestAnimationFrame(() => this.follow());
      return;
    }

    // Calculate scroll speed based on how far behind we are
    // Faster catch-up if we're further behind
    const catchUpFactor = Math.min(Math.abs(distance) / 100, 3);
    const speed = this.baseScrollSpeed * (1 + catchUpFactor);

    // Move toward target
    const step = Math.sign(distance) * Math.min(speed, Math.abs(distance));
    this.container.scrollTop = currentTop + step;

    this.animationId = requestAnimationFrame(() => this.follow());
  }

  // Get current state for debugging
  getState() {
    return {
      targetWordIndex: this.targetWordIndex,
      targetScrollTop: this.targetScrollTop,
      currentScrollTop: this.container.scrollTop,
      isFollowing: this.isFollowing
    };
  }

  // Stop animation
  stop() {
    this.stopFollowing();
  }

  // Reset state
  reset() {
    this.stop();
    this.targetWordIndex = 0;
    this.targetScrollTop = 0;
    this.lastWordIndex = 0;
    this.totalWords = 0;
  }
}
