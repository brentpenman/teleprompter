import Fuse from 'fuse.js';
import { tokenize, filterFillerWords, isFillerWord } from './textUtils.js';
import { ConfidenceCalculator } from './ConfidenceLevel.js';

export class TextMatcher {
  constructor(scriptText, options = {}) {
    // Window size 3 - always match last 3 words regardless of transcript length
    // Keeps matching tight and responsive
    this.windowSize = options.windowSize || 3;
    this.threshold = options.threshold || 0.3;  // Fuse.js: 0 = exact, 1 = match anything
    this.minConsecutiveMatches = options.minConsecutiveMatches || 2;

    // Tokenize script into searchable words
    this.scriptWords = tokenize(scriptText);
    this.originalScript = scriptText;

    // Build Fuse index
    this.scriptIndex = this.scriptWords.map((word, index) => ({
      word,
      index
    }));

    this.fuse = new Fuse(this.scriptIndex, {
      keys: ['word'],
      threshold: this.threshold,
      includeScore: true,
      findAllMatches: false,
      minMatchCharLength: 2
    });

    // State
    this.spokenBuffer = [];  // Recent spoken words
    this.currentPosition = 0;  // Current match position in script
    this.lastMatchTime = 0;

    // Confidence calculator for match quality scoring
    this.confidenceCalculator = new ConfidenceCalculator();
  }

  // Add a spoken word and try to find match
  addSpokenWord(word) {
    // Filter filler words
    if (isFillerWord(word)) {
      return null;
    }

    const normalized = tokenize(word)[0];
    if (!normalized) return null;

    // Add to buffer
    this.spokenBuffer.push(normalized);

    // Maintain window size
    if (this.spokenBuffer.length > this.windowSize) {
      this.spokenBuffer.shift();
    }

    // Need at least 2 words to match
    if (this.spokenBuffer.length < this.minConsecutiveMatches) {
      return null;
    }

    // Try to find consecutive match
    const match = this.findConsecutiveMatch();
    if (match !== null) {
      this.currentPosition = match;
      this.lastMatchTime = Date.now();
      return match;
    }

    return null;
  }

  // Process a transcript (may contain multiple words) - accumulates to buffer
  processTranscript(transcript) {
    const words = tokenize(transcript);
    const filtered = filterFillerWords(words);

    let lastMatch = null;
    for (const word of filtered) {
      const match = this.addSpokenWord(word);
      if (match !== null) {
        lastMatch = match;
      }
    }

    return lastMatch;
  }

  // Match transcript directly without accumulating (for interim results)
  // Takes the last N words of the transcript and tries to find them in the script
  matchTranscript(transcript) {
    const words = tokenize(transcript);
    const filtered = filterFillerWords(words);

    if (filtered.length < this.minConsecutiveMatches) {
      return null;
    }

    // Use the last windowSize words for matching
    const window = filtered.slice(-this.windowSize);

    // Search forward from current position first
    let matchStart = this.searchRange(this.currentPosition, this.scriptWords.length, window);
    if (matchStart !== null) {
      // Return END of match (where user currently is), not start
      const matchEnd = matchStart + window.length - 1;

      // Only move forward, never backward (prevents jitter from interim changes)
      if (matchEnd >= this.currentPosition) {
        this.currentPosition = matchEnd;
        this.lastMatchTime = Date.now();
        return matchEnd;
      }
    }

    // Search backward only for big jumps (user intentionally skipped back)
    // Require finding match at least 10 words back to count as intentional
    const jumpThreshold = 10;
    matchStart = this.searchRange(0, Math.max(0, this.currentPosition - jumpThreshold), window);
    if (matchStart !== null) {
      const matchEnd = matchStart + window.length - 1;
      this.currentPosition = matchEnd;
      this.lastMatchTime = Date.now();
      return matchEnd;
    }

    return null;
  }

