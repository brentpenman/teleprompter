/**
 * WordMatcher TDD Tests
 *
 * Tests for stateless fuzzy matching with distance-weighted scoring.
 * Following TDD: these tests are written FIRST, before implementation.
 */

import { createMatcher, findMatches } from './WordMatcher.js';

describe('WordMatcher', () => {
  describe('createMatcher', () => {
    it('returns scriptIndex, fuse, and scriptWords', () => {
      const script = 'four score and seven years ago';
      const matcher = createMatcher(script);

      expect(matcher).toHaveProperty('scriptIndex');
      expect(matcher).toHaveProperty('fuse');
      expect(matcher).toHaveProperty('scriptWords');
      expect(Array.isArray(matcher.scriptIndex)).toBe(true);
      expect(Array.isArray(matcher.scriptWords)).toBe(true);
      expect(matcher.scriptIndex.length).toBe(6);
    });
  });

  describe('findMatches', () => {
    // Test 1: Exact match near position
    it('finds exact match near current position with high score', () => {
      const script = 'four score and seven years ago';
      const matcher = createMatcher(script);

      // Transcript: "score and seven", currentPosition: 1
      const result = findMatches('score and seven', matcher, 1);

      expect(result.bestMatch).not.toBeNull();
      // "seven" is at index 3 (0-indexed: four=0, score=1, and=2, seven=3)
      expect(result.bestMatch.position).toBe(3);
      expect(result.bestMatch.combinedScore).toBeGreaterThan(0.9);
    });

    // Test 2: Prefer nearby match over distant match
    it('prefers nearby match over distant match of equal fuzzy quality', () => {
      // Script with "hello world" appearing twice - near start and far away
      const words = ['hello', 'world'];
      const padding = Array(50).fill('padding');
      const script = [...words, ...padding, ...words].join(' ');
      const matcher = createMatcher(script);

      // currentPosition: 5, should prefer first "hello world" (positions 0-1)
      const result = findMatches('hello world', matcher, 5);

      expect(result.bestMatch).not.toBeNull();
      // First occurrence ends at position 1, second at position 53
      expect(result.bestMatch.position).toBeLessThan(10);
      expect(result.candidates.length).toBeGreaterThanOrEqual(2);
      // First candidate should have higher score due to proximity
      expect(result.candidates[0].combinedScore).toBeGreaterThan(result.candidates[1].combinedScore);
    });

    // Test 3: Radius constraint is enforced
    it('returns null when match is outside radius', () => {
      // Script with target phrase far from current position
      const padding = Array(100).fill('padding');
      const script = ['start', ...padding, 'target', 'phrase'].join(' ');
      const matcher = createMatcher(script);

      // currentPosition: 0, radius: 10, target phrase at position ~101-102
      const result = findMatches('target phrase', matcher, 0, { radius: 10 });

      expect(result.bestMatch).toBeNull();
      expect(result.candidates.length).toBe(0);
    });

    // Test 4: Minimum consecutive words required
    it('returns null when fewer than minConsecutive words match', () => {
      const script = 'the quick brown fox';
      const matcher = createMatcher(script);

      // Single word "brown" - below minConsecutive default of 2
      const result = findMatches('brown', matcher, 0);

      expect(result.bestMatch).toBeNull();
    });

    // Test 5: Fuzzy matching works for paraphrasing/speech variants
    it('finds fuzzy match for speech variants', () => {
      const script = 'presenting the results';
      const matcher = createMatcher(script);

      // "presentin the results" - dropped 'g' common in speech recognition
      // Fuse.js with threshold 0.3 should catch this minor variation
      const result = findMatches('presentin the results', matcher, 0, { threshold: 0.3 });

      expect(result.bestMatch).not.toBeNull();
      // Should find match even with slightly fuzzy words
      expect(result.bestMatch.combinedScore).toBeGreaterThan(0.5);
    });

    // Test 6: Distance penalty is applied correctly
    it('applies distance penalty - closer matches score higher', () => {
      const script = 'test words here more words test words again';
      const matcher = createMatcher(script);

      // "test words" appears at positions 0-1 and 5-6
      // currentPosition: 0, so first occurrence should score higher
      const result = findMatches('test words', matcher, 0, { radius: 50 });

      expect(result.candidates.length).toBeGreaterThanOrEqual(2);

      // Find the two matches
      const match1 = result.candidates.find(c => c.startPosition === 0);
      const match2 = result.candidates.find(c => c.startPosition === 5);

      expect(match1).toBeDefined();
      expect(match2).toBeDefined();

      // Distance 0 match should have higher combined score than distance 5 match
      expect(match1.combinedScore).toBeGreaterThan(match2.combinedScore);

      // The difference should be meaningful (distance penalty is working)
      expect(match1.combinedScore - match2.combinedScore).toBeGreaterThan(0.01);
    });
  });

  describe('statelessness', () => {
    it('produces same output for same inputs (pure function)', () => {
      const script = 'four score and seven years ago';
      const matcher = createMatcher(script);

      const result1 = findMatches('score and seven', matcher, 1);
      const result2 = findMatches('score and seven', matcher, 1);

      expect(result1.bestMatch.position).toBe(result2.bestMatch.position);
      expect(result1.bestMatch.combinedScore).toBe(result2.bestMatch.combinedScore);
      expect(result1.candidates.length).toBe(result2.candidates.length);
    });
  });

  describe('exact-match fast path (PRD-002)', () => {
    it('returns perfect fuse score (avgFuseScore=0) for exact word matches', () => {
      const script = 'four score and seven years ago';
      const matcher = createMatcher(script);

      // Exact transcript at position 0 — all words match exactly
      const result = findMatches('four score and', matcher, 0);

      expect(result.bestMatch).not.toBeNull();
      expect(result.bestMatch.position).toBe(2); // "and" at index 2
      // Exact matches should have avgFuseScore of 0 (perfect match quality)
      expect(result.bestMatch.avgFuseScore).toBe(0);
      // combinedScore accounts for distance penalty (endPosition=2, currentPosition=0)
      // so it won't be exactly 1, but should be very close
      expect(result.bestMatch.combinedScore).toBeGreaterThan(0.95);
    });

    it('still finds fuzzy matches when exact match fails', () => {
      const script = 'presenting the results of our study';
      const matcher = createMatcher(script);

      // "presentin" is not exact but should fuzzy-match "presenting"
      const result = findMatches('presentin the results', matcher, 0, { threshold: 0.3 });

      expect(result.bestMatch).not.toBeNull();
      expect(result.bestMatch.position).toBe(2); // "results" at index 2
      // Score should be > 0 since not all words are exact matches
      expect(result.bestMatch.avgFuseScore).toBeGreaterThan(0);
    });

    it('mixes exact and fuzzy matches in the same window', () => {
      const script = 'the quick brown fox jumps';
      const matcher = createMatcher(script);

      // "the" exact, "quik" fuzzy, "brown" exact
      const result = findMatches('the quik brown', matcher, 0, { threshold: 0.3 });

      expect(result.bestMatch).not.toBeNull();
      expect(result.bestMatch.position).toBe(2); // "brown" at index 2
      // avgFuseScore should be between 0 and threshold (one fuzzy, two exact)
      expect(result.bestMatch.avgFuseScore).toBeGreaterThan(0);
      expect(result.bestMatch.avgFuseScore).toBeLessThan(0.3);
    });
  });

  describe('performance (PRD-002)', () => {
    it('findMatches completes in under 16ms for a 5000-word script', () => {
      // Generate a 5000-word script with varied vocabulary
      const vocabulary = [
        'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
        'and', 'then', 'runs', 'through', 'green', 'forest', 'while',
        'birds', 'sing', 'above', 'trees', 'grow', 'tall', 'near',
        'river', 'flows', 'down', 'mountain', 'into', 'valley', 'below',
        'clouds', 'drift', 'across', 'blue', 'sky', 'on', 'warm', 'day'
      ];
      const words = [];
      for (let i = 0; i < 5000; i++) {
        words.push(vocabulary[i % vocabulary.length]);
      }
      const script = words.join(' ');
      const matcher = createMatcher(script);

      // Warm up
      findMatches('quick brown fox', matcher, 2500);

      // Measure
      const iterations = 10;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        findMatches('quick brown fox', matcher, 2500);
      }
      const elapsed = (performance.now() - start) / iterations;

      // NFR-1: must complete in under 16ms for 5000-word scripts
      expect(elapsed).toBeLessThan(16);
    });

    it('findMatches completes in under 50ms for a 10000-word script', () => {
      const vocabulary = [
        'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
        'and', 'then', 'runs', 'through', 'green', 'forest', 'while',
        'birds', 'sing', 'above', 'trees', 'grow', 'tall', 'near',
        'river', 'flows', 'down', 'mountain', 'into', 'valley', 'below',
        'clouds', 'drift', 'across', 'blue', 'sky', 'on', 'warm', 'day'
      ];
      const words = [];
      for (let i = 0; i < 10000; i++) {
        words.push(vocabulary[i % vocabulary.length]);
      }
      const script = words.join(' ');
      const matcher = createMatcher(script);

      // Warm up
      findMatches('quick brown fox', matcher, 5000);

      const iterations = 10;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        findMatches('quick brown fox', matcher, 5000);
      }
      const elapsed = (performance.now() - start) / iterations;

      // NFR-2: must complete in under 50ms for 10000-word scripts
      expect(elapsed).toBeLessThan(50);
    });

    it('exact-match fast path is faster than fuzzy-only for exact input', () => {
      // Large script where exact matching should provide clear speedup
      const vocabulary = [
        'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot',
        'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima'
      ];
      const words = [];
      for (let i = 0; i < 5000; i++) {
        words.push(vocabulary[i % vocabulary.length]);
      }
      const script = words.join(' ');
      const matcher = createMatcher(script);

      // Exact words that exist in the script
      const transcript = 'alpha bravo charlie';

      // Warm up
      findMatches(transcript, matcher, 0);

      // The fast path should make this very quick
      const iterations = 20;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        findMatches(transcript, matcher, 0);
      }
      const avgTime = (performance.now() - start) / iterations;

      // Should be well under 16ms with the fast path
      expect(avgTime).toBeLessThan(16);
    });
  });

  describe('edge cases', () => {
    // Edge case 1: Empty transcript
    it('returns empty result for empty transcript', () => {
      const script = 'four score and seven years ago';
      const matcher = createMatcher(script);

      const result = findMatches('', matcher, 0);

      expect(result.candidates).toEqual([]);
      expect(result.bestMatch).toBeNull();
    });

    // Edge case 2: Transcript with only filler words
    it('returns empty result for filler-only transcript', () => {
      const script = 'four score and seven years ago';
      const matcher = createMatcher(script);

      // "um", "uh", "like" are common filler words filtered by textUtils
      const result = findMatches('um uh like', matcher, 0);

      expect(result.candidates).toEqual([]);
      expect(result.bestMatch).toBeNull();
    });

    // Edge case 3: Script shorter than windowSize
    it('handles script shorter than windowSize', () => {
      const script = 'hello world'; // Only 2 words
      const matcher = createMatcher(script);

      // Should still work with windowSize default of 3
      const result = findMatches('hello world', matcher, 0, { windowSize: 3 });

      expect(result.bestMatch).not.toBeNull();
      expect(result.bestMatch.position).toBe(1); // "world" is at index 1
    });

    // Edge case 4: currentPosition at script end
    it('searches backward when currentPosition at script end', () => {
      const script = 'four score and seven years ago';
      const matcher = createMatcher(script);

      // currentPosition at end (index 5 = "ago"), should still find "score and"
      const result = findMatches('score and', matcher, 5, { radius: 10 });

      expect(result.bestMatch).not.toBeNull();
      expect(result.bestMatch.position).toBe(2); // "and" is at index 2
    });

    // Edge case 5: Negative currentPosition
    it('clamps negative currentPosition to 0', () => {
      const script = 'four score and seven years ago';
      const matcher = createMatcher(script);

      // Negative currentPosition should be treated as 0
      const result = findMatches('four score', matcher, -10, { radius: 10 });

      expect(result.bestMatch).not.toBeNull();
      expect(result.bestMatch.position).toBe(1); // "score" is at index 1
    });

    // Edge case 6: currentPosition beyond script length
    it('clamps currentPosition beyond script length', () => {
      const script = 'four score and seven years ago';
      const matcher = createMatcher(script);

      // Position 100 is way beyond script length of 6
      const result = findMatches('years ago', matcher, 100, { radius: 100 });

      expect(result.bestMatch).not.toBeNull();
      expect(result.bestMatch.position).toBe(5); // "ago" is at index 5
    });
  });
});
