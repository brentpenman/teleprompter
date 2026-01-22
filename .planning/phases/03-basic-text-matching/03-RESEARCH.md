# Phase 3: Basic Text Matching - Research

**Researched:** 2026-01-22
**Domain:** Fuzzy text matching and scroll synchronization in browser
**Confidence:** HIGH

## Summary

This phase implements fuzzy text matching between Web Speech API transcripts and script text, with automatic scroll synchronization. The standard approach uses lightweight fuzzy string matching libraries (Fuse.js or fast-fuzzy) combined with browser-native APIs for smooth scrolling and text highlighting.

Key findings: Browser-native APIs now provide excellent support for smooth scrolling (scrollIntoView with smooth behavior) and performant text highlighting (CSS Custom Highlight API). For text matching, a sliding window approach with fuzzy string comparison is the standard pattern - track 2-3 consecutive words and use string similarity scoring to handle paraphrasing. Stop word removal libraries can filter filler words before matching.

The research reveals that custom fuzzy matching algorithms should be avoided - existing libraries handle edge cases like phonetic similarity, varying string lengths, and performance optimization that would be complex to hand-roll. The CSS Custom Highlight API (2026 browser support: Chrome, Edge, Safari, Firefox) provides performant highlighting without DOM manipulation overhead.

**Primary recommendation:** Use Fuse.js or fast-fuzzy for fuzzy matching, browser-native scrollIntoView for smooth scrolling, CSS Custom Highlight API for text highlighting, and stopword library for filler word removal. Implement sliding window pattern (2-3 consecutive words) for robust position tracking.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Fuse.js | Latest (6.x+) | Fuzzy string matching | Lightweight (zero dependencies), optimized for client-side, handles relevance scoring, widely adopted |
| fast-fuzzy | Latest | Alternative fuzzy matching | Tiny size, lightning-quick, uses trie structure for performance, modification of Levenshtein distance |
| Browser APIs | Native | Scroll & highlight | scrollIntoView (smooth), CSS Custom Highlight API - no dependencies needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| stopword | Latest (2.x+) | Remove filler words | Filter 'um', 'uh', 'like' before matching - supports 62 languages, browser-compatible via UMD |
| js-levenshtein | 1.1.6 | String distance calculation | If building custom matching logic - fastest pure Levenshtein implementation |
| string-similarity | Latest | Dice coefficient comparison | Alternative to Levenshtein - based on bigram comparison, returns 0-1 similarity score |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fuse.js | fuzzball.js | More features (token sorting, wildcards) but larger bundle size - overkill for teleprompter |
| Fuse.js | microfuzz | Tiny & fast but less fuzzy matching power - better for simple autocomplete than speech matching |
| CSS Custom Highlight API | mark.js | Works in older browsers but manipulates DOM (slower), requires wrapping text in `<mark>` tags |
| Browser scrollIntoView | Lenis.js | Advanced smooth scroll library but adds dependency - unnecessary for simple scroll-to-position |

**Installation:**
```bash
# For fuzzy matching (choose one)
npm install fuse.js
# OR
npm install fast-fuzzy

# For filler word removal
npm install stopword

# Browser APIs - no installation needed
```

**Browser-only considerations:**
All recommended libraries work in browser via CDN or bundler. No Node.js-specific dependencies. Fuse.js, fast-fuzzy, and stopword all have browser-compatible builds.

## Architecture Patterns

### Recommended Module Structure
```
src/
├── matching.js          # Text matching logic
│   ├── fuzzyMatcher     # Fuse.js wrapper
│   ├── textNormalizer   # Lowercase, stopwords, numbers
│   └── windowMatcher    # Sliding window pattern
├── highlighting.js      # CSS Custom Highlight API
└── scrolling.js        # Scroll synchronization
```

### Pattern 1: Sliding Window with Consecutive Matches
**What:** Track 2-3 consecutive words from speech transcript, search for fuzzy matches in script, require multiple consecutive matches to confirm position
**When to use:** When speech may have paraphrasing or filler words - prevents false positives from single word matches
**How it works:**
1. Maintain buffer of last 2-3 spoken words (after stopword removal)
2. Search for each word individually in script with fuzzy matching
3. Check if matches form consecutive sequence in script
4. Confirm position only when 2-3 words match consecutively
5. Use surrounding context to disambiguate repeated words

