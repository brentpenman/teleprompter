import Fuse from 'fuse.js';
import { tokenize, filterFillerWords, isFillerWord } from './textUtils.js';

export class TextMatcher {
  constructor(scriptText, options = {}) {
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

      // Require minConsecutiveMatches out of window
      if (matchCount >= this.minConsecutiveMatches) {
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