  // Match transcript and return confidence data
  // Returns object with position, confidence, level, and match metadata
  // Uses proximity-first search to find nearby matches before distant ones
  getMatchWithConfidence(transcript, proximityWindow = 15) {
    const words = tokenize(transcript);
    const filtered = filterFillerWords(words);

    if (filtered.length < this.minConsecutiveMatches) {
      return { position: null, confidence: null, level: 'low' };
    }

    // Use the last windowSize words for matching
    const window = filtered.slice(-this.windowSize);

    // Debug: show what we're searching for
    console.log(`[Matcher] Searching for "${window.join(' ')}" from position ${this.currentPosition}`);

    // PROXIMITY-FIRST SEARCH: Check nearby positions before searching far away
    // This prevents common words from matching at distant positions

    // 1. First search a small window AROUND current position (both directions)
    // This catches matches that span across currentPosition
    const nearStart = Math.max(0, this.currentPosition - 5);
    const nearEnd = Math.min(this.currentPosition + proximityWindow, this.scriptWords.length);
    let result = this.searchRangeWithScore(nearStart, nearEnd, window);
    if (result) console.log(`[Matcher] Found in near range [${nearStart}-${nearEnd}] at ${result.startIndex}`);

    // 2. If not found, search wider backward vicinity
    if (!result) {
      const wideBackStart = Math.max(0, this.currentPosition - proximityWindow);
      if (wideBackStart < nearStart) {
        result = this.searchRangeWithScore(wideBackStart, nearStart, window);
        if (result) console.log(`[Matcher] Found in wide-backward range [${wideBackStart}-${nearStart}] at ${result.startIndex}`);
      }
    }

    // 3. If still not found, search the rest of the script (far forward)
    if (!result) {
      result = this.searchRangeWithScore(nearEnd, this.scriptWords.length, window);
      if (result) console.log(`[Matcher] Found in far-forward range [${nearEnd}-${this.scriptWords.length}] at ${result.startIndex}`);
    }

    // 4. Finally, search far backward (beginning of script)
    if (!result) {
      const wideBackStart = Math.max(0, this.currentPosition - proximityWindow);
      if (wideBackStart > 0) {
        result = this.searchRangeWithScore(0, wideBackStart, window);
        if (result) console.log(`[Matcher] Found in far-backward range [0-${wideBackStart}] at ${result.startIndex}`);
      }
    }

    if (!result) {
      // Debug: show what script words are near current position
      const contextStart = Math.max(0, this.currentPosition - 3);
      const contextEnd = Math.min(this.scriptWords.length, this.currentPosition + 10);
      const context = this.scriptWords.slice(contextStart, contextEnd).map((w, i) =>
        i === (this.currentPosition - contextStart) ? `[${w}]` : w
      ).join(' ');
      console.log(`[Matcher] No match found. Script near position ${this.currentPosition}: "${context}"`);
    }

    if (result) {
      const matchEnd = result.startIndex + window.length - 1;
      const distance = matchEnd - this.currentPosition;

      this.currentPosition = matchEnd;
      this.lastMatchTime = Date.now();

      const msSinceLastMatch = 0; // Just matched now
      const rawConfidence = this.confidenceCalculator.calculate(
        result.avgScore, result.matchCount, window.length, msSinceLastMatch
      );

      return {
        position: matchEnd,
        confidence: rawConfidence,
        level: this.confidenceCalculator.toLevel(rawConfidence),
        matchCount: result.matchCount,
        windowSize: window.length,
        distance: distance,
        isBackwardSkip: distance < 0
      };
    }

    // No match found - return low confidence based on time since last match
    const msSinceLastMatch = Date.now() - this.lastMatchTime;
    const rawConfidence = this.confidenceCalculator.calculate(1, 0, window.length, msSinceLastMatch);

    return {
      position: null,
      confidence: rawConfidence,
      level: this.confidenceCalculator.toLevel(rawConfidence)
    };
  }

  // Search range and return score data for confidence calculation
  // Requires ALL words in the window to match at consecutive positions (phrase matching)
  searchRangeWithScore(start, end, window) {
    for (let i = start; i < end - window.length + 1; i++) {
      let matchCount = 0;
      let totalScore = 0;

      for (let j = 0; j < window.length; j++) {
        const results = this.fuse.search(window[j]);
        const match = results.find(r => r.item.index === i + j && r.score <= this.threshold);

        if (match) {
          matchCount++;
          totalScore += match.score;
        }
      }

      // Require ALL words to match - true phrase matching, not random word coincidence
      if (matchCount === window.length) {
        return {
          startIndex: i,
          matchCount: matchCount,
          avgScore: matchCount > 0 ? totalScore / matchCount : 1
        };
      }
    }
    return null;
  }

  findConsecutiveMatch() {
    const window = this.spokenBuffer;

    // Search forward from current position first
    let match = this.searchRange(this.currentPosition, this.scriptWords.length, window);
    if (match !== null) return match;

    // Search backward (in case user jumped back)
    match = this.searchRange(0, this.currentPosition, window);
    return match;
  }

  searchRange(start, end, window) {
    for (let i = start; i < end - window.length + 1; i++) {
      let matchCount = 0;

      for (let j = 0; j < window.length; j++) {
        const results = this.fuse.search(window[j]);

        // Check if any result matches position i + j
        const hasMatch = results.some(r =>
          r.item.index === i + j && r.score <= this.threshold
        );

        if (hasMatch) {
          matchCount++;
        }
      }

      // Require ALL words to match - true phrase matching
      if (matchCount === window.length) {
        return i;
      }
    }

    return null;
  }

  // Get word position info for highlighting
  getPositionInfo(wordIndex) {
    if (wordIndex < 0 || wordIndex >= this.scriptWords.length) {
      return null;
    }

    // Calculate character offset in original script
    // This is approximate - for exact highlighting, we'll need char positions
    return {
      wordIndex,
      word: this.scriptWords[wordIndex],
      totalWords: this.scriptWords.length,
      progress: wordIndex / this.scriptWords.length
    };
  }

  // Reset state (e.g., when script changes)
  reset() {
    this.spokenBuffer = [];
    this.currentPosition = 0;
    this.lastMatchTime = 0;
  }

  // Get current state for debugging
  getState() {
    return {
      currentPosition: this.currentPosition,
      buffer: [...this.spokenBuffer],
      scriptLength: this.scriptWords.length
    };
  }
}
