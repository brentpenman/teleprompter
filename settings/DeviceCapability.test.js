/**
 * DeviceCapability Tests
 *
 * Tests device detection and engine recommendation:
 * - detect() returns correct platform flags
 * - detect() checks SharedArrayBuffer correctly
 * - recommendEngine() returns 'webspeech' for iOS
 * - recommendEngine() returns 'vosk' for Android with SharedArrayBuffer
 * - recommendEngine() returns 'webspeech' when Vosk unsupported
 */

import { jest } from '@jest/globals';
import DeviceCapability from './DeviceCapability.js';

describe('DeviceCapability', () => {
  // Store original values
  let originalNavigator;
  let originalSelf;
  let originalWindow;

  beforeEach(() => {
    // Store originals
    originalNavigator = global.navigator;
    originalSelf = global.self;
    originalWindow = global.window;

    // Set up basic browser-like environment
    global.navigator = {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      deviceMemory: 4
    };

    global.self = {
      crossOriginIsolated: true
    };

    global.window = {
      SpeechRecognition: function() {},
      webkitSpeechRecognition: undefined
    };

    // Mock SharedArrayBuffer
    global.SharedArrayBuffer = function() {};
  });

  afterEach(() => {
    // Restore originals
    global.navigator = originalNavigator;
    global.self = originalSelf;
    global.window = originalWindow;
  });

  describe('detect', () => {
    it('returns platform detection flags', () => {
      const result = DeviceCapability.detect();

      expect(result).toHaveProperty('platform');
      expect(result.platform).toHaveProperty('isIOS');
      expect(result.platform).toHaveProperty('isAndroid');
      expect(result.platform).toHaveProperty('isMobile');
      expect(result.platform).toHaveProperty('isDesktop');

      expect(typeof result.platform.isIOS).toBe('boolean');
      expect(typeof result.platform.isAndroid).toBe('boolean');
      expect(typeof result.platform.isMobile).toBe('boolean');
      expect(typeof result.platform.isDesktop).toBe('boolean');
    });

    it('detects desktop correctly', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';

      const result = DeviceCapability.detect();
      expect(result.platform.isDesktop).toBe(true);
      expect(result.platform.isMobile).toBe(false);
      expect(result.platform.isIOS).toBe(false);
      expect(result.platform.isAndroid).toBe(false);
    });

    it('detects iOS correctly', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)';

      const result = DeviceCapability.detect();
      expect(result.platform.isIOS).toBe(true);
      expect(result.platform.isMobile).toBe(true);
      expect(result.platform.isDesktop).toBe(false);
    });

    it('detects Android correctly', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36';

      const result = DeviceCapability.detect();
      expect(result.platform.isAndroid).toBe(true);
      expect(result.platform.isMobile).toBe(true);
      expect(result.platform.isDesktop).toBe(false);
    });

    it('returns capabilities object', () => {
      const result = DeviceCapability.detect();

      expect(result).toHaveProperty('capabilities');
      expect(result.capabilities).toHaveProperty('hasSharedArrayBuffer');
      expect(result.capabilities).toHaveProperty('hasWebSpeechAPI');
      expect(result.capabilities).toHaveProperty('deviceMemory');
      expect(result.capabilities).toHaveProperty('deviceTier');
    });

    it('detects SharedArrayBuffer when available and crossOriginIsolated', () => {
      global.SharedArrayBuffer = function() {};
      global.self.crossOriginIsolated = true;

      const result = DeviceCapability.detect();
      expect(result.capabilities.hasSharedArrayBuffer).toBe(true);
      expect(result.voskSupported).toBe(true);
    });

    it('detects SharedArrayBuffer as unavailable when not crossOriginIsolated', () => {
      global.SharedArrayBuffer = function() {};
      global.self.crossOriginIsolated = false;

      const result = DeviceCapability.detect();
      expect(result.capabilities.hasSharedArrayBuffer).toBe(false);
      expect(result.voskSupported).toBe(false);
    });

    it('detects SharedArrayBuffer as unavailable when undefined', () => {
      global.SharedArrayBuffer = undefined;
      global.self.crossOriginIsolated = true;

      const result = DeviceCapability.detect();
      expect(result.capabilities.hasSharedArrayBuffer).toBe(false);
      expect(result.voskSupported).toBe(false);
    });

    it('detects Web Speech API availability', () => {
      global.window.SpeechRecognition = function() {};

      const result = DeviceCapability.detect();
      expect(result.capabilities.hasWebSpeechAPI).toBe(true);
      expect(result.webSpeechSupported).toBe(true);
    });

    it('detects Web Speech API with webkit prefix', () => {
      global.window.SpeechRecognition = undefined;
      global.window.webkitSpeechRecognition = function() {};

      const result = DeviceCapability.detect();
      expect(result.capabilities.hasWebSpeechAPI).toBe(true);
      expect(result.webSpeechSupported).toBe(true);
    });

    it('detects device memory when available (Chromium)', () => {
      global.navigator.deviceMemory = 8;

      const result = DeviceCapability.detect();
      expect(result.capabilities.deviceMemory).toBe(8);
    });

    it('returns null for device memory when unavailable (Safari/Firefox)', () => {
      global.navigator.deviceMemory = undefined;

      const result = DeviceCapability.detect();
      expect(result.capabilities.deviceMemory).toBeNull();
    });

    it('categorizes device tier as low (<2GB)', () => {
      global.navigator.deviceMemory = 1;

      const result = DeviceCapability.detect();
      expect(result.capabilities.deviceTier).toBe('low');
    });

    it('categorizes device tier as mid (2-4GB)', () => {
      global.navigator.deviceMemory = 2;
      let result = DeviceCapability.detect();
      expect(result.capabilities.deviceTier).toBe('mid');

      global.navigator.deviceMemory = 3;
      result = DeviceCapability.detect();
      expect(result.capabilities.deviceTier).toBe('mid');
    });

    it('categorizes device tier as high (>4GB)', () => {
      global.navigator.deviceMemory = 4;
      let result = DeviceCapability.detect();
      expect(result.capabilities.deviceTier).toBe('high');

      global.navigator.deviceMemory = 8;
      result = DeviceCapability.detect();
      expect(result.capabilities.deviceTier).toBe('high');
    });

    it('categorizes device tier as unknown when deviceMemory unavailable', () => {
      global.navigator.deviceMemory = undefined;

      const result = DeviceCapability.detect();
      expect(result.capabilities.deviceTier).toBe('unknown');
    });
  });

  describe('recommendEngine', () => {
    it('recommends webspeech for iOS (SharedArrayBuffer unavailable)', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)';
      global.SharedArrayBuffer = undefined;
      global.self.crossOriginIsolated = false;

      const result = DeviceCapability.recommendEngine();
      expect(result.engine).toBe('webspeech');
      expect(result.reason).toContain('iOS');
      expect(result.shouldDownloadModel).toBe(false);
    });

    it('recommends vosk for Android with SharedArrayBuffer', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36';
      global.SharedArrayBuffer = function() {};
      global.self.crossOriginIsolated = true;

      const result = DeviceCapability.recommendEngine();
      expect(result.engine).toBe('vosk');
      expect(result.reason).toContain('Android');
      expect(result.reason).toContain('beep');
      expect(result.shouldDownloadModel).toBe(true);
    });

    it('recommends webspeech for Android without SharedArrayBuffer', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36';
      global.SharedArrayBuffer = undefined;
      global.self.crossOriginIsolated = false;

      const result = DeviceCapability.recommendEngine();
      expect(result.engine).toBe('webspeech');
      expect(result.reason).toContain('not supported');
      expect(result.shouldDownloadModel).toBe(false);
    });

    it('recommends webspeech for desktop with low memory', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';
      global.navigator.deviceMemory = 1;  // Low memory
      global.SharedArrayBuffer = function() {};
      global.self.crossOriginIsolated = true;

      const result = DeviceCapability.recommendEngine();
      expect(result.engine).toBe('webspeech');
      expect(result.reason).toContain('Low memory');
      expect(result.shouldDownloadModel).toBe(false);
    });

    it('recommends vosk for desktop with sufficient memory and SharedArrayBuffer', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';
      global.navigator.deviceMemory = 4;  // High memory
      global.SharedArrayBuffer = function() {};
      global.self.crossOriginIsolated = true;

      const result = DeviceCapability.recommendEngine();
      expect(result.engine).toBe('vosk');
      expect(result.reason).toContain('Desktop');
      expect(result.reason).toContain('offline');
      expect(result.shouldDownloadModel).toBe(true);
    });

    it('recommends webspeech for desktop without SharedArrayBuffer', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';
      global.navigator.deviceMemory = 8;
      global.SharedArrayBuffer = undefined;
      global.self.crossOriginIsolated = false;

      const result = DeviceCapability.recommendEngine();
      expect(result.engine).toBe('webspeech');
      expect(result.reason).toContain('not supported');
      expect(result.shouldDownloadModel).toBe(false);
    });

    it('includes shouldDownloadModel flag for vosk recommendations', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';
      global.SharedArrayBuffer = function() {};
      global.self.crossOriginIsolated = true;
      global.navigator.deviceMemory = 8;

      const result = DeviceCapability.recommendEngine();
      expect(result.engine).toBe('vosk');
      expect(result.shouldDownloadModel).toBe(true);
    });

    it('sets shouldDownloadModel to false for webspeech recommendations', () => {
      global.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)';

      const result = DeviceCapability.recommendEngine();
      expect(result.engine).toBe('webspeech');
      expect(result.shouldDownloadModel).toBe(false);
    });

    it('returns all required fields', () => {
      const result = DeviceCapability.recommendEngine();

      expect(result).toHaveProperty('engine');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('shouldDownloadModel');
      expect(['vosk', 'webspeech']).toContain(result.engine);
      expect(typeof result.reason).toBe('string');
      expect(typeof result.shouldDownloadModel).toBe('boolean');
    });
  });
});
