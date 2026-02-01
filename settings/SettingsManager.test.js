/**
 * SettingsManager Tests
 *
 * Tests localStorage persistence with error handling:
 * - Load returns defaults when localStorage empty
 * - Save persists to localStorage
 * - Set updates specific key
 * - Get retrieves specific key
 * - Private browsing simulation (mock localStorage.setItem to throw)
 */

import { jest } from '@jest/globals';
import SettingsManager from './SettingsManager.js';

// Mock localStorage for Node environment
const localStorageMock = (() => {
  let store = {};

  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

// Set up global localStorage
global.localStorage = localStorageMock;

describe('SettingsManager', () => {
  let settingsManager;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    settingsManager = new SettingsManager('test-settings');
  });

  afterEach(() => {
    // Clean up after each test
    localStorage.clear();
  });

  describe('constructor', () => {
    it('accepts custom storage key', () => {
      const manager = new SettingsManager('custom-key');
      expect(manager.storageKey).toBe('custom-key');
    });

    it('uses default storage key when not provided', () => {
      const manager = new SettingsManager();
      expect(manager.storageKey).toBe('teleprompter-settings');
    });

    it('defines default settings', () => {
      expect(settingsManager.defaults).toEqual({
        recognitionEngine: 'auto',
        fontSize: 48,
        scrollSpeed: 50,
        highlightEnabled: true,
        mirrorEnabled: false
      });
    });
  });

  describe('load', () => {
    it('returns defaults when localStorage is empty', () => {
      const settings = settingsManager.load();
      expect(settings).toEqual(settingsManager.defaults);
    });

    it('returns stored settings merged with defaults', () => {
      // Manually set localStorage to simulate stored settings
      localStorage.setItem('test-settings', JSON.stringify({
        recognitionEngine: 'vosk',
        fontSize: 60
      }));

      const settings = settingsManager.load();
      expect(settings).toEqual({
        recognitionEngine: 'vosk',
        fontSize: 60,
        scrollSpeed: 50,
        highlightEnabled: true,
        mirrorEnabled: false
      });
    });

    it('handles corrupted JSON gracefully', () => {
      // Set invalid JSON
      localStorage.setItem('test-settings', '{invalid json}');

      const settings = settingsManager.load();
      expect(settings).toEqual(settingsManager.defaults);
    });

    it('handles localStorage errors gracefully', () => {
      // Mock getItem to throw error (simulating private browsing)
      const originalGetItem = localStorage.getItem;
      localStorage.getItem = jest.fn(() => {
        throw new Error('SecurityError: Private browsing mode');
      });

      const settings = settingsManager.load();
      expect(settings).toEqual(settingsManager.defaults);

      // Restore
      localStorage.getItem = originalGetItem;
    });
  });

  describe('save', () => {
    it('persists settings to localStorage', () => {
      const newSettings = {
        recognitionEngine: 'vosk',
        fontSize: 60,
        scrollSpeed: 75,
        highlightEnabled: false,
        mirrorEnabled: true
      };

      const result = settingsManager.save(newSettings);
      expect(result).toBe(true);

      const stored = localStorage.getItem('test-settings');
      expect(JSON.parse(stored)).toEqual(newSettings);
    });

    it('merges partial settings with defaults', () => {
      const partialSettings = {
        recognitionEngine: 'webspeech'
      };

      settingsManager.save(partialSettings);

      const stored = localStorage.getItem('test-settings');
      const parsed = JSON.parse(stored);
      expect(parsed.recognitionEngine).toBe('webspeech');
      expect(parsed.fontSize).toBe(48); // default value
    });

    it('returns false when localStorage.setItem fails', () => {
      // Mock setItem to throw error (simulating quota exceeded or private browsing)
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = jest.fn(() => {
        throw new Error('QuotaExceededError');
      });

      const result = settingsManager.save({ recognitionEngine: 'vosk' });
      expect(result).toBe(false);

      // Restore
      localStorage.setItem = originalSetItem;
    });
  });

  describe('set', () => {
    it('updates specific key and saves', () => {
      settingsManager.set('recognitionEngine', 'vosk');

      const settings = settingsManager.load();
      expect(settings.recognitionEngine).toBe('vosk');
      expect(settings.fontSize).toBe(48); // other values unchanged
    });

    it('returns true on successful save', () => {
      const result = settingsManager.set('fontSize', 72);
      expect(result).toBe(true);
    });

    it('returns false when save fails', () => {
      // Mock setItem to throw
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = jest.fn(() => {
        throw new Error('QuotaExceededError');
      });

      const result = settingsManager.set('fontSize', 72);
      expect(result).toBe(false);

      // Restore
      localStorage.setItem = originalSetItem;
    });
  });

  describe('get', () => {
    it('retrieves specific key from defaults', () => {
      const value = settingsManager.get('recognitionEngine');
      expect(value).toBe('auto');
    });

    it('retrieves specific key from stored settings', () => {
      settingsManager.save({ recognitionEngine: 'vosk' });

      const value = settingsManager.get('recognitionEngine');
      expect(value).toBe('vosk');
    });

    it('returns default value for unset key', () => {
      const value = settingsManager.get('fontSize');
      expect(value).toBe(48);
    });
  });

  describe('clear', () => {
    it('removes settings from localStorage', () => {
      settingsManager.save({ recognitionEngine: 'vosk' });
      expect(localStorage.getItem('test-settings')).not.toBeNull();

      settingsManager.clear();
      expect(localStorage.getItem('test-settings')).toBeNull();
    });

    it('returns true on successful clear', () => {
      settingsManager.save({ recognitionEngine: 'vosk' });
      const result = settingsManager.clear();
      expect(result).toBe(true);
    });

    it('returns false when removeItem fails', () => {
      // Mock removeItem to throw
      const originalRemoveItem = localStorage.removeItem;
      localStorage.removeItem = jest.fn(() => {
        throw new Error('SecurityError');
      });

      const result = settingsManager.clear();
      expect(result).toBe(false);

      // Restore
      localStorage.removeItem = originalRemoveItem;
    });

    it('load returns defaults after clear', () => {
      settingsManager.save({ recognitionEngine: 'vosk' });
      settingsManager.clear();

      const settings = settingsManager.load();
      expect(settings).toEqual(settingsManager.defaults);
    });
  });

  describe('private browsing mode simulation', () => {
    it('handles complete localStorage failure gracefully', () => {
      // Mock all localStorage methods to throw
      const originalGetItem = localStorage.getItem;
      const originalSetItem = localStorage.setItem;
      const originalRemoveItem = localStorage.removeItem;

      localStorage.getItem = jest.fn(() => {
        throw new Error('SecurityError: Private browsing');
      });
      localStorage.setItem = jest.fn(() => {
        throw new Error('SecurityError: Private browsing');
      });
      localStorage.removeItem = jest.fn(() => {
        throw new Error('SecurityError: Private browsing');
      });

      // All operations should fail gracefully
      const settings = settingsManager.load();
      expect(settings).toEqual(settingsManager.defaults);

      const saveResult = settingsManager.save({ recognitionEngine: 'vosk' });
      expect(saveResult).toBe(false);

      const setValue = settingsManager.set('fontSize', 72);
      expect(setValue).toBe(false);

      const clearResult = settingsManager.clear();
      expect(clearResult).toBe(false);

      // Restore
      localStorage.getItem = originalGetItem;
      localStorage.setItem = originalSetItem;
      localStorage.removeItem = originalRemoveItem;
    });
  });
});
