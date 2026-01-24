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

    // Test 5: Fuzzy matching works for paraphrasing
    it('finds fuzzy match for paraphrased speech', () => {
      const script = 'going to the store';
      const matcher = createMatcher(script);

      // "gonna the store" - "gonna" should fuzzy match "going"
      // Note: "gonna" vs "going" - Fuse.js with threshold 0.3 should catch this
      const result = findMatches('gonna the store', matcher, 0, { threshold: 0.4 });

      expect(result.bestMatch).not.toBeNull();
      // Should find match even with fuzzy word
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
});
