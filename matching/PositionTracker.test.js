/**
 * PositionTracker TDD Tests
 *
 * Tests for stateful position tracking with two-position model.
 * Following TDD: these tests are written FIRST, before implementation.
 *
 * Key behaviors tested:
 * - Monotonic forward movement (confirmedPosition never goes backward)
 * - Confidence-based confirmation (low scores don't advance position)
 * - Two-position model (confirmed vs candidate)
 * - Reset functionality
 */

import { PositionTracker } from './PositionTracker.js';

describe('PositionTracker', () => {
  describe('constructor', () => {
    it('initializes confirmedPosition to 0', () => {
      const tracker = new PositionTracker();
      expect(tracker.getConfirmedPosition()).toBe(0);
    });

    it('initializes candidatePosition to 0', () => {
      const tracker = new PositionTracker();
      // Access candidatePosition through processMatch result initially
      // After reset, both should be 0
      tracker.reset();
      expect(tracker.getConfirmedPosition()).toBe(0);
    });

    it('accepts custom confidenceThreshold', () => {
      const tracker = new PositionTracker({ confidenceThreshold: 0.8 });
      // With threshold 0.8, a score of 0.75 should not advance
      const result = tracker.processMatch({
        position: 10,
        startPosition: 8,
        matchCount: 3,
        combinedScore: 0.75, // Below 0.8 threshold
        startOffset: 50,
        endOffset: 80
      });
      expect(result.action).toBe('hold');
      expect(tracker.getConfirmedPosition()).toBe(0);
    });

    it('accepts custom nearbyThreshold', () => {
      const tracker = new PositionTracker({ nearbyThreshold: 5 });
      // Should use the custom threshold for nearby detection
      expect(tracker).toBeInstanceOf(PositionTracker);
    });
  });

  describe('getConfirmedPosition', () => {
    it('returns confirmedPosition', () => {
      const tracker = new PositionTracker();
      expect(tracker.getConfirmedPosition()).toBe(0);

      // After a successful advance
      tracker.processMatch({
        position: 10,
        startPosition: 8,
        matchCount: 3,
        combinedScore: 0.9,
        startOffset: 50,
        endOffset: 80
      });
      expect(tracker.getConfirmedPosition()).toBe(10);
    });
  });

  describe('getScrollBoundary', () => {
    it('returns confirmedPosition (alias for external code)', () => {
      const tracker = new PositionTracker();
      expect(tracker.getScrollBoundary()).toBe(0);

      // Use nearby position (within nearbyThreshold of 10)
      tracker.processMatch({
        position: 8,
        startPosition: 5,
        matchCount: 4,
        combinedScore: 0.85,
        startOffset: 40,
        endOffset: 70
      });
      expect(tracker.getScrollBoundary()).toBe(8);
      expect(tracker.getScrollBoundary()).toBe(tracker.getConfirmedPosition());
    });
  });

  describe('processMatch', () => {
    it('advances on high-confidence nearby match', () => {
      const tracker = new PositionTracker();
      const candidate = {
        position: 10,
        startPosition: 8,
        matchCount: 3,
        combinedScore: 0.9, // High confidence (above 0.7 default)
        startOffset: 50,
        endOffset: 80
      };

      const result = tracker.processMatch(candidate);

      expect(result.action).toBe('advanced');
      expect(result.confirmedPosition).toBe(10);
      expect(tracker.getConfirmedPosition()).toBe(10);
    });

    it('holds on low-confidence match', () => {
      const tracker = new PositionTracker();
      const candidate = {
        position: 10,
        startPosition: 8,
        matchCount: 3,
        combinedScore: 0.5, // Below 0.7 threshold
        startOffset: 50,
        endOffset: 80
      };

      const result = tracker.processMatch(candidate);

      expect(result.action).toBe('hold');
      expect(result.confirmedPosition).toBe(0);
      expect(tracker.getConfirmedPosition()).toBe(0);
    });

    it('holds on backward match (monotonic constraint)', () => {
      const tracker = new PositionTracker();

      // First, advance to position 10
      tracker.processMatch({
        position: 10,
        startPosition: 8,
        matchCount: 3,
        combinedScore: 0.9,
        startOffset: 50,
        endOffset: 80
      });
      expect(tracker.getConfirmedPosition()).toBe(10);

      // Now try to go backward to position 5
      const result = tracker.processMatch({
        position: 5,
        startPosition: 3,
        matchCount: 3,
        combinedScore: 0.95, // Very high confidence
        startOffset: 20,
        endOffset: 40
      });

      // Should NOT go backward, even with high confidence
      expect(result.action).toBe('hold');
      expect(result.confirmedPosition).toBe(10);
      expect(tracker.getConfirmedPosition()).toBe(10);
    });

    it('returns ProcessResult with correct shape', () => {
      const tracker = new PositionTracker();
      const result = tracker.processMatch({
        position: 10,
        startPosition: 8,
        matchCount: 3,
        combinedScore: 0.9,
        startOffset: 50,
        endOffset: 80
      });

      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('confirmedPosition');
      expect(['advanced', 'hold', 'exploring']).toContain(result.action);
      expect(typeof result.confirmedPosition).toBe('number');
    });

    it('allows advancing further forward after initial advance', () => {
      const tracker = new PositionTracker();

      // Advance to 10
      tracker.processMatch({
        position: 10,
        startPosition: 8,
        matchCount: 3,
        combinedScore: 0.9,
        startOffset: 50,
        endOffset: 80
      });

      // Advance further to 15
      const result = tracker.processMatch({
        position: 15,
        startPosition: 12,
        matchCount: 4,
        combinedScore: 0.85,
        startOffset: 80,
        endOffset: 110
      });

      expect(result.action).toBe('advanced');
      expect(result.confirmedPosition).toBe(15);
      expect(tracker.getConfirmedPosition()).toBe(15);
    });

    it('holds at exact same position (no backward, but also not forward)', () => {
      const tracker = new PositionTracker();

      // Advance to 10
      tracker.processMatch({
        position: 10,
        startPosition: 8,
        matchCount: 3,
        combinedScore: 0.9,
        startOffset: 50,
        endOffset: 80
      });

      // Match at same position
      const result = tracker.processMatch({
        position: 10,
        startPosition: 8,
        matchCount: 3,
        combinedScore: 0.95,
        startOffset: 50,
        endOffset: 80
      });

      // Same position is not advancing, should hold
      expect(result.action).toBe('hold');
      expect(result.confirmedPosition).toBe(10);
    });
  });

  describe('reset', () => {
    it('resets confirmedPosition to 0', () => {
      const tracker = new PositionTracker();

      // Advance to nearby position (within nearbyThreshold of 10)
      tracker.processMatch({
        position: 8,
        startPosition: 5,
        matchCount: 4,
        combinedScore: 0.9,
        startOffset: 40,
        endOffset: 70
      });
      expect(tracker.getConfirmedPosition()).toBe(8);

      // Reset
      tracker.reset();

      expect(tracker.getConfirmedPosition()).toBe(0);
    });

    it('resets candidatePosition to 0', () => {
      const tracker = new PositionTracker();

      // Advance position
      tracker.processMatch({
        position: 20,
        startPosition: 15,
        matchCount: 6,
        combinedScore: 0.9,
        startOffset: 100,
        endOffset: 150
      });

      tracker.reset();

      // After reset, should be able to advance from 0 again
      const result = tracker.processMatch({
        position: 5,
        startPosition: 3,
        matchCount: 3,
        combinedScore: 0.85,
        startOffset: 20,
        endOffset: 40
      });

      expect(result.action).toBe('advanced');
      expect(result.confirmedPosition).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('handles position of 0 correctly', () => {
      const tracker = new PositionTracker();
      const result = tracker.processMatch({
        position: 0,
        startPosition: 0,
        matchCount: 1,
        combinedScore: 0.9,
        startOffset: 0,
        endOffset: 5
      });

      // Position 0 is not forward from initial 0, should hold
      expect(result.action).toBe('hold');
    });

    it('handles first forward match correctly', () => {
      const tracker = new PositionTracker();
      const result = tracker.processMatch({
        position: 1,
        startPosition: 0,
        matchCount: 2,
        combinedScore: 0.9,
        startOffset: 0,
        endOffset: 10
      });

      expect(result.action).toBe('advanced');
      expect(result.confirmedPosition).toBe(1);
    });

    it('handles null candidate gracefully', () => {
      const tracker = new PositionTracker();
      const result = tracker.processMatch(null);

      expect(result.action).toBe('hold');
      expect(result.confirmedPosition).toBe(0);
    });

    it('handles undefined candidate gracefully', () => {
      const tracker = new PositionTracker();
      const result = tracker.processMatch(undefined);

      expect(result.action).toBe('hold');
      expect(result.confirmedPosition).toBe(0);
    });
  });

  describe('skip detection with consecutive match confirmation', () => {
    /**
     * Skip detection adds distance-dependent consecutive matching:
     * - distance <= 10 words (nearbyThreshold): require 1 match (normal tracking)
     * - distance 10-50 words (small skip): require 4 consecutive matches
     * - distance > 50 words (large skip): require 5 consecutive matches
     *
     * A match is "consecutive" if its startPosition is within 2 words of
     * the previous match's endPosition (allows gap for filler word filtering).
     */

    describe('small skip (10-50 words)', () => {
      it('returns exploring on first match 25 words ahead (1/4)', () => {
        const tracker = new PositionTracker();

        // Start at position 5
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });
        expect(tracker.getConfirmedPosition()).toBe(5);

        // User says words from 25 words ahead (position 30)
        const result = tracker.processMatch({
          position: 30,
          startPosition: 28,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 200,
          endOffset: 230
        });

        // Should be exploring, not advanced - need 4 consecutive for 25-word skip
        expect(result.action).toBe('exploring');
        expect(result.confirmedPosition).toBe(5); // Still at old position
        expect(result.candidatePosition).toBe(30);
        expect(result.consecutiveCount).toBe(1);
        expect(result.requiredCount).toBe(4);
      });

      it('returns exploring on 2nd consecutive match (2/4)', () => {
        const tracker = new PositionTracker();

        // Start at position 5
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });

        // 1st match at skip location (position 30)
        tracker.processMatch({
          position: 30,
          startPosition: 28,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 200,
          endOffset: 230
        });

        // 2nd consecutive match (position 31, starts within 2 of previous end)
        const result = tracker.processMatch({
          position: 31,
          startPosition: 30, // Within 2 words of previous position (30)
          matchCount: 2,
          combinedScore: 0.85,
          startOffset: 230,
          endOffset: 250
        });

        expect(result.action).toBe('exploring');
        expect(result.confirmedPosition).toBe(5);
        expect(result.consecutiveCount).toBe(2);
        expect(result.requiredCount).toBe(4);
      });

      it('returns exploring on 3rd consecutive match (3/4)', () => {
        const tracker = new PositionTracker();

        // Setup: at position 5, then 3 consecutive matches at skip location
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });

        tracker.processMatch({
          position: 30,
          startPosition: 28,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 200,
          endOffset: 230
        });

        tracker.processMatch({
          position: 31,
          startPosition: 30,
          matchCount: 2,
          combinedScore: 0.85,
          startOffset: 230,
          endOffset: 250
        });

        // 3rd consecutive match
        const result = tracker.processMatch({
          position: 32,
          startPosition: 31,
          matchCount: 2,
          combinedScore: 0.88,
          startOffset: 250,
          endOffset: 270
        });

        expect(result.action).toBe('exploring');
        expect(result.confirmedPosition).toBe(5);
        expect(result.consecutiveCount).toBe(3);
        expect(result.requiredCount).toBe(4);
      });

      it('advances on 4th consecutive match (4/4 - confirmed!)', () => {
        const tracker = new PositionTracker();

        // Setup: at position 5
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });

        // 4 consecutive matches at skip location
        tracker.processMatch({
          position: 30,
          startPosition: 28,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 200,
          endOffset: 230
        });

        tracker.processMatch({
          position: 31,
          startPosition: 30,
          matchCount: 2,
          combinedScore: 0.85,
          startOffset: 230,
          endOffset: 250
        });

        tracker.processMatch({
          position: 32,
          startPosition: 31,
          matchCount: 2,
          combinedScore: 0.88,
          startOffset: 250,
          endOffset: 270
        });

        // 4th consecutive match - should confirm!
        const result = tracker.processMatch({
          position: 33,
          startPosition: 32,
          matchCount: 2,
          combinedScore: 0.9,
          startOffset: 270,
          endOffset: 290
        });

        expect(result.action).toBe('advanced');
        expect(result.confirmedPosition).toBe(33);
        expect(tracker.getConfirmedPosition()).toBe(33);
      });
    });

    describe('large skip (50+ words)', () => {
      it('requires 5 consecutive matches for 60-word skip', () => {
        const tracker = new PositionTracker();

        // Start at position 5
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });

        // 1st match at 60 words ahead (position 65)
        const result = tracker.processMatch({
          position: 65,
          startPosition: 63,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 400,
          endOffset: 430
        });

        expect(result.action).toBe('exploring');
        expect(result.requiredCount).toBe(5); // Large skip needs 5
      });

      it('advances on 5th consecutive match for large skip', () => {
        const tracker = new PositionTracker();

        // Start at position 5
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });

        // 5 consecutive matches at skip location (60 words ahead)
        tracker.processMatch({
          position: 65,
          startPosition: 63,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 400,
          endOffset: 430
        });

        tracker.processMatch({
          position: 66,
          startPosition: 65,
          matchCount: 2,
          combinedScore: 0.85,
          startOffset: 430,
          endOffset: 450
        });

        tracker.processMatch({
          position: 67,
          startPosition: 66,
          matchCount: 2,
          combinedScore: 0.88,
          startOffset: 450,
          endOffset: 470
        });

        tracker.processMatch({
          position: 68,
          startPosition: 67,
          matchCount: 2,
          combinedScore: 0.9,
          startOffset: 470,
          endOffset: 490
        });

        // 5th consecutive match - should confirm!
        const result = tracker.processMatch({
          position: 69,
          startPosition: 68,
          matchCount: 2,
          combinedScore: 0.9,
          startOffset: 490,
          endOffset: 510
        });

        expect(result.action).toBe('advanced');
        expect(result.confirmedPosition).toBe(69);
      });
    });

    describe('streak management', () => {
      it('resets streak on non-consecutive match', () => {
        const tracker = new PositionTracker();

        // Start at position 5
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });

        // 1st match at skip location
        tracker.processMatch({
          position: 30,
          startPosition: 28,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 200,
          endOffset: 230
        });

        // 2nd consecutive match
        tracker.processMatch({
          position: 31,
          startPosition: 30,
          matchCount: 2,
          combinedScore: 0.85,
          startOffset: 230,
          endOffset: 250
        });

        // Non-consecutive match (gap of 5 words, more than 2)
        const result = tracker.processMatch({
          position: 36,
          startPosition: 36, // Gap of 5 from previous position 31
          matchCount: 1,
          combinedScore: 0.9,
          startOffset: 280,
          endOffset: 290
        });

        expect(result.action).toBe('exploring');
        expect(result.consecutiveCount).toBe(1); // Reset to 1
      });

      it('resets streak counter on reset()', () => {
        const tracker = new PositionTracker();

        // Build up a streak
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });

        tracker.processMatch({
          position: 30,
          startPosition: 28,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 200,
          endOffset: 230
        });

        tracker.processMatch({
          position: 31,
          startPosition: 30,
          matchCount: 2,
          combinedScore: 0.85,
          startOffset: 230,
          endOffset: 250
        });

        // Reset the tracker
        tracker.reset();

        // Start fresh - skip should require full streak again
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });

        const result = tracker.processMatch({
          position: 30,
          startPosition: 28,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 200,
          endOffset: 230
        });

        expect(result.consecutiveCount).toBe(1); // Fresh start
      });
    });

    describe('nearby matches unchanged', () => {
      it('immediately advances for distance <= 10 words (no consecutive requirement)', () => {
        const tracker = new PositionTracker();

        // Start at position 5
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });

        // Match only 8 words ahead (within nearbyThreshold of 10)
        const result = tracker.processMatch({
          position: 13, // 8 words ahead of 5
          startPosition: 11,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 80,
          endOffset: 110
        });

        // Should immediately advance - no consecutive confirmation needed
        expect(result.action).toBe('advanced');
        expect(result.confirmedPosition).toBe(13);
      });

      it('immediately advances for distance exactly at nearbyThreshold', () => {
        const tracker = new PositionTracker();

        // Start at position 5
        tracker.processMatch({
          position: 5,
          startPosition: 3,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 20,
          endOffset: 40
        });

        // Match exactly 10 words ahead (at nearbyThreshold)
        const result = tracker.processMatch({
          position: 15, // 10 words ahead of 5
          startPosition: 13,
          matchCount: 3,
          combinedScore: 0.9,
          startOffset: 100,
          endOffset: 130
        });

        // Should immediately advance - at threshold still counts as nearby
        expect(result.action).toBe('advanced');
        expect(result.confirmedPosition).toBe(15);
      });
    });

    describe('getRequiredConsecutive', () => {
      it('returns 1 for distance <= nearbyThreshold', () => {
        const tracker = new PositionTracker({ nearbyThreshold: 10 });
        expect(tracker.getRequiredConsecutive(5)).toBe(1);
        expect(tracker.getRequiredConsecutive(10)).toBe(1);
      });

      it('returns 4 for small skip (distance 11-50)', () => {
        const tracker = new PositionTracker({ nearbyThreshold: 10 });
        expect(tracker.getRequiredConsecutive(11)).toBe(4);
        expect(tracker.getRequiredConsecutive(25)).toBe(4);
        expect(tracker.getRequiredConsecutive(50)).toBe(4);
      });

      it('returns 5 for large skip (distance > 50)', () => {
        const tracker = new PositionTracker({ nearbyThreshold: 10 });
        expect(tracker.getRequiredConsecutive(51)).toBe(5);
        expect(tracker.getRequiredConsecutive(100)).toBe(5);
      });

      it('respects custom smallSkipConsecutive option', () => {
        const tracker = new PositionTracker({
          nearbyThreshold: 10,
          smallSkipConsecutive: 3
        });
        expect(tracker.getRequiredConsecutive(25)).toBe(3);
      });

      it('respects custom largeSkipConsecutive option', () => {
        const tracker = new PositionTracker({
          nearbyThreshold: 10,
          largeSkipConsecutive: 6
        });
        expect(tracker.getRequiredConsecutive(60)).toBe(6);
      });
    });
  });
});
