/**
 * PositionTracker - Stateful Position Management with Two-Position Model
 *
 * Single source of truth for position in the v1.1 following-along pipeline.
 * Receives match candidates from WordMatcher and decides when to advance.
 *
 * Key design principles:
 * - Monotonic: confirmedPosition only moves forward (never backward)
 * - Conservative: requires high confidence before advancing
 * - Two-position model: confirmed (floor) and candidate (ceiling)
 *
 * @module PositionTracker
 */

/**
 * @typedef {Object} MatchCandidate
 * @property {number} position - End word index of match (0-indexed)
 * @property {number} startPosition - Start word index of match (0-indexed)
 * @property {number} matchCount - Number of words matched
 * @property {number} combinedScore - Final score (higher=better, 0-1 range)
 * @property {number} startOffset - Character offset for highlighting start
 * @property {number} endOffset - Character offset for highlighting end
 */

/**
 * @typedef {Object} ProcessResult
 * @property {'advanced'|'hold'|'exploring'} action - What happened
 * @property {number} confirmedPosition - Current confirmed position after processing
 * @property {number} [candidatePosition] - Current candidate position (when exploring)
 * @property {number} [consecutiveCount] - Current consecutive match count (when exploring)
 * @property {number} [requiredCount] - Required consecutive matches for confirmation (when exploring)
 */

/**
 * @typedef {Object} PositionTrackerOptions
 * @property {number} [confidenceThreshold=0.7] - Minimum combinedScore to advance
 * @property {number} [nearbyThreshold=10] - Maximum distance for "nearby" matches
 * @property {number} [smallSkipConsecutive=4] - Consecutive matches required for small skips (10-50 words)
 * @property {number} [largeSkipConsecutive=5] - Consecutive matches required for large skips (50+ words)
 * @property {number} [largeSkipThreshold=50] - Distance threshold for large skip detection
 * @property {number} [consecutiveGap=2] - Maximum gap between matches to be considered consecutive
 */

/**
 * Stateful position tracker with monotonic forward movement.
 *
 * Maintains two internal positions:
 * - confirmedPosition (floor): stable, only moves forward on high-confidence matches
 * - candidatePosition (ceiling): exploratory, tracks potential matches
 *
 * @example
 * const tracker = new PositionTracker({ confidenceThreshold: 0.7 });
 * const result = tracker.processMatch({ position: 10, combinedScore: 0.9, ... });
 * // result.action = 'advanced', result.confirmedPosition = 10
 *
 * const boundary = tracker.getScrollBoundary(); // 10
 */
export class PositionTracker {
  /**
   * Create a new PositionTracker.
   *
   * @param {PositionTrackerOptions} [options] - Configuration options
   */
  constructor(options = {}) {
    const {
      confidenceThreshold = 0.7,
      nearbyThreshold = 10,
      smallSkipConsecutive = 4,
      largeSkipConsecutive = 5,
      largeSkipThreshold = 50,
      consecutiveGap = 2
    } = options;

    /** @type {number} Minimum score to advance position */
    this.confidenceThreshold = confidenceThreshold;

    /** @type {number} Maximum distance considered "nearby" */
    this.nearbyThreshold = nearbyThreshold;

    /** @type {number} Consecutive matches required for small skips (10-50 words) */
    this.smallSkipConsecutive = smallSkipConsecutive;

    /** @type {number} Consecutive matches required for large skips (50+ words) */
    this.largeSkipConsecutive = largeSkipConsecutive;

    /** @type {number} Distance threshold for large skip detection */
    this.largeSkipThreshold = largeSkipThreshold;

    /** @type {number} Maximum gap between matches to be considered consecutive */
    this.consecutiveGap = consecutiveGap;

    /** @type {number} Stable floor position (only moves forward) */
    this.confirmedPosition = 0;

    /** @type {number} Exploratory ceiling position */
    this.candidatePosition = 0;

    /** @type {number} Current count of consecutive matches during skip exploration */
    this.consecutiveMatchCount = 0;

    /** @type {number} End position of last match for consecutive detection */
    this.lastMatchEndPosition = -1;
  }

  /**
   * Get the current confirmed position.
   *
   * @returns {number} The confirmed position (floor)
   */
  getConfirmedPosition() {
    return this.confirmedPosition;
  }

  /**
   * Get the scroll boundary for external code.
   *
   * Alias for getConfirmedPosition - external code should scroll
   * up to this position but not beyond.
   *
   * @returns {number} The scroll boundary (same as confirmedPosition)
   */
  getScrollBoundary() {
    return this.confirmedPosition;
  }

