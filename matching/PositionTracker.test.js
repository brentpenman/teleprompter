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

      tracker.processMatch({
        position: 15,
        startPosition: 12,
        matchCount: 4,
        combinedScore: 0.85,
        startOffset: 70,
        endOffset: 100
      });
      expect(tracker.getScrollBoundary()).toBe(15);
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

      // Advance to some position
      tracker.processMatch({
        position: 20,
        startPosition: 15,
        matchCount: 6,
        combinedScore: 0.9,
        startOffset: 100,
        endOffset: 150
      });
      expect(tracker.getConfirmedPosition()).toBe(20);

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
});