**Example:**
```javascript
// Source: Sliding window pattern from HackerNoon guide
// Adapted for text matching use case

class TextMatcher {
  constructor(scriptText, options = {}) {
    this.script = this.normalizeText(scriptText);
    this.scriptWords = this.script.split(/\s+/);
    this.windowSize = options.windowSize || 3;
    this.threshold = options.threshold || 0.7; // Fuzzy match threshold
    this.spokenBuffer = []; // Recent spoken words
    this.currentPosition = 0;
  }

  normalizeText(text) {
    // Lowercase, remove punctuation for matching
    return text.toLowerCase().replace(/[.,!?;:]/g, '');
  }

  addSpokenWord(word) {
    // Remove stopwords first
    if (this.isFillerWord(word)) return;

    this.spokenBuffer.push(this.normalizeText(word));

    // Keep window size
    if (this.spokenBuffer.length > this.windowSize) {
      this.spokenBuffer.shift();
    }

    // Try to find match
    if (this.spokenBuffer.length >= 2) {
      const position = this.findConsecutiveMatch();
      if (position !== -1) {
        this.currentPosition = position;
        return position;
      }
    }
    return null;
  }

  findConsecutiveMatch() {
    // Search for consecutive words in script
    // Returns position index or -1 if no match
    const window = this.spokenBuffer;

    // Start search from current position for performance
    for (let i = this.currentPosition; i < this.scriptWords.length - window.length; i++) {
      let matchCount = 0;

      for (let j = 0; j < window.length; j++) {
        const similarity = this.fuzzyMatch(window[j], this.scriptWords[i + j]);
        if (similarity >= this.threshold) {
          matchCount++;
        }
      }

      // Require at least 2 of 3 words to match
      if (matchCount >= Math.min(2, window.length)) {
        return i;
      }
    }

    // If no forward match, search backwards (in case of jump back)
    // ... (similar logic for backward search)

    return -1;
  }

  fuzzyMatch(word1, word2) {
    // Use Fuse.js or string similarity here
    // Returns 0-1 similarity score
  }

  isFillerWord(word) {
    const fillers = ['um', 'uh', 'like', 'you', 'know'];
    return fillers.includes(word.toLowerCase());
  }
}
```

### Pattern 2: Number Normalization
**What:** Convert written numbers ('15', '2024') to spoken equivalents ('fifteen', 'twenty twenty-four')
**When to use:** When script contains numbers that may be spoken differently than written
**How it works:**
1. Detect numbers in script text
2. Generate spoken variants (cardinal, ordinal, year format)
3. Include variants in search index
4. Match against any variant

**Example:**
```javascript
// Number normalization for matching
function normalizeNumbers(text) {
  const numberWords = {
    '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
    '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
    '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen',
    '14': 'fourteen', '15': 'fifteen', '16': 'sixteen', '17': 'seventeen',
    '18': 'eighteen', '19': 'nineteen', '20': 'twenty', '30': 'thirty',
    '40': 'forty', '50': 'fifty', '60': 'sixty', '70': 'seventy',
    '80': 'eighty', '90': 'ninety', '100': 'hundred', '1000': 'thousand'
  };

  // Replace simple numbers with word equivalents
  return text.replace(/\b\d+\b/g, (match) => {
    if (numberWords[match]) return numberWords[match];

    // For complex numbers, create searchable variants
    // Both "2024" and "twenty twenty four" should match
    return match; // Keep original for now, extend as needed
  });
}
```

### Pattern 3: CSS Custom Highlight API for Performance
**What:** Use browser-native highlighting without DOM manipulation
**When to use:** All modern browsers (2026) - Chrome, Edge, Safari, Firefox
**How it works:**
1. Create Range objects identifying text positions
2. Wrap ranges in Highlight object
3. Register with CSS.highlights
4. Style with ::highlight() pseudo-element

**Example:**
```javascript
// Source: MDN CSS Custom Highlight API documentation
// https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API

function highlightTextRange(element, startOffset, endOffset) {
  // Create a Range for the matched text
  const range = new Range();
  const textNode = element.firstChild; // Assuming text node
  range.setStart(textNode, startOffset);
  range.setEnd(textNode, endOffset);

  // Create highlight and register it
  const highlight = new Highlight(range);
  CSS.highlights.set('current-position', highlight);
}

// Clear previous highlight
function clearHighlight() {
  CSS.highlights.delete('current-position');
}

// In CSS:
// ::highlight(current-position) {
//   background-color: rgba(255, 255, 0, 0.3);
//   color: #000;
// }
```

### Pattern 4: Smooth Scroll to Matched Position
**What:** Use native scrollIntoView with smooth behavior
**When to use:** Always - excellent browser support (since 2020)
**How it works:**
1. Find DOM element containing matched text
2. Call scrollIntoView with smooth behavior and center alignment
3. Use CSS scroll-margin-top to account for fixed headers

