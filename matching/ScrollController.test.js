/**
 * ScrollController Tests - TDD for velocity-based scroll control
 *
 * Tests cover:
 * - positionToScrollTop: word index to scroll position conversion
 * - updatePace: speaking pace calculation from position changes
 * - getPixelsPerWord: content dimension to word spacing calculation
 * - calculateBaseSpeed: pace to scroll velocity conversion
 * - tick: animation frame with velocity + proportional correction
 * - State transitions: tracking/holding/stopped
 * - onPositionAdvanced: position change handling
 * - Edge cases: zero words, non-scrollable containers
 */

import { jest } from '@jest/globals';
import { ScrollController } from './ScrollController.js';

// Mock requestAnimationFrame and cancelAnimationFrame for Node environment
// Return incrementing IDs but don't actually schedule callbacks (prevents infinite loops)
let rafId = 0;
global.requestAnimationFrame = jest.fn(() => ++rafId);
global.cancelAnimationFrame = jest.fn();
global.performance = global.performance || { now: () => Date.now() };

/**
 * Create mock container with scrollable properties
 */
function createMockContainer(options = {}) {
  const {
    scrollTop = 0,
    scrollHeight = 2000,
    clientHeight = 600
  } = options;

  return {
    scrollTop,
    scrollHeight,
    clientHeight
  };
}

/**
 * Create mock PositionTracker
 */
function createMockPositionTracker(confirmedPosition = 0) {
  return {
    getConfirmedPosition: jest.fn(() => confirmedPosition)
  };
}

