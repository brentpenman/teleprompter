// Scroll synchronization module
// Scrolls teleprompter to keep matched position at reading marker

export class ScrollSync {
  constructor(containerElement, textElement, options = {}) {
    this.container = containerElement;
    this.textElement = textElement;

    // Animation timing from CONTEXT.md: 200-500ms smooth animation
    this.scrollDuration = options.scrollDuration || 300;

    // Track speaking pace for adaptive scroll
    this.lastScrollTime = 0;
    this.lastPosition = 0;
    this.speakingPace = 0;  // words per second

    // For cancelling in-progress scrolls
    this.scrollAnimationId = null;
  }

  // Scroll to word position in script
  scrollToWordIndex(wordIndex, totalWords) {
    if (wordIndex < 0 || totalWords <= 0) return;

    // Calculate progress through script (0 to 1)
    const progress = wordIndex / totalWords;

    // Calculate target scroll position
    // Total scrollable distance = scrollHeight - clientHeight
    const maxScroll = this.container.scrollHeight - this.container.clientHeight;
    const targetScroll = Math.round(progress * maxScroll);

    // Track pace for future adaptive scrolling
    this.updateSpeakingPace(wordIndex);

    // Smooth scroll to position
    this.smoothScrollTo(targetScroll);
  }

  // Smooth scroll animation using native scroll-behavior
  smoothScrollTo(targetTop) {
    // Cancel any in-progress animation
    if (this.scrollAnimationId) {
      cancelAnimationFrame(this.scrollAnimationId);
    }

    const startTop = this.container.scrollTop;
    const distance = targetTop - startTop;

    // Skip if already at target or very small movement
    if (Math.abs(distance) < 5) return;

    const startTime = performance.now();
    const duration = this.scrollDuration;

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      this.container.scrollTop = startTop + (distance * eased);

      if (progress < 1) {
        this.scrollAnimationId = requestAnimationFrame(animate);
      } else {
        this.scrollAnimationId = null;
      }
    };

    this.scrollAnimationId = requestAnimationFrame(animate);
  }

  // Track speaking pace for adaptive behavior (Phase 4)
  updateSpeakingPace(wordIndex) {
    const now = Date.now();

    if (this.lastScrollTime > 0) {
      const timeDelta = (now - this.lastScrollTime) / 1000;  // seconds
      const wordsDelta = wordIndex - this.lastPosition;

      if (timeDelta > 0 && wordsDelta > 0) {
        // Smoothed pace calculation
        const instantPace = wordsDelta / timeDelta;
        this.speakingPace = this.speakingPace * 0.7 + instantPace * 0.3;
      }
    }

    this.lastScrollTime = now;
    this.lastPosition = wordIndex;
  }

  // Get current speaking pace (for future confidence/speed logic)
  getSpeakingPace() {
    return this.speakingPace;
  }

  // Stop any in-progress scroll animation
  stop() {
    if (this.scrollAnimationId) {
      cancelAnimationFrame(this.scrollAnimationId);
      this.scrollAnimationId = null;
    }
  }

  // Reset state (e.g., when script changes)
  reset() {
    this.stop();
    this.lastScrollTime = 0;
    this.lastPosition = 0;
    this.speakingPace = 0;
  }
}
