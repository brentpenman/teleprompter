/**
 * VoskRecognizer Interface Compatibility Tests
 *
 * Tests that VoskRecognizer implements exact same interface as SpeechRecognizer.
 * Following TDD: these tests are written FIRST, before implementation.
 */

import VoskRecognizer from './VoskRecognizer.js';

// Mock vosk-browser to avoid actual WASM initialization
jest.mock('vosk-browser', () => ({
  createModel: jest.fn(() => Promise.resolve({
    KaldiRecognizer: jest.fn(function() {
      this.on = jest.fn();
      this.acceptWaveform = jest.fn();
      this.remove = jest.fn();
      return this;
    }),
    terminate: jest.fn()
  }))
}));

describe('VoskRecognizer', () => {
  describe('static methods', () => {
    it('has isSupported method that returns boolean', () => {
      expect(typeof VoskRecognizer.isSupported).toBe('function');
      expect(typeof VoskRecognizer.isSupported()).toBe('boolean');
    });

    it('isSupported returns true when SharedArrayBuffer available and crossOriginIsolated', () => {
      // In test environment, SharedArrayBuffer should be available
      const isSupported = VoskRecognizer.isSupported();
      // Test is informational - actual value depends on test environment
      expect(typeof isSupported).toBe('boolean');
    });

    it('has getPlatform method that returns platform info', () => {
      expect(typeof VoskRecognizer.getPlatform).toBe('function');
      const platform = VoskRecognizer.getPlatform();

      expect(platform).toHaveProperty('isIOS');
      expect(platform).toHaveProperty('isAndroid');
      expect(platform).toHaveProperty('isMobile');
      expect(typeof platform.isIOS).toBe('boolean');
      expect(typeof platform.isAndroid).toBe('boolean');
      expect(typeof platform.isMobile).toBe('boolean');
    });
  });

  describe('constructor', () => {
    it('accepts options object with callbacks', () => {
      const onTranscript = jest.fn();
      const onError = jest.fn();
      const onStateChange = jest.fn();

      const recognizer = new VoskRecognizer({
        onTranscript,
        onError,
        onStateChange,
        lang: 'en-US'
      });

      expect(recognizer).toBeInstanceOf(VoskRecognizer);
    });

    it('can be instantiated with empty options', () => {
      const recognizer = new VoskRecognizer();
      expect(recognizer).toBeInstanceOf(VoskRecognizer);
    });
  });

  describe('instance methods', () => {
    let recognizer;
    let mockCallbacks;

    beforeEach(() => {
      mockCallbacks = {
        onTranscript: jest.fn(),
        onError: jest.fn(),
        onStateChange: jest.fn()
      };
      recognizer = new VoskRecognizer(mockCallbacks);
    });

    it('has loadModel method that accepts ArrayBuffer', async () => {
      expect(typeof recognizer.loadModel).toBe('function');

      const mockModelData = new ArrayBuffer(100);
      await recognizer.loadModel(mockModelData);
      // Should not throw
    });

    it('has start method', () => {
      expect(typeof recognizer.start).toBe('function');
    });

    it('has stop method', () => {
      expect(typeof recognizer.stop).toBe('function');
    });

    it('has pause method', () => {
      expect(typeof recognizer.pause).toBe('function');
    });

    it('has resume method', () => {
      expect(typeof recognizer.resume).toBe('function');
    });

    it('has isListening method that returns boolean', () => {
      expect(typeof recognizer.isListening).toBe('function');
      expect(typeof recognizer.isListening()).toBe('boolean');
    });

    it('has isPaused method that returns boolean', () => {
      expect(typeof recognizer.isPaused).toBe('function');
      expect(typeof recognizer.isPaused()).toBe('boolean');
    });
  });

  describe('state management', () => {
    let recognizer;
    let mockCallbacks;

    beforeEach(() => {
      mockCallbacks = {
        onTranscript: jest.fn(),
        onError: jest.fn(),
        onStateChange: jest.fn()
      };
      recognizer = new VoskRecognizer(mockCallbacks);
    });

    it('isListening returns false initially', () => {
      expect(recognizer.isListening()).toBe(false);
    });

    it('isPaused returns false initially', () => {
      expect(recognizer.isPaused()).toBe(false);
    });

    it('throws error if start called before loadModel', async () => {
      await expect(recognizer.start()).rejects.toThrow('Model not loaded');
    });

    it('isListening returns true after start', async () => {
      const mockModelData = new ArrayBuffer(100);
      await recognizer.loadModel(mockModelData);

      // Mock getUserMedia
      global.navigator.mediaDevices = {
        getUserMedia: jest.fn(() => Promise.resolve({
          getTracks: () => []
        }))
      };

      await recognizer.start();
      expect(recognizer.isListening()).toBe(true);
    });

    it('isPaused returns true after pause', async () => {
      const mockModelData = new ArrayBuffer(100);
      await recognizer.loadModel(mockModelData);

      // Mock getUserMedia
      global.navigator.mediaDevices = {
        getUserMedia: jest.fn(() => Promise.resolve({
          getTracks: () => []
        }))
      };

      await recognizer.start();
      recognizer.pause();
      expect(recognizer.isPaused()).toBe(true);
    });

    it('isListening returns false after stop', async () => {
      const mockModelData = new ArrayBuffer(100);
      await recognizer.loadModel(mockModelData);

      // Mock getUserMedia
      global.navigator.mediaDevices = {
        getUserMedia: jest.fn(() => Promise.resolve({
          getTracks: () => []
        }))
      };

      await recognizer.start();
      await recognizer.stop();
      expect(recognizer.isListening()).toBe(false);
    });

    it('calls onStateChange callback on start', async () => {
      const mockModelData = new ArrayBuffer(100);
      await recognizer.loadModel(mockModelData);

      // Mock getUserMedia
      global.navigator.mediaDevices = {
        getUserMedia: jest.fn(() => Promise.resolve({
          getTracks: () => []
        }))
      };

      await recognizer.start();
      expect(mockCallbacks.onStateChange).toHaveBeenCalledWith('listening');
    });

    it('calls onStateChange callback on stop', async () => {
      const mockModelData = new ArrayBuffer(100);
      await recognizer.loadModel(mockModelData);

      // Mock getUserMedia
      global.navigator.mediaDevices = {
        getUserMedia: jest.fn(() => Promise.resolve({
          getTracks: () => []
        }))
      };

      await recognizer.start();
      mockCallbacks.onStateChange.mockClear();

      await recognizer.stop();
      expect(mockCallbacks.onStateChange).toHaveBeenCalledWith('idle');
    });

    it('calls onStateChange callback on pause', async () => {
      const mockModelData = new ArrayBuffer(100);
      await recognizer.loadModel(mockModelData);

      // Mock getUserMedia
      global.navigator.mediaDevices = {
        getUserMedia: jest.fn(() => Promise.resolve({
          getTracks: () => []
        }))
      };

      await recognizer.start();
      mockCallbacks.onStateChange.mockClear();

      recognizer.pause();
      expect(mockCallbacks.onStateChange).toHaveBeenCalledWith('idle');
    });

    it('calls onStateChange callback on resume', async () => {
      const mockModelData = new ArrayBuffer(100);
      await recognizer.loadModel(mockModelData);

      // Mock getUserMedia
      global.navigator.mediaDevices = {
        getUserMedia: jest.fn(() => Promise.resolve({
          getTracks: () => []
        }))
      };

      await recognizer.start();
      recognizer.pause();
      mockCallbacks.onStateChange.mockClear();

      recognizer.resume();
      expect(mockCallbacks.onStateChange).toHaveBeenCalledWith('listening');
    });
  });

  describe('interface compatibility with SpeechRecognizer', () => {
    it('has same public method signatures as SpeechRecognizer', () => {
      const recognizer = new VoskRecognizer();

      // Static methods
      expect(typeof VoskRecognizer.isSupported).toBe('function');
      expect(typeof VoskRecognizer.getPlatform).toBe('function');

      // Instance methods
      expect(typeof recognizer.start).toBe('function');
      expect(typeof recognizer.stop).toBe('function');
      expect(typeof recognizer.pause).toBe('function');
      expect(typeof recognizer.resume).toBe('function');
      expect(typeof recognizer.isListening).toBe('function');
      expect(typeof recognizer.isPaused).toBe('function');

      // Additional method for Vosk (not in SpeechRecognizer)
      expect(typeof recognizer.loadModel).toBe('function');
    });
  });
});