describe('ScrollController', () => {
  describe('positionToScrollTop', () => {
    test('returns initial scroll for word index 0 (aligns with caret)', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        caretPercent: 33
      });

      // wordIndex=0, containerHeight=600, scrollHeight=2000, caretPercent=33
      // paddingTop = 600 * 0.5 = 300
      // contentHeight = 2000 - 300 - 300 = 1400
      // wordPositionInContent = (0/100) * 1400 = 0
      // wordPositionInDoc = 300 + 0 = 300
      // caretOffset = 0.33 * 600 = 198
      // targetScroll = 300 - 198 = 102
      const result = controller.positionToScrollTop(0);
      expect(result).toBe(102);
    });

    test('calculates correct scroll for middle position', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        caretPercent: 33
      });

      // wordIndex=50, totalWords=100
      // wordPositionInDoc = (50/100) * 2000 = 1000
      // caretOffset = 0.33 * 600 = 198
      // targetScroll = 1000 - 198 = 802
      const result = controller.positionToScrollTop(50);
      expect(result).toBe(802);
    });

    test('clamps to maxScroll at end of document', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        caretPercent: 33
      });

      // wordIndex=100, totalWords=100
      // wordPositionInDoc = (100/100) * 2000 = 2000
      // caretOffset = 0.33 * 600 = 198
      // targetScroll = 2000 - 198 = 1802 -> clamped to maxScroll = 2000 - 600 = 1400
      const result = controller.positionToScrollTop(100);
      expect(result).toBe(1400);
    });

    test('uses custom caretPercent correctly', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        caretPercent: 50
      });

      // wordIndex=50, totalWords=100, caretPercent=50
      // wordPositionInDoc = (50/100) * 2000 = 1000
      // caretOffset = 0.50 * 600 = 300
      // targetScroll = 1000 - 300 = 700
      const result = controller.positionToScrollTop(50);
      expect(result).toBe(700);
    });
  });

  describe('updatePace', () => {
    test('calculates instant pace from position delta over time', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      // First call establishes baseline
      controller.updatePace(0, 0);

      // position 0 at t=0, position 5 at t=2000ms
      // instantPace = 5 / 2 = 2.5 words/sec
      controller.updatePace(5, 2000);

      // Default speakingPace is 2.5, after update:
      // newPace = 2.5 * 0.7 + 2.5 * 0.3 = 2.5
      expect(controller.speakingPace).toBe(2.5);
    });

    test('smooths pace via exponential moving average', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      // Start at position 0
      controller.updatePace(0, 0);

      // Move to position 10 in 2 seconds (5 wps)
      controller.updatePace(10, 2000);

      // newPace = 2.5 * 0.7 + 5 * 0.3 = 1.75 + 1.5 = 3.25
      expect(controller.speakingPace).toBeCloseTo(3.25, 2);
    });

    test('ignores long gaps (>5 seconds)', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      const initialPace = controller.speakingPace;

      controller.updatePace(0, 0);
      // 6 second gap - should be ignored
      controller.updatePace(10, 6000);

      expect(controller.speakingPace).toBe(initialPace);
    });

    test('ignores same position (no movement)', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      const initialPace = controller.speakingPace;

      controller.updatePace(5, 0);
      controller.updatePace(5, 1000); // Same position

      expect(controller.speakingPace).toBe(initialPace);
    });

    test('clamps pace to minPace and maxPace', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        minPace: 0.5,
        maxPace: 10
      });

      controller.updatePace(0, 0);

      // Very fast speaking (20 wps) - should be clamped to 10
      controller.updatePace(20, 1000);

      // newPace = 2.5 * 0.7 + 10 * 0.3 = 1.75 + 3 = 4.75
      expect(controller.speakingPace).toBeCloseTo(4.75, 2);
    });
  });

  describe('getPixelsPerWord', () => {
    test('calculates pixels per word from content height', () => {
      const container = createMockContainer({
        scrollHeight: 2000,
        clientHeight: 600
      });
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      // paddingTop = clientHeight * 0.5 = 300
      // paddingBottom = clientHeight * 0.5 = 300
      // contentHeight = scrollHeight - paddingTop - paddingBottom = 2000 - 300 - 300 = 1400
      // pixelsPerWord = 1400 / 100 = 14
      const result = controller.getPixelsPerWord();
      expect(result).toBe(14);
    });

    test('returns 0 for zero total words', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 0);

      expect(controller.getPixelsPerWord()).toBe(0);
    });
  });

  describe('calculateBaseSpeed', () => {
    test('converts speaking pace to pixels per second', () => {
      const container = createMockContainer({
        scrollHeight: 2000,
        clientHeight: 600
      });
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      // Default pace is 2.5 wps
      // pixelsPerWord = 14 (from getPixelsPerWord test)
      // baseSpeed = 2.5 * 14 = 35 px/sec
      const result = controller.calculateBaseSpeed();
      expect(result).toBe(35);
    });

    test('scales with speaking pace', () => {
      const container = createMockContainer({
        scrollHeight: 2000,
        clientHeight: 600
      });
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      controller.speakingPace = 5; // Double the default

      // baseSpeed = 5 * 14 = 70 px/sec
      const result = controller.calculateBaseSpeed();
      expect(result).toBe(70);
    });
  });

  describe('tick (animation frame)', () => {
    test('applies continuous scroll based on pace', () => {
      const container = createMockContainer({ scrollTop: 0 });
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      controller.lastTimestamp = 0;

      // Simulate 100ms frame
      controller.tick(100);

      // baseSpeed = 2.5 * 8 = 20 px/sec
      // scrollDelta = 20 * 0.1 = 2 px
      // But there's also correction based on position error
      // At position 0, expectedScroll should be near 0 (clamped)
      // So scroll should be small but positive
      expect(container.scrollTop).toBeGreaterThanOrEqual(0);
    });

    test('applies proportional correction when behind expected position', () => {
      const container = createMockContainer({ scrollTop: 0 });
      const tracker = createMockPositionTracker(50); // Confirmed at word 50
      const controller = new ScrollController(container, tracker, 100, {
        correctionGain: 1.5,
        syncDeadband: 15
      });

      controller.lastTimestamp = 0;

      // Expected scroll for position 50 is 802 (from positionToScrollTop test)
      // Error = 802 - 0 = 802 (way behind)
      // correctionSpeed = min(802 * 1.5, maxCorrectionSpeed) = capped at 200
      // So total speed should be baseSpeed + 200

      controller.tick(100); // 100ms frame

      // Should scroll more than just base speed due to correction
      // baseSpeed alone = 20 * 0.1 = 2px
      // With max correction = (20 + 200) * 0.1 = 22px
      expect(container.scrollTop).toBeGreaterThan(2);
    });

    test('ignores small errors within syncDeadband', () => {
      const container = createMockContainer({ scrollTop: 800 });
      const tracker = createMockPositionTracker(50); // Expected scroll ~802
      const controller = new ScrollController(container, tracker, 100, {
        correctionGain: 1.5,
        syncDeadband: 15
      });

      controller.lastTimestamp = 0;

      // Error = 802 - 800 = 2 (within deadband of 15)
      // No correction should be applied

      const initialScroll = container.scrollTop;
      controller.tick(100);

      // Should only apply base speed, no correction
      // baseSpeed = 20 px/sec, dt = 0.1s, delta = 2px
      const expectedDelta = controller.calculateBaseSpeed() * 0.1;
      expect(container.scrollTop - initialScroll).toBeCloseTo(expectedDelta, 0);
    });

    test('skips frame if dt > 0.1s to avoid jumps', () => {
      const container = createMockContainer({ scrollTop: 100 });
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      controller.lastTimestamp = 0;

      // Simulate 200ms gap (should be skipped)
      controller.tick(200);

      // Scroll should not change significantly
      expect(container.scrollTop).toBe(100);
    });

    test('catch-up mode applies speed multiplier', () => {
      const container = createMockContainer({ scrollTop: 0 });
      const tracker = createMockPositionTracker(50);
      const controller = new ScrollController(container, tracker, 100, {
        catchUpMultiplier: 3,
        correctionGain: 1.5
      });

      controller.isCatchingUp = true;
      controller.lastTimestamp = 0;

      controller.tick(100);

      // With catch-up, base speed is tripled
      // baseSpeed = 20 * 3 = 60 px/sec (before correction)
      // Plus correction for being behind
      expect(container.scrollTop).toBeGreaterThan(5);
    });

    test('exits catch-up mode when close to target', () => {
      const container = createMockContainer({ scrollTop: 800 });
      const tracker = createMockPositionTracker(50); // Expected ~802
      const controller = new ScrollController(container, tracker, 100, {
        syncDeadband: 15
      });

      controller.isCatchingUp = true;
      controller.lastTimestamp = 0;

      // Error = 802 - 800 = 2, which is < syncDeadband * 2 = 30
      controller.tick(100);

      expect(controller.isCatchingUp).toBe(false);
    });
  });

  describe('tracking/holding state', () => {
    test('starts with isTracking = false', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      expect(controller.isTracking).toBe(false);
    });

    test('start() sets isTracking = true and calls onStateChange', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const onStateChange = jest.fn();
      const controller = new ScrollController(container, tracker, 100, {
        onStateChange
      });

      controller.start();

      expect(controller.isTracking).toBe(true);
      expect(onStateChange).toHaveBeenCalledWith('tracking');
    });

    test('transitions to holding after holdTimeout without advance', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const onStateChange = jest.fn();
      const controller = new ScrollController(container, tracker, 100, {
        holdTimeout: 5000,
        onStateChange
      });

      controller.start();
      controller.lastAdvanceTime = 0;
      // Set lastTimestamp close to tick time so dt < 0.1s (won't skip frame)
      controller.lastTimestamp = 5000;

      // Simulate tick at 5001ms (past holdTimeout, dt = 1ms)
      controller.tick(5001);

      expect(controller.isTracking).toBe(false);
      expect(onStateChange).toHaveBeenCalledWith('holding');
    });

    test('resumes tracking on position advance while holding', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const onStateChange = jest.fn();
      const controller = new ScrollController(container, tracker, 100, {
        onStateChange
      });

      controller.isTracking = false; // Holding state

      controller.onPositionAdvanced(10, 0);

      expect(controller.isTracking).toBe(true);
      expect(onStateChange).toHaveBeenCalledWith('tracking');
    });

    test('stop() sets isTracking = false and calls onStateChange', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const onStateChange = jest.fn();
      const controller = new ScrollController(container, tracker, 100, {
        onStateChange
      });

      controller.start();
      controller.stop();

      expect(controller.isTracking).toBe(false);
      expect(onStateChange).toHaveBeenCalledWith('stopped');
    });
  });

  describe('onPositionAdvanced', () => {
    test('updates pace calculation', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      // Establish baseline
      controller.lastPosition = 0;
      controller.lastPositionTime = 0;

      controller.onPositionAdvanced(10, 0);

      // Position and time should be updated
      expect(controller.lastPosition).toBe(10);
      expect(controller.lastPositionTime).toBeGreaterThan(0);
    });

    test('enables catch-up mode for large skips (distance > 10)', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      controller.onPositionAdvanced(20, 5); // distance = 15

      expect(controller.isCatchingUp).toBe(true);
    });

    test('does not enable catch-up mode for small advances', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      controller.onPositionAdvanced(8, 5); // distance = 3

      expect(controller.isCatchingUp).toBe(false);
    });

    test('updates lastAdvanceTime', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      const before = controller.lastAdvanceTime;

      controller.onPositionAdvanced(10, 0);

      expect(controller.lastAdvanceTime).toBeGreaterThan(before);
    });
  });

  describe('edge cases', () => {
    test('handles totalWords = 0 gracefully', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 0);

      // Should not throw
      expect(() => controller.positionToScrollTop(0)).not.toThrow();
      expect(() => controller.getPixelsPerWord()).not.toThrow();
      expect(() => controller.calculateBaseSpeed()).not.toThrow();
    });

    test('handles non-scrollable container (scrollHeight <= clientHeight)', () => {
      const container = createMockContainer({
        scrollHeight: 600,
        clientHeight: 600
      });
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      // maxScroll = 0, so should return 0
      const result = controller.positionToScrollTop(50);
      expect(result).toBe(0);
    });

    test('reset() clears all state and aligns scroll with caret', () => {
      const container = createMockContainer({ scrollTop: 500 });
      const tracker = createMockPositionTracker(50);
      const controller = new ScrollController(container, tracker, 100);

      controller.speakingPace = 5;
      controller.isCatchingUp = true;
      controller.lastPosition = 50;
      controller.lastPositionTime = 1000;
      controller.isTracking = true;

      controller.reset();

      // Initial scroll aligns first line with caret (50vh padding, 33% caret)
      // initialScroll = clientHeight * (0.5 - 0.33) = 600 * 0.17 = 102
      const expectedScroll = container.clientHeight * (0.5 - controller.caretPercent / 100);
      expect(container.scrollTop).toBe(expectedScroll);
      expect(controller.speakingPace).toBe(2.5);
      expect(controller.isCatchingUp).toBe(false);
      expect(controller.lastPosition).toBe(0);
      expect(controller.lastPositionTime).toBe(-1);
      expect(controller.isTracking).toBe(false);
    });
  });

  describe('queries PositionTracker', () => {
    test('queries getConfirmedPosition on tick', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(10);
      const controller = new ScrollController(container, tracker, 100);

      controller.lastTimestamp = 0;
      controller.tick(16.67);

      expect(tracker.getConfirmedPosition).toHaveBeenCalled();
    });
  });

  describe('setCaretPercent', () => {
    test('updates caretPercent', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      controller.setCaretPercent(50);

      expect(controller.caretPercent).toBe(50);
    });

    test('clamps to valid range (10-90%)', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100);

      controller.setCaretPercent(5);
      expect(controller.caretPercent).toBe(10);

      controller.setCaretPercent(95);
      expect(controller.caretPercent).toBe(90);
    });
  });
});
