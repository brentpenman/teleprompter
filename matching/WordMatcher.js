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
 *
 * @module WordMatcher
 */

import Fuse from 'fuse.js';
import { tokenize, filterFillerWords } from './textUtils.js';

/**
 * @typedef {Object} WordEntry
 * @property {string} word - Normalized word (lowercase)
 * @property {number} index - Position in script (0-indexed)
 * @property {number} startOffset - Character offset start in original text
 * @property {number} endOffset - Character offset end in original text
 */

/**
 * @typedef {Object} Matcher
 * @property {WordEntry[]} scriptIndex - Indexed script words with offsets
 * @property {import('fuse.js').default} fuse - Fuse.js instance for fuzzy search
 * @property {string[]} scriptWords - Array of normalized words
 */

/**
 * @typedef {Object} MatchCandidate
 * @property {number} position - End word index of match (0-indexed)
 * @property {number} startPosition - Start word index of match (0-indexed)
 * @property {number} matchCount - Number of words matched
 * @property {number} avgFuseScore - Average Fuse.js score (0=perfect, 1=mismatch)
 * @property {number} distance - Word distance from currentPosition
 * @property {number} combinedScore - Final score (higher=better, 0-1 range)
 * @property {number} startOffset - Character offset for highlighting start
 * @property {number} endOffset - Character offset for highlighting end
 */

/**
 * @typedef {Object} MatchResult
 * @property {MatchCandidate[]} candidates - All candidates sorted by score (highest first)
 * @property {MatchCandidate|null} bestMatch - Highest scoring candidate, or null if none
 */

/**
 * @typedef {Object} MatchOptions
 * @property {number} [radius=50] - Search radius around currentPosition (in words)
 * @property {number} [minConsecutive=2] - Minimum consecutive words required for match
 * @property {number} [windowSize=3] - Words to take from transcript end for matching
 * @property {number} [distanceWeight=0.3] - How much distance affects score (0-1)
 * @property {number} [threshold=0.3] - Fuse.js fuzzy threshold (0=exact, 1=loose)
 */

/**
 * Build matcher from script text (call once when script changes).
 *
 * Creates a Fuse.js index for fuzzy matching and tracks character offsets
 * for each word to enable CSS Custom Highlight API integration.
 *
 * @param {string} scriptText - Full script text to index
 * @param {{ threshold?: number }} [options] - Configuration
 * @param {number} [options.threshold=0.3] - Fuse.js fuzzy threshold (0=exact, 1=loose)
 * @returns {Matcher} Matcher object for use with findMatches
 *
 * @example
 * const matcher = createMatcher('four score and seven years ago');
 * // matcher.scriptIndex contains word positions and character offsets
 * // matcher.fuse is the Fuse.js instance for fuzzy search
 */
export function createMatcher(scriptText, options = {}) {
  const { threshold = 0.3 } = options;

  const scriptWords = tokenize(scriptText);

  // Track character offsets for highlighting integration
  // Find each word's position in the original text
  const scriptLower = scriptText.toLowerCase();
  let charOffset = 0;
  const scriptIndex = [];

  for (let i = 0; i < scriptWords.length; i++) {
    const word = scriptWords[i];
    // Find word in original text starting from current offset
    const foundIndex = scriptLower.indexOf(word, charOffset);
    const startOffset = foundIndex >= 0 ? foundIndex : charOffset;
    const endOffset = startOffset + word.length;

    scriptIndex.push({
      word,
      index: i,
      startOffset,
      endOffset
    });

    charOffset = endOffset;
  }

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
 * Find matches for spoken transcript (pure function).
 *
 * Searches within radius of currentPosition for consecutive word matches.
 * Scores candidates by both fuzzy match quality and positional proximity.
 * Returns all candidates sorted by score and the best match.
 *
 * @param {string} transcript - Spoken words from speech recognition
 * @param {Matcher} matcher - Result from createMatcher
 * @param {number} currentPosition - Current word position in script (clamped to valid range)
 * @param {MatchOptions} [options] - Search configuration
 * @returns {MatchResult} Result with candidates array and bestMatch
 *
 * @example
 * const matcher = createMatcher('four score and seven years ago');
 * const result = findMatches('score and seven', matcher, 0);
 * // result.bestMatch.position = 3 (index of "seven")
 * // result.bestMatch.startOffset/endOffset for highlighting
 */
export function findMatches(transcript, matcher, currentPosition, options = {}) {
  const {
    radius = 50,
    minConsecutive = 2,
    windowSize = 3,
    distanceWeight = 0.3,
    threshold = 0.3
  } = options;

  const { scriptIndex } = matcher;

  // Tokenize and filter spoken input
  const words = tokenize(transcript);
  const filtered = filterFillerWords(words);

  // Require minimum consecutive words
  if (filtered.length < minConsecutive) {
    return { candidates: [], bestMatch: null };
  }

  // Use last windowSize words (or all if fewer)
  const window = filtered.slice(-windowSize);

  // Clamp currentPosition to valid range
  const clampedPosition = Math.max(0, Math.min(scriptIndex.length - 1, currentPosition));

  // Calculate search bounds (already clamped by Math.max/min)
  const searchStart = Math.max(0, clampedPosition - radius);
  const searchEnd = Math.min(scriptIndex.length, clampedPosition + radius);

  // Build windowed Fuse.js index scoped to search bounds (Option A, PRD-002)
  // Instead of searching the full script index (potentially 5000+ entries),
  // create a small index covering only the ~100 entries in the search window.
  const windowedSlice = scriptIndex.slice(searchStart, searchEnd);
  const windowedFuse = new Fuse(windowedSlice, {
    keys: ['word'],
    threshold,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2
  });

  // Pre-compute fuzzy results for each spoken word (searched once, reused at every position)
  // Maps spoken word -> Map of scriptIndex position -> fuse score
  const fuzzyCache = new Map();
  for (const spokenWord of window) {
    if (!fuzzyCache.has(spokenWord)) {
      const positionScores = new Map();
      const results = windowedFuse.search(spokenWord);
      for (const r of results) {
        if (r.score <= threshold) {
          positionScores.set(r.item.index, r.score);
        }
      }
      fuzzyCache.set(spokenWord, positionScores);
    }
  }

  // Find consecutive matches within search bounds
  const candidates = [];

  for (let pos = searchStart; pos <= searchEnd - window.length; pos++) {
    let matchCount = 0;
    let totalScore = 0;

    for (let i = 0; i < window.length; i++) {
      const spokenWord = window[i];
      const scriptWord = scriptIndex[pos + i].word;

      // Fast path: exact string match (score 0 = perfect)
      if (spokenWord === scriptWord) {
        matchCount++;
        // totalScore += 0; exact match has perfect score
      } else {
        // Slow path: lookup pre-computed fuzzy results by position
        const score = fuzzyCache.get(spokenWord)?.get(pos + i);

        if (score !== undefined) {
          matchCount++;
          totalScore += score;
        }
      }
    }

    // Require ALL words to match (consecutive phrase matching)
    if (matchCount === window.length) {
      const endPosition = pos + window.length - 1;
      const avgFuseScore = totalScore / matchCount;

      // Calculate combined score with distance penalty
      // distancePenalty: 0 at clampedPosition, 1 at edge of radius
      const distance = Math.abs(endPosition - clampedPosition);
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
        combinedScore,
        // Character offsets for highlighting integration
        startOffset: scriptIndex[pos].startOffset,
        endOffset: scriptIndex[endPosition].endOffset
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