  /**
   * Calculate required consecutive matches based on skip distance.
   *
   * Distance thresholds:
   * - distance <= nearbyThreshold: 1 (normal tracking, no skip confirmation)
   * - distance <= largeSkipThreshold: smallSkipConsecutive (default 4)
   * - distance > largeSkipThreshold: largeSkipConsecutive (default 5)
   *
   * @param {number} distance - Distance in words from confirmedPosition
   * @returns {number} Required consecutive match count
   */
  getRequiredConsecutive(distance) {
    if (distance <= this.nearbyThreshold) {
      return 1;
    }
    if (distance <= this.largeSkipThreshold) {
      return this.smallSkipConsecutive;
    }
    return this.largeSkipConsecutive;
  }

  /**
   * Check if a candidate match is consecutive with the last match.
   *
   * A match is consecutive if its startPosition is within consecutiveGap
   * words of the previous match's endPosition. This allows small gaps
   * for filler word filtering.
   *
   * @param {MatchCandidate} candidate - Match candidate to check
   * @returns {boolean} True if match is consecutive
   */
  isConsecutiveMatch(candidate) {
    if (this.lastMatchEndPosition < 0) {
      return false;
    }
    const gap = candidate.startPosition - this.lastMatchEndPosition;
    return gap >= 0 && gap <= this.consecutiveGap;
  }

  /**
   * Reset the consecutive match streak.
   *
   * Called when a non-consecutive match is detected or when the
   * streak needs to start fresh from a new skip location.
   */
  resetStreak() {
    this.consecutiveMatchCount = 0;
    this.lastMatchEndPosition = -1;
  }

  /**
   * Process a match candidate and decide whether to advance position.
   *
   * Confirmation rules:
   * 1. Ignore null/undefined candidates (hold)
   * 2. Ignore matches with combinedScore < confidenceThreshold (hold)
   * 3. Ignore backward matches (position <= confirmedPosition) (hold)
   * 4. For nearby matches (distance <= nearbyThreshold): advance immediately
   * 5. For distant matches (skip detection):
   *    - Check if match is consecutive with previous
   *    - If not consecutive: reset streak, start new exploration
   *    - If consecutive: increment streak
   *    - If streak >= required: advance position
   *    - Otherwise: return exploring state
   *
   * @param {MatchCandidate|null|undefined} candidate - Match from WordMatcher
   * @returns {ProcessResult} Result indicating action taken and current positions
   */
  processMatch(candidate) {
    // Handle null/undefined gracefully
    if (!candidate) {
      return {
        action: 'hold',
        confirmedPosition: this.confirmedPosition
      };
    }

    const { position, startPosition, combinedScore } = candidate;

    // Check confidence threshold
    if (combinedScore < this.confidenceThreshold) {
      return {
        action: 'hold',
        confirmedPosition: this.confirmedPosition
      };
    }

    // Check monotonic constraint (must be strictly forward)
    if (position <= this.confirmedPosition) {
      return {
        action: 'hold',
        confirmedPosition: this.confirmedPosition
      };
    }

    // Calculate distance from confirmed position
    const distance = position - this.confirmedPosition;
    const requiredConsecutive = this.getRequiredConsecutive(distance);

    // Nearby match - advance immediately (no skip confirmation needed)
    if (requiredConsecutive === 1) {
      this.confirmedPosition = position;
      this.candidatePosition = position;
      this.resetStreak();
      return {
        action: 'advanced',
        confirmedPosition: this.confirmedPosition
      };
    }

    // Distant match - skip detection with consecutive confirmation
    // Check if this match is consecutive with previous
    const isConsecutive = this.isConsecutiveMatch(candidate);

    if (isConsecutive) {
      // Continue the streak
      this.consecutiveMatchCount++;
    } else {
      // Start a new streak from this match
      this.consecutiveMatchCount = 1;
    }

    // Track this match for next consecutive check
    this.lastMatchEndPosition = position;
    this.candidatePosition = position;

    // Check if streak is complete
    if (this.consecutiveMatchCount >= requiredConsecutive) {
      // Skip confirmed! Advance position
      this.confirmedPosition = position;
      this.resetStreak();
      return {
        action: 'advanced',
        confirmedPosition: this.confirmedPosition
      };
    }

    // Still building streak - return exploring state
    return {
      action: 'exploring',
      confirmedPosition: this.confirmedPosition,
      candidatePosition: this.candidatePosition,
      consecutiveCount: this.consecutiveMatchCount,
      requiredCount: requiredConsecutive
    };
  }

  /**
   * Reset all positions to initial state.
   *
   * Called when user restarts from beginning or loads new script.
   */
  reset() {
    this.confirmedPosition = 0;
    this.candidatePosition = 0;
    this.resetStreak();
  }
}
