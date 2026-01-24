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
 */

/**
 * @typedef {Object} PositionTrackerOptions
 * @property {number} [confidenceThreshold=0.7] - Minimum combinedScore to advance
 * @property {number} [nearbyThreshold=10] - Maximum distance for "nearby" matches
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
      nearbyThreshold = 10
    } = options;

    /** @type {number} Minimum score to advance position */
    this.confidenceThreshold = confidenceThreshold;

    /** @type {number} Maximum distance considered "nearby" */
    this.nearbyThreshold = nearbyThreshold;

    /** @type {number} Stable floor position (only moves forward) */
    this.confirmedPosition = 0;

    /** @type {number} Exploratory ceiling position */
    this.candidatePosition = 0;
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
   * Process a match candidate and decide whether to advance position.
   *
   * Confirmation rules:
   * 1. Ignore null/undefined candidates (hold)
   * 2. Ignore matches with combinedScore < confidenceThreshold (hold)
   * 3. Ignore backward matches (position <= confirmedPosition) (hold)
   * 4. For forward matches with high confidence: advance position
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

    const { position, combinedScore } = candidate;

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

    // High-confidence forward match - advance position
    this.confirmedPosition = position;
    this.candidatePosition = position;

    return {
      action: 'advanced',
      confirmedPosition: this.confirmedPosition
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
  }
}
