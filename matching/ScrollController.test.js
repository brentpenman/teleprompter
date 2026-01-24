/**
 * ScrollController Tests - TDD for reactive scroll control
 *
 * Tests cover:
 * - positionToScrollTop: word index to scroll position conversion
 * - updatePace: speaking pace calculation from position changes
 * - calculateSpeed: pace to exponential smoothing speed conversion
 * - tick: animation frame with exponential smoothing
 * - State transitions: tracking/holding/stopped
 * - onPositionAdvanced: position change handling
 * - Edge cases: zero words, non-scrollable containers
 */

import { ScrollController } from './ScrollController.js';

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
    test('returns 0 for word index 0 (clamped)', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        caretPercent: 33
      });

      // wordIndex=0, totalWords=100, containerHeight=600, scrollHeight=2000, caretPercent=33
      // wordPositionInDoc = (0/100) * 2000 = 0
      // caretOffset = 0.33 * 600 = 198
      // targetScroll = 0 - 198 = -198 -> clamped to 0
      const result = controller.positionToScrollTop(0);
      expect(result).toBe(0);
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

  describe('calculateSpeed', () => {
    test('returns baseSpeed at default pace (2.5 wps)', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        baseSpeed: 5
      });

      // Default pace is 2.5, so speed = baseSpeed * (2.5 / 2.5) = 5
      expect(controller.calculateSpeed()).toBe(5);
    });

    test('scales proportionally with pace', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        baseSpeed: 5
      });

      // Double the pace
      controller.speakingPace = 5;

      // speed = 5 * (5 / 2.5) = 10
      expect(controller.calculateSpeed()).toBe(10);
    });

    test('returns jumpSpeed when set (skip detected)', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        baseSpeed: 5,
        jumpSpeed: 15
      });

      controller.currentJumpSpeed = 15;

      expect(controller.calculateSpeed()).toBe(15);
    });
  });

  describe('tick (animation frame)', () => {
    test('applies exponential smoothing formula', () => {
      const container = createMockContainer({ scrollTop: 0 });
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        baseSpeed: 5
      });

      controller.targetScrollTop = 100;
      controller.lastTimestamp = 0;

      // Simulate 16.67ms frame (60fps)
      controller.tick(16.67);

      // newScroll = 0 + (100 - 0) * (1 - exp(-5 * 0.01667))
      // factor = 1 - exp(-0.08335) = 1 - 0.92 = 0.08
      // newScroll = 0 + 100 * 0.08 = 8
      expect(container.scrollTop).toBeGreaterThan(0);
      expect(container.scrollTop).toBeLessThan(100);
    });

    test('is frame-rate independent (30fps vs 60fps)', () => {
      // Test at 60fps (16.67ms frames)
      const container60 = createMockContainer({ scrollTop: 0 });
      const tracker60 = createMockPositionTracker(0);
      const controller60 = new ScrollController(container60, tracker60, 100, {
        baseSpeed: 5
      });
      controller60.targetScrollTop = 100;
      controller60.lastTimestamp = 0;

      // Simulate 6 frames at 60fps = 100ms
      for (let t = 16.67; t <= 100; t += 16.67) {
        controller60.tick(t);
      }

      // Test at 30fps (33.33ms frames)
      const container30 = createMockContainer({ scrollTop: 0 });
      const tracker30 = createMockPositionTracker(0);
      const controller30 = new ScrollController(container30, tracker30, 100, {
        baseSpeed: 5
      });
      controller30.targetScrollTop = 100;
      controller30.lastTimestamp = 0;

      // Simulate 3 frames at 30fps = 100ms
      for (let t = 33.33; t <= 100; t += 33.33) {
        controller30.tick(t);
      }

      // Both should arrive at similar positions (within 5%)
      expect(Math.abs(container60.scrollTop - container30.scrollTop)).toBeLessThan(5);
    });

    test('clears jumpSpeed when close to target (<5px)', () => {
      const container = createMockContainer({ scrollTop: 97 });
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        jumpSpeed: 15
      });

      controller.currentJumpSpeed = 15;
      controller.targetScrollTop = 100;
      controller.lastTimestamp = 0;

      controller.tick(16.67);

      // Should clear jumpSpeed since we're within 5px
      expect(controller.currentJumpSpeed).toBeNull();
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
      controller.lastTimestamp = 0;

      // Simulate tick at 5001ms (past holdTimeout)
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

    test('sets jumpSpeed for large skips (distance > 10)', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        jumpSpeed: 15
      });

      controller.onPositionAdvanced(20, 5); // distance = 15

      expect(controller.currentJumpSpeed).toBe(15);
    });

    test('does not set jumpSpeed for small advances', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        jumpSpeed: 15
      });

      controller.onPositionAdvanced(8, 5); // distance = 3

      expect(controller.currentJumpSpeed).toBeNull();
    });

    test('updates targetScrollTop', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 100, {
        caretPercent: 33
      });

      controller.onPositionAdvanced(50, 0);

      // Should match positionToScrollTop(50)
      expect(controller.targetScrollTop).toBe(802);
    });
  });

  describe('edge cases', () => {
    test('handles totalWords = 0 gracefully', () => {
      const container = createMockContainer();
      const tracker = createMockPositionTracker(0);
      const controller = new ScrollController(container, tracker, 0);

      // Should not throw
      expect(() => controller.positionToScrollTop(0)).not.toThrow();
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

    test('reset() clears all state and scrollTop to 0', () => {
      const container = createMockContainer({ scrollTop: 500 });
      const tracker = createMockPositionTracker(50);
      const controller = new ScrollController(container, tracker, 100);

      controller.targetScrollTop = 500;
      controller.speakingPace = 5;
      controller.currentJumpSpeed = 15;
      controller.lastPosition = 50;
      controller.lastPositionTime = 1000;
      controller.isTracking = true;

      controller.reset();

      expect(container.scrollTop).toBe(0);
      expect(controller.targetScrollTop).toBe(0);
      expect(controller.speakingPace).toBe(2.5);
      expect(controller.currentJumpSpeed).toBeNull();
      expect(controller.lastPosition).toBe(0);
      expect(controller.lastPositionTime).toBe(0);
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
});