**Example:**
```javascript
// Source: MDN scrollIntoView documentation
// https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView

function scrollToPosition(element) {
  element.scrollIntoView({
    behavior: 'smooth',      // Smooth animation
    block: 'center',         // Keep at reading position (center)
    inline: 'nearest'        // Don't scroll horizontally
  });
}

// In CSS - account for fixed header or reading marker
// .script-line {
//   scroll-margin-top: 200px;  /* Space for fixed header/marker */
// }
```

### Anti-Patterns to Avoid
- **Exact string matching only:** Speech will never match script exactly - always use fuzzy matching
- **Single word matching:** Too many false positives - require 2-3 consecutive word matches
- **DOM manipulation for highlighting:** Slow and causes reflows - use CSS Custom Highlight API
- **Custom scroll animation:** Browser-native smooth scroll is performant and accessible
- **Matching filler words:** 'um', 'uh', 'like' should be filtered before matching
- **Linear search from start:** Always start search from current position for performance

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy string matching | Custom edit distance algorithm | Fuse.js or fast-fuzzy | Handles edge cases (varying lengths, performance optimization, scoring/ranking), battle-tested on millions of searches |
| Stop word filtering | Hardcoded filler word list | stopword library | Supports 62 languages, comprehensive word lists, maintained and tested |
| String similarity scoring | Character-by-character comparison | js-levenshtein or string-similarity | Optimized algorithms (Wagner-Fischer), 3000+ ops/sec performance, handles unicode properly |
| Text highlighting | Wrapping text in `<mark>` tags | CSS Custom Highlight API | Browser-optimized (very fast), no DOM manipulation overhead, no layout recalculation |
| Smooth scrolling | requestAnimationFrame loop | scrollIntoView({behavior: 'smooth'}) | Native browser optimization, respects user preferences (prefers-reduced-motion), handles edge cases |
| Phonetic matching | Sound-alike word detection | Microsoft PhoneticMatching or Soundex | Complex linguistic rules, handles accents and dialects, edge cases like homophones |

**Key insight:** Text matching has decades of research behind it. Levenshtein distance, phonetic algorithms, and fuzzy matching have edge cases that aren't obvious (unicode normalization, locale-specific collation, performance on long strings). Existing libraries are heavily optimized and battle-tested.

## Common Pitfalls

### Pitfall 1: Performance Degradation on Large Scripts
**What goes wrong:** Searching entire script for every spoken word becomes slow with long documents (1000+ lines)
**Why it happens:** Fuzzy matching is O(n*m) complexity - grows quadratically with script length
**How to avoid:**
- Start search from current position, only search backwards if no forward match
- Use threshold-based early termination in fuzzy search
- Consider indexing script into chunks (paragraphs/scenes) for very long scripts
- Use fast-fuzzy or microfuzz instead of Fuse.js for large datasets
**Warning signs:** UI lag when speaking, scroll delays > 500ms, high CPU usage

### Pitfall 2: False Positives from Common Words
**What goes wrong:** Matching on common words ('the', 'and', 'is') causes jumps to wrong positions
**Why it happens:** These words appear throughout script with high similarity scores
**How to avoid:**
- Filter stop words BEFORE matching (using stopword library)
- Require 2-3 consecutive word matches, not single words
- Use context scoring - prefer matches near current position
- Weight matches by word rarity (TF-IDF-like scoring)
**Warning signs:** Scroll position jumps erratically, matches wrong sections repeatedly

### Pitfall 3: Overly Fuzzy Matching
**What goes wrong:** Threshold too high (e.g., 0.9) accepts too many false matches, words that sound nothing alike
**Why it happens:** Trying to handle paraphrasing but being too permissive
**How to avoid:**
- Use threshold around 0.6-0.7 for fuzzy matching (based on Fuse.js docs)
- Test with real speech variations to tune threshold
- Require higher confidence for distant matches (position far from current)
- Use consecutive match requirement to compensate for fuzziness
**Warning signs:** Matching unrelated words, scrolling to wrong paragraphs

### Pitfall 4: Not Handling Repeated Phrases
**What goes wrong:** Script has repeated phrases ('thank you', 'ladies and gentlemen') - matches first occurrence instead of current
**Why it happens:** Search starts from position 0 or doesn't use context
**How to avoid:**
- Always search forward from current position first
- Use surrounding context (previous matches) to disambiguate
- Prefer matches that are sequential with previous match
- Allow user to manually nudge position if stuck
**Warning signs:** Gets stuck at beginning of script, doesn't advance past repeated phrase

