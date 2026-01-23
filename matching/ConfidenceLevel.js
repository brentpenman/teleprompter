/**
 * ConfidenceLevel - Compound confidence scoring for position matches
 *
 * Calculates confidence from multiple signals:
 * - Fuse.js match quality (inverted score)
 * - Consecutive match ratio
 * - Recency (time since last match)
 *
 * Returns high/medium/low confidence levels for visual feedback.
 */
class ConfidenceCalculator {
  constructor(options = {}) {
    // Thresholds for level classification
    this.highThreshold = options.highThreshold ?? 0.7;
    this.lowThreshold = options.lowThreshold ?? 0.4;

    // Weights for compound calculation
    this.matchScoreWeight = options.matchScoreWeight ?? 0.5;
    this.consecutiveWeight = options.consecutiveWeight ?? 0.3;
    this.recencyWeight = options.recencyWeight ?? 0.2;
  }

  /**
   * Invert Fuse.js score to confidence
   * Fuse.js: 0 = perfect match, 1 = no match
   * Confidence: 0 = no match, 1 = perfect match
   * @param {number} fuseScore - Fuse.js match score (0-1)
   * @returns {number} Confidence value (0-1)
   */
  invertFuseScore(fuseScore) {
    return 1 - Math.min(fuseScore, 1);
  }

  /**
   * Calculate compound confidence from multiple signals
   * @param {number} fuseScore - Fuse.js match score (0 = perfect, 1 = bad)
   * @param {number} consecutiveMatches - Number of consecutive good matches
   * @param {number} windowSize - Size of the match window
   * @param {number} msSinceLastMatch - Milliseconds since last successful match
   * @returns {number} Raw confidence value (0-1)
   */
  calculate(fuseScore, consecutiveMatches, windowSize, msSinceLastMatch) {
    // Convert Fuse score to confidence (0 = bad, 1 = good)
    const matchQuality = this.invertFuseScore(fuseScore);

    // Ratio of consecutive matches to window size
    const consecutiveRatio = consecutiveMatches / windowSize;

    // Recency factor decays over 5 seconds
    const recencyFactor = Math.max(0, 1 - (msSinceLastMatch / 5000));

    // Weighted combination
    const rawConfidence =
      (matchQuality * this.matchScoreWeight) +
      (consecutiveRatio * this.consecutiveWeight) +
      (recencyFactor * this.recencyWeight);

    return rawConfidence;
  }

  /**
   * Convert raw confidence to discrete level
   * @param {number} rawConfidence - Raw confidence value (0-1)
   * @returns {'high' | 'medium' | 'low'} Confidence level
   */
  toLevel(rawConfidence) {
    if (rawConfidence >= this.highThreshold) return 'high';
    if (rawConfidence >= this.lowThreshold) return 'medium';
    return 'low';
  }
}

export { ConfidenceCalculator };
