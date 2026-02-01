/**
 * RecognizerFactory Tests
 *
 * Tests recognizer creation with fallback logic:
 * - create('auto') uses DeviceCapability.recommendEngine()
 * - create('vosk') attempts Vosk, falls back to Web Speech on error
 * - create('webspeech') creates SpeechRecognizer directly
 * - Fallback reason included when falling back
 * - Throws error when neither engine supported
 */

import { jest } from '@jest/globals';

describe('RecognizerFactory', () => {
  let RecognizerFactory;
  let SpeechRecognizer;
  let VoskRecognizer;
  let DeviceCapability;
  let mockCallbacks;
  let mockOnModelProgress;

  beforeEach(async () => {
    // Set up browser-like environment
    global.navigator = {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      deviceMemory: 4
    };

    global.window = {
      SpeechRecognition: function() {},
      webkitSpeechRecognition: undefined
    };

    global.self = {
      crossOriginIsolated: true
    };

    global.SharedArrayBuffer = function() {};

    // Import modules
    RecognizerFactory = (await import('./recognizerFactory.js')).default;
    SpeechRecognizer = (await import('./SpeechRecognizer.js')).default;
    VoskRecognizer = (await import('./VoskRecognizer.js')).default;
    DeviceCapability = (await import('../settings/DeviceCapability.js')).default;

    // Set up callbacks
    mockCallbacks = {
      onTranscript: jest.fn(),
      onError: jest.fn(),
      onStateChange: jest.fn()
    };

    mockOnModelProgress = jest.fn();

    // Spy on static methods
    jest.spyOn(SpeechRecognizer, 'isSupported').mockReturnValue(true);
    jest.spyOn(VoskRecognizer, 'isSupported').mockReturnValue(true);
    jest.spyOn(DeviceCapability, 'recommendEngine');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('input validation', () => {
    it('throws error for invalid preferredEngine', async () => {
      await expect(RecognizerFactory.create('invalid', mockCallbacks))
        .rejects.toThrow('preferredEngine must be "auto", "vosk", or "webspeech"');
    });

    it('throws error for missing callbacks', async () => {
      await expect(RecognizerFactory.create('auto', null))
        .rejects.toThrow('callbacks.onTranscript is required');
    });

    it('throws error for missing onTranscript callback', async () => {
      await expect(RecognizerFactory.create('auto', { onError: jest.fn() }))
        .rejects.toThrow('callbacks.onTranscript is required');
    });
  });

  describe('create with "auto" engine', () => {
    it('calls DeviceCapability.recommendEngine', async () => {
      DeviceCapability.recommendEngine.mockReturnValue({
        engine: 'webspeech',
        reason: 'Test recommendation',
        shouldDownloadModel: false
      });

      await RecognizerFactory.create('auto', mockCallbacks);

      expect(DeviceCapability.recommendEngine).toHaveBeenCalled();
    });

    it('creates Web Speech recognizer when recommended', async () => {
      DeviceCapability.recommendEngine.mockReturnValue({
        engine: 'webspeech',
        reason: 'iOS device',
        shouldDownloadModel: false
      });

      const result = await RecognizerFactory.create('auto', mockCallbacks);

      expect(result.engineUsed).toBe('webspeech');
      expect(result.recognizer).toBeInstanceOf(SpeechRecognizer);
      expect(result.fallbackReason).toBeNull();
    });

    it('attempts Vosk when recommended but requires model loading', async () => {
      DeviceCapability.recommendEngine.mockReturnValue({
        engine: 'vosk',
        reason: 'Recommended for your device',
        shouldDownloadModel: true
      });

      // VoskRecognizer will attempt to load but should fall back gracefully
      // (We can't actually load Vosk model in tests)
      const result = await RecognizerFactory.create('auto', mockCallbacks, mockOnModelProgress);

      // Should fall back to webspeech since model loading will fail
      expect(result.engineUsed).toBe('webspeech');
      expect(result.fallbackReason).toBeTruthy();
    });
  });

  describe('create with "vosk" engine', () => {
    it('falls back to Web Speech when Vosk not supported', async () => {
      jest.spyOn(VoskRecognizer, 'isSupported').mockReturnValue(false);
      jest.spyOn(SpeechRecognizer, 'isSupported').mockReturnValue(true);

      const result = await RecognizerFactory.create('vosk', mockCallbacks);

      expect(result.engineUsed).toBe('webspeech');
      expect(result.recognizer).toBeInstanceOf(SpeechRecognizer);
      expect(result.fallbackReason).toContain('not supported');
    });

    it('attempts Vosk initialization when supported', async () => {
      jest.spyOn(VoskRecognizer, 'isSupported').mockReturnValue(true);

      // Will fail model loading in test environment, but that's expected
      const result = await RecognizerFactory.create('vosk', mockCallbacks, mockOnModelProgress);

      // Should fall back gracefully
      expect(result.engineUsed).toBe('webspeech');
      expect(result.fallbackReason).toBeTruthy();
    });
  });

  describe('create with "webspeech" engine', () => {
    it('creates Web Speech recognizer directly', async () => {
      jest.spyOn(SpeechRecognizer, 'isSupported').mockReturnValue(true);

      const result = await RecognizerFactory.create('webspeech', mockCallbacks);

      expect(result.engineUsed).toBe('webspeech');
      expect(result.recognizer).toBeInstanceOf(SpeechRecognizer);
      expect(result.fallbackReason).toBeNull();
    });

    it('does not call DeviceCapability.recommendEngine', async () => {
      await RecognizerFactory.create('webspeech', mockCallbacks);

      expect(DeviceCapability.recommendEngine).not.toHaveBeenCalled();
    });

    it('does not attempt Vosk initialization', async () => {
      const voskSupportedSpy = jest.spyOn(VoskRecognizer, 'isSupported');

      await RecognizerFactory.create('webspeech', mockCallbacks);

      expect(voskSupportedSpy).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('throws error when neither engine is supported', async () => {
      jest.spyOn(VoskRecognizer, 'isSupported').mockReturnValue(false);
      jest.spyOn(SpeechRecognizer, 'isSupported').mockReturnValue(false);

      await expect(RecognizerFactory.create('vosk', mockCallbacks))
        .rejects.toThrow('Neither Vosk nor Web Speech API is supported');
    });

    it('throws error when Web Speech not supported and requested', async () => {
      jest.spyOn(SpeechRecognizer, 'isSupported').mockReturnValue(false);

      await expect(RecognizerFactory.create('webspeech', mockCallbacks))
        .rejects.toThrow('Neither Vosk nor Web Speech API is supported');
    });
  });

  describe('return value structure', () => {
    it('returns recognizer, engineUsed, and fallbackReason', async () => {
      const result = await RecognizerFactory.create('webspeech', mockCallbacks);

      expect(result).toHaveProperty('recognizer');
      expect(result).toHaveProperty('engineUsed');
      expect(result).toHaveProperty('fallbackReason');
    });

    it('sets fallbackReason to null when no fallback occurred', async () => {
      const result = await RecognizerFactory.create('webspeech', mockCallbacks);

      expect(result.fallbackReason).toBeNull();
    });

    it('includes fallbackReason when falling back', async () => {
      jest.spyOn(VoskRecognizer, 'isSupported').mockReturnValue(false);

      const result = await RecognizerFactory.create('vosk', mockCallbacks);

      expect(result.fallbackReason).not.toBeNull();
      expect(typeof result.fallbackReason).toBe('string');
    });

    it('returns valid recognizer instance', async () => {
      const result = await RecognizerFactory.create('webspeech', mockCallbacks);

      expect(result.recognizer).toBeDefined();
      expect(typeof result.recognizer.start).toBe('function');
      expect(typeof result.recognizer.stop).toBe('function');
    });
  });
});