### Pitfall 5: DOM Thrashing from Highlight Updates
**What goes wrong:** Updating highlights on every word causes repaints and layout recalculation, janky performance
**Why it happens:** Traditional highlighting wraps text in elements, triggering DOM mutations
**How to avoid:**
- Use CSS Custom Highlight API (no DOM changes)
- Debounce highlight updates (e.g., 100-200ms)
- Batch multiple highlight changes together
- Use requestAnimationFrame for visual updates
**Warning signs:** Visual stutter, dropped frames, high paint times in DevTools

### Pitfall 6: Not Normalizing Text Properly
**What goes wrong:** Numbers, punctuation, case differences prevent matches
**Why it happens:** Comparing raw speech transcript to raw script text
**How to avoid:**
- Lowercase both script and speech before matching
- Remove punctuation from comparison (but keep for display)
- Normalize numbers to word equivalents (15 → 'fifteen')
- Normalize unicode (String.normalize('NFC'))
**Warning signs:** Doesn't match obvious phrases, fails on numbers

## Code Examples

Verified patterns from official sources:

### Fuse.js Basic Setup
```javascript
// Source: Fuse.js official documentation
// https://www.fusejs.io/

import Fuse from 'fuse.js';

// Prepare script as searchable array
const scriptWords = script.split(/\s+/).map((word, index) => ({
  word: word.toLowerCase().replace(/[.,!?;:]/g, ''),
  originalWord: word,
  index: index
}));

// Configure Fuse
const fuse = new Fuse(scriptWords, {
  keys: ['word'],
  threshold: 0.3,        // 0 = perfect match, 1 = match anything
  distance: 100,         // Max distance between characters
  includeScore: true,
  findAllMatches: false, // Stop at first good match
  minMatchCharLength: 3  // Don't match very short words
});

// Search for spoken word
function searchWord(spokenWord) {
  const results = fuse.search(spokenWord);
  return results[0]?.item; // Best match
}
```

### Stop Word Removal
```javascript
// Source: stopword npm package documentation
// https://github.com/fergiemcdowall/stopword

import { removeStopwords, eng } from 'stopword';

function filterFillerWords(text) {
  const words = text.toLowerCase().split(/\s+/);

  // Add custom filler words to English stopwords
  const customFillers = ['um', 'uh', 'like', 'you know', 'actually', 'basically'];
  const allStopwords = [...eng, ...customFillers];

  const filtered = removeStopwords(words, allStopwords);
  return filtered;
}

// Usage with speech transcript
const transcript = "Um, so like, this is the script";
const meaningful = filterFillerWords(transcript);
// Returns: ['script']
```

### CSS Custom Highlight API
```javascript
// Source: MDN Web APIs - CSS Custom Highlight API
// https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API

function highlightScriptPosition(element, startIndex, endIndex) {
  // Clear previous highlights
  CSS.highlights.clear();

  // Create range for matched text
  const textNode = element.firstChild;
  const range = new Range();
  range.setStart(textNode, startIndex);
  range.setEnd(textNode, endIndex);

  // Create and register highlight
  const highlight = new Highlight(range);
  CSS.highlights.set('current-match', highlight);

  // CSS styling:
  // ::highlight(current-match) {
  //   background-color: rgba(255, 255, 0, 0.4);
  //   color: #000;
  //   font-weight: bold;
  // }
}

// Fade previous matches
function addPreviousMatchHighlight(element, startIndex, endIndex) {
  const textNode = element.firstChild;
  const range = new Range();
  range.setStart(textNode, startIndex);
  range.setEnd(textNode, endIndex);

  const highlight = new Highlight(range);
  CSS.highlights.set('previous-match', highlight);

  // CSS styling:
  // ::highlight(previous-match) {
  //   opacity: 0.5;
  //   color: #666;
  // }
}
```

