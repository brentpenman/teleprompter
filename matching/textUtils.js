// Text normalization utilities for matching

// Custom filler words to ignore (speech artifacts)
const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'actually', 'basically', 'so', 'well'];

// Number word mappings (0-100 + common large numbers)
const NUMBER_WORDS = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
  '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
  '10': 'ten', '11': 'eleven', '12': 'twelve', '13': 'thirteen',
  '14': 'fourteen', '15': 'fifteen', '16': 'sixteen', '17': 'seventeen',
  '18': 'eighteen', '19': 'nineteen', '20': 'twenty', '30': 'thirty',
  '40': 'forty', '50': 'fifty', '60': 'sixty', '70': 'seventy',
  '80': 'eighty', '90': 'ninety', '100': 'hundred', '1000': 'thousand'
};

export function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"()\[\]{}]/g, '')  // Remove punctuation
    .normalize('NFC')  // Unicode normalization
    .trim();
}

export function normalizeNumber(text) {
  // Replace digits with word equivalents where known
  return text.replace(/\b\d+\b/g, (match) => {
    return NUMBER_WORDS[match] || match;
  });
}

export function isFillerWord(word) {
  const normalized = word.toLowerCase().trim();
  return FILLER_WORDS.includes(normalized);
}

export function filterFillerWords(words) {
  // Only remove custom filler words (speech artifacts), NOT all stopwords
  // Stopwords like "to", "the", "a" are needed for consecutive matching
  return words.filter(word => !isFillerWord(word));
}

export function tokenize(text) {
  const normalized = normalizeNumber(normalizeText(text));
  return normalized.split(/\s+/).filter(w => w.length > 0);
}
