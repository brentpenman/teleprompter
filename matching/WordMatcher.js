/**
 * WordMatcher - Stateless Fuzzy Matching with Distance Weighting
 *
 * Pure functions for matching spoken words to script positions.
 * Scores candidates by both fuzzy match quality and positional proximity.
 *
 * Key design principles:
 * - Stateless: no internal state, same inputs always produce same outputs
 * - Position-aware: nearby matches rank higher than distant matches
 * - Consecutive matching: requires multiple words to match in sequence
 */

import Fuse from 'fuse.js';
import { tokenize, filterFillerWords } from './textUtils.js';

/**
 * Build script index and Fuse instance for matching.
 * Call once when script text changes.
 *
 * @param {string} scriptText - The full script text to index
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Fuse.js threshold (0-1, lower is stricter)
 * @returns {Object} Matcher object with scriptIndex, fuse, and scriptWords
 */
export function createMatcher(scriptText, options = {}) {
  const { threshold = 0.3 } = options;

  const scriptWords = tokenize(scriptText);
  const scriptIndex = scriptWords.map((word, index) => ({ word, index }));

  const fuse = new Fuse(scriptIndex, {
    keys: ['word'],
    threshold,
    includeScore: true,
    ignoreLocation: true, // We handle location via distance weighting
    minMatchCharLength: 2
  });

  return { scriptIndex, fuse, scriptWords };
}

/**
 * Find matches for spoken transcript within radius of current position.
 * Pure function - no side effects, no state.
 *
 * @param {string} transcript - Raw spoken words from speech recognition
 * @param {Object} matcher - Result from createMatcher
 * @param {number} currentPosition - Current word position in script
 * @param {Object} options - Search configuration
 * @param {number} options.radius - Search radius around currentPosition (default: 50)
 * @param {number} options.minConsecutive - Minimum consecutive matches required (default: 2)
 * @param {number} options.windowSize - Words to use from transcript (default: 3)
 * @param {number} options.distanceWeight - How much distance affects score 0-1 (default: 0.3)
 * @param {number} options.threshold - Fuse.js threshold for matching (default: 0.3)
 * @returns {Object} Result with candidates array and bestMatch (or null)
 */
export function findMatches(transcript, matcher, currentPosition, options = {}) {
  const {
    radius = 50,
    minConsecutive = 2,
    windowSize = 3,
    distanceWeight = 0.3,
    threshold = 0.3
  } = options;

  const { scriptIndex, fuse } = matcher;

  // Tokenize and filter spoken input
  const words = tokenize(transcript);
  const filtered = filterFillerWords(words);

  // Require minimum consecutive words
  if (filtered.length < minConsecutive) {
    return { candidates: [], bestMatch: null };
  }

  // Use last windowSize words (or all if fewer)
  const window = filtered.slice(-windowSize);

  // Calculate search bounds
  const searchStart = Math.max(0, currentPosition - radius);
  const searchEnd = Math.min(scriptIndex.length, currentPosition + radius);

  // Find consecutive matches within search bounds
  const candidates = [];

  for (let pos = searchStart; pos <= searchEnd - window.length; pos++) {
    let matchCount = 0;
    let totalScore = 0;

    for (let i = 0; i < window.length; i++) {
      const results = fuse.search(window[i]);

      // Find if any result matches this exact position
      const match = results.find(r =>
        r.item.index === pos + i && r.score <= threshold
      );

      if (match) {
        matchCount++;
        totalScore += match.score;
      }
    }

    // Require ALL words to match (consecutive phrase matching)
    if (matchCount === window.length) {
      const endPosition = pos + window.length - 1;
      const avgFuseScore = totalScore / matchCount;

      // Calculate combined score with distance penalty
      // distancePenalty: 0 at currentPosition, 1 at edge of radius
      const distance = Math.abs(endPosition - currentPosition);
      const distancePenalty = Math.min(1, distance / radius);

      // matchQuality: 1 = perfect match, 0 = worst match (invert Fuse score)
      const matchQuality = 1 - avgFuseScore;

      // combinedScore: higher is better
      // At current position (penalty=0): score = matchQuality
      // At edge of radius (penalty=1): score = matchQuality * (1 - distanceWeight)
      const combinedScore = matchQuality * (1 - distanceWeight * distancePenalty);

      candidates.push({
        position: endPosition,
        startPosition: pos,
        matchCount,
        avgFuseScore,
        distance,
        combinedScore
      });
    }
  }

  // Sort by combined score (highest first)
  candidates.sort((a, b) => b.combinedScore - a.combinedScore);

  return {
    candidates,
    bestMatch: candidates[0] || null
  };
}