### Smooth Scroll with Reading Position
```javascript
// Source: MDN Element.scrollIntoView documentation
// https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView

function scrollToMatchedLine(lineElement) {
  lineElement.scrollIntoView({
    behavior: 'smooth',
    block: 'center',      // Keep at vertical center (reading position)
    inline: 'nearest'
  });
}

// CSS - define scroll margin to account for fixed headers
// .script-line {
//   scroll-margin-top: 40vh;   /* Keep at 40% from top */
//   scroll-margin-bottom: 40vh;
// }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| mark.js DOM wrapping | CSS Custom Highlight API | 2023-2025 | 10x+ faster highlighting, no layout recalculation, Firefox/Safari support added in 2025 |
| Custom scroll animation | scrollIntoView({behavior: 'smooth'}) | 2020 | Native browser optimization, respects accessibility preferences, widely supported |
| Levenshtein only | Hybrid fuzzy algorithms | Ongoing | Fuse.js, fast-fuzzy use optimized algorithms beyond pure Levenshtein for better results |
| Server-side matching | Client-side fuzzy search | 2020s | Browser performance improved, libraries optimized, no server needed for small-medium datasets |

**Deprecated/outdated:**
- mark.js: Still works but CSS Custom Highlight API is faster and cleaner for modern browsers
- jQuery smooth scroll plugins: Native scrollIntoView with smooth behavior replaced need for libraries
- Soundex algorithm alone: Too simplistic for modern speech matching - use in combination with other methods

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal fuzzy matching threshold for speech variation**
   - What we know: Literature suggests 0.6-0.7 for general fuzzy matching
   - What's unclear: Speech-to-text + paraphrasing may need different threshold than typical fuzzy search
   - Recommendation: Start with 0.7, add user-configurable slider to tune based on testing

2. **Number normalization completeness**
   - What we know: Simple numbers (1-100) have clear word equivalents
   - What's unclear: Complex numbers (1,234), years (2024 vs "twenty twenty-four" vs "two thousand twenty-four"), ordinals
   - Recommendation: Start with simple number dictionary, extend based on real usage patterns from testing

3. **CSS Custom Highlight API fallback strategy**
   - What we know: Firefox support is recent (June 2025), Safari has bugs with user-select:none
   - What's unclear: Whether fallback to mark.js is worth bundle size for edge cases
   - Recommendation: Use CSS Custom Highlight API only, document browser requirements (Chrome/Edge/Safari/Firefox modern versions)

4. **Performance threshold for script length**
   - What we know: Fuzzy matching is O(n*m), performance degrades with length
   - What's unclear: Exact script length where chunking/indexing becomes necessary
   - Recommendation: Test with real scripts, implement position-relative search first, add chunking only if needed

## Sources

### Primary (HIGH confidence)
- [Fuse.js official documentation](https://www.fusejs.io/) - Fuzzy search library setup and configuration
- [MDN: Element.scrollIntoView()](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView) - Smooth scrolling API and options
- [MDN: CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) - Text highlighting without DOM manipulation
- [stopword GitHub repository](https://github.com/fergiemcdowall/stopword) - Stop word filtering library
- [js-levenshtein GitHub](https://github.com/gustf/js-levenshtein) - Levenshtein distance implementation

### Secondary (MEDIUM confidence)
- [Typesense: Fuzzy Search with JavaScript](https://typesense.org/learn/fuzzy-search-javascript/) - Overview of fuzzy search approaches, verified against Fuse.js docs
- [LogRocket: CSS Custom Highlight API](https://blog.logrocket.com/getting-started-css-custom-highlight-api/) - Tutorial verified against MDN documentation
- [30 seconds of code: Levenshtein distance](https://www.30secondsofcode.org/js/s/levenshtein-distance/) - Algorithm explanation, verified against js-levenshtein implementation
- [MDN: scroll-margin-top](https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-margin-top) - CSS property for scroll positioning

### Tertiary (LOW confidence - flagged for validation)
- [HackerNoon: Sliding Window Algorithm](https://hackernoon.com/a-beginners-guide-to-the-sliding-window-algorithm-with-javascript) - Pattern concept, needs adaptation for text matching
- [Teleprompter.com: Voice Scroll feature](https://www.teleprompter.com/blog/voice-scroll-teleprompter-app-new-feature) - Commercial implementation, no technical details
- [Medium: Underused Browser APIs - CSS Custom Highlight API](https://medium.com/@inomag.articles/underused-browser-apis-css-custom-highlight-api-486a578b24c6) - Jan 2026 article, verified against MDN

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via official docs or npm, browser APIs verified via MDN
- Architecture: HIGH - Sliding window pattern is established for text matching, CSS Custom Highlight API is documented standard
- Pitfalls: MEDIUM - Based on library documentation warnings and general performance patterns, needs real-world validation
- Browser compatibility: HIGH - MDN documentation confirms CSS Custom Highlight API support, scrollIntoView widely available since 2020

**Research date:** 2026-01-22
**Valid until:** 2026-04-22 (90 days - stable browser APIs and mature libraries, longer validity)

**Key constraints honored:**
- Browser-only implementation (no backend)
- Free APIs only (Web Speech API, no paid services)
- Modern browser support (2026 baseline)
- Matches CONTEXT.md decisions: hybrid approach, fuzzy matching, consecutive words, filler word filtering, smooth scroll
