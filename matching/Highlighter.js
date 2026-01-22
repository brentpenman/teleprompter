// Highlighter using CSS Custom Highlight API
// https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API

export class Highlighter {
  constructor(textElement, options = {}) {
    this.element = textElement;
    this.phraseLength = options.phraseLength || 3;  // Words to highlight
    this.enabled = options.enabled ?? true;

    // Check browser support
    this.supported = typeof CSS !== 'undefined' && 'highlights' in CSS;

    if (!this.supported) {
      console.warn('CSS Custom Highlight API not supported - highlighting disabled');
    }
  }

  // Highlight current position (word index in script)
  highlightPosition(wordIndex, scriptWords) {
    if (!this.supported || !this.enabled) {
      this.clear();
      return;
    }

    // Clear previous highlights
    CSS.highlights.clear();

    const text = this.element.textContent;
    if (!text) return;

    // Find character positions for the word at wordIndex
    const positions = this.findWordPositions(text, scriptWords);

    if (wordIndex < 0 || wordIndex >= positions.length) return;

    // Calculate phrase range (2-5 words centered on current position)
    const startWord = Math.max(0, wordIndex - Math.floor(this.phraseLength / 2));
    const endWord = Math.min(positions.length - 1, startWord + this.phraseLength - 1);

    // Create text node reference
    const textNode = this.getTextNode();
    if (!textNode) return;

    // Highlight current phrase
    try {
      const phraseRange = new Range();
      phraseRange.setStart(textNode, positions[startWord].start);
      phraseRange.setEnd(textNode, positions[endWord].end);

      const currentHighlight = new Highlight(phraseRange);
      CSS.highlights.set('current-match', currentHighlight);

      // Highlight previously read text (dimmed)
      if (startWord > 0) {
        const previousRange = new Range();
        previousRange.setStart(textNode, 0);
        previousRange.setEnd(textNode, positions[startWord - 1].end);

        const previousHighlight = new Highlight(previousRange);
        CSS.highlights.set('previous-match', previousHighlight);
      }
    } catch (err) {
      console.error('Highlight error:', err);
    }
  }

  // Find character positions for each word in the text
  findWordPositions(text, scriptWords) {
    const positions = [];
    let searchStart = 0;

    for (const word of scriptWords) {
      // Find this word in the text (case-insensitive)
      const wordLower = word.toLowerCase();
      const textLower = text.toLowerCase();
      const index = textLower.indexOf(wordLower, searchStart);

      if (index !== -1) {
        positions.push({
          start: index,
          end: index + word.length,
          word: word
        });
        searchStart = index + word.length;
      } else {
        // Word not found at expected position - try to find it anywhere
        const fallbackIndex = textLower.indexOf(wordLower);
        if (fallbackIndex !== -1) {
          positions.push({
            start: fallbackIndex,
            end: fallbackIndex + word.length,
            word: word
          });
        }
      }
    }

    return positions;
  }

  // Get the text node from the element
  getTextNode() {
    // Handle both direct text and nested text nodes
    if (this.element.firstChild?.nodeType === Node.TEXT_NODE) {
      return this.element.firstChild;
    }

    // If element has whitespace-preserved text, it might be the element itself
    // Walk through and find text nodes
    const walker = document.createTreeWalker(
      this.element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    return walker.nextNode();
  }

  // Clear all highlights
  clear() {
    if (this.supported) {
      CSS.highlights.delete('current-match');
      CSS.highlights.delete('previous-match');
    }
  }

  // Enable/disable highlighting
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  // Check if highlighting is supported
  isSupported() {
    return this.supported;
  }
}
