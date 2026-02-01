/**
 * SettingsManager - localStorage wrapper for settings persistence
 *
 * Provides persistent storage for user preferences with:
 * - Safe localStorage access (try-catch for private browsing)
 * - Default values for all settings
 * - Schema migration support (merges defaults with stored settings)
 * - Individual key get/set/clear methods
 *
 * @example
 * const settings = new SettingsManager();
 * const prefs = settings.load();
 * settings.set('recognitionEngine', 'vosk');
 * const engine = settings.get('recognitionEngine');
 */

class SettingsManager {
  /**
   * Create a SettingsManager instance
   * @param {string} [storageKey='teleprompter-settings'] - localStorage key
   */
  constructor(storageKey = 'teleprompter-settings') {
    this.storageKey = storageKey;

    // Default settings with reasonable values
    this.defaults = {
      recognitionEngine: 'auto',  // 'auto' | 'vosk' | 'webspeech'
      fontSize: 48,
      scrollSpeed: 50,
      highlightEnabled: false,
      mirrorEnabled: false
    };
  }

  /**
   * Load settings from localStorage with fallback to defaults
   * Merges stored settings with defaults to handle schema changes
   * @returns {Object} Settings object with all keys
   */
  load() {
    try {
      const stored = localStorage.getItem(this.storageKey);

      // No stored settings, return defaults
      if (!stored) {
        return { ...this.defaults };
      }

      // Parse and merge with defaults (handles new settings added in updates)
      const parsed = JSON.parse(stored);
      return { ...this.defaults, ...parsed };
    } catch (error) {
      // Private browsing mode (SecurityError) or localStorage disabled
      // QuotaExceededError (unlikely for getItem)
      // JSON parse error (corrupted data)
      console.warn('Failed to load settings from localStorage:', error);
      return { ...this.defaults };
    }
  }

  /**
   * Save settings to localStorage
   * @param {Object} settings - Settings object to persist
   * @returns {boolean} True if saved successfully, false otherwise
   */
  save(settings) {
    try {
      // Merge with defaults to ensure all keys present
      const merged = { ...this.defaults, ...settings };
      localStorage.setItem(this.storageKey, JSON.stringify(merged));
      return true;
    } catch (error) {
      // QuotaExceededError (unlikely for small settings object)
      // SecurityError in private browsing mode
      console.error('Failed to save settings to localStorage:', error);
      return false;
    }
  }

  /**
   * Update a specific setting key
   * Loads current settings, updates key, and saves
   * @param {string} key - Setting key to update
   * @param {*} value - New value for the setting
   * @returns {boolean} True if saved successfully, false otherwise
   */
  set(key, value) {
    const settings = this.load();
    settings[key] = value;
    return this.save(settings);
  }

  /**
   * Get a specific setting value
   * @param {string} key - Setting key to retrieve
   * @returns {*} Value of the setting, or default if not set
   */
  get(key) {
    const settings = this.load();
    return settings[key];
  }

  /**
   * Clear all settings (reset to defaults)
   * @returns {boolean} True if cleared successfully, false otherwise
   */
  clear() {
    try {
      localStorage.removeItem(this.storageKey);
      return true;
    } catch (error) {
      console.error('Failed to clear settings:', error);
      return false;
    }
  }
}

export default SettingsManager;
