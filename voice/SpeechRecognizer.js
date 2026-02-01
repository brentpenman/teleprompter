/**
 * SpeechRecognizer - Web Speech API wrapper with auto-restart and error handling
 *
 * Provides continuous speech recognition with:
 * - Auto-restart on session timeout (Chrome 60s) or silence (7s)
 * - Categorized error handling (recoverable vs fatal)
 * - Exponential backoff retry for recoverable errors
 * - Clean callback interface for transcripts, errors, and state changes
 */

// Browser support check at module load time
// Handle Node environment (for tests)
const global = typeof window !== 'undefined' ? window : {};
const SpeechRecognitionAPI = global.SpeechRecognition || global.webkitSpeechRecognition;

// Mobile platform detection
const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isIOS = /iPad|iPhone|iPod/.test(userAgent);
const isAndroid = /Android/.test(userAgent);
const isMobile = isIOS || isAndroid;

/**
 * SpeechRecognizer class with static isSupported method
 *
 * @example
 * if (!SpeechRecognizer.isSupported()) {
 *   console.log('Browser not supported');
 *   return;
 * }
 *
 * const recognizer = new SpeechRecognizer({
 *   lang: 'en-US',
 *   onTranscript: (text, isFinal) => console.log(text, isFinal),
 *   onError: (errorType, isFatal) => console.error(errorType, isFatal),
 *   onStateChange: (state) => console.log('State:', state)
 * });
 *
 * recognizer.start();
 * // ... later
 * recognizer.stop();
 */

// Error categorization (from RESEARCH.md)
const RECOVERABLE_ERRORS = ['network', 'no-speech', 'aborted'];
const FATAL_ERRORS = ['not-allowed', 'service-not-allowed', 'language-not-supported'];

class SpeechRecognizer {
  /**
   * Check if browser supports speech recognition
   * @returns {boolean} True if supported (Chrome, Safari), false otherwise (Firefox)
   */
  static isSupported() {
    return !!SpeechRecognitionAPI;
  }

  /**
   * Get platform detection info
   * @returns {{ isIOS: boolean, isAndroid: boolean, isMobile: boolean }}
   */
  static getPlatform() {
    return { isIOS, isAndroid, isMobile };
  }
  /**
   * Create a SpeechRecognizer instance
   * @param {Object} options - Configuration options
   * @param {string} [options.lang='en-US'] - Recognition language
   * @param {Function} [options.onTranscript] - Callback for transcripts (text, isFinal)
   * @param {Function} [options.onError] - Callback for errors (errorType, isFatal)
   * @param {Function} [options.onStateChange] - Callback for state changes (state)
   */
  constructor(options = {}) {
    if (!SpeechRecognizer.isSupported()) {
      throw new Error('SpeechRecognition not supported in this browser');
    }

    this._options = options;
    this._recognition = new SpeechRecognitionAPI();

    // Platform flags
    this._isIOS = isIOS;
    this._isAndroid = isAndroid;
    this._isMobile = isMobile;

    // Configure recognition
    // iOS Safari: continuous mode is unreliable — we simulate it by restarting after each result
    this._recognition.continuous = !this._isIOS;
    this._recognition.interimResults = true;
    this._recognition.lang = options.lang || 'en-US';
    this._recognition.maxAlternatives = 1;

    // Internal state tracking
    this._shouldBeListening = false;
    this._retryCount = 0;
    this._retryTimeout = null;
    this._safetyTimeout = null;
    this._lastOnerrorTime = 0;
    this._isPaused = false; // For visibility change handling

    // Bind event handlers
    this._setupEventHandlers();
  }

  /**
   * Set up recognition event handlers
   * @private
   */
  _setupEventHandlers() {
    this._recognition.onstart = () => {
      // Reset retry counter on successful start
      this._retryCount = 0;
      this._clearSafetyTimeout();
      this._options.onStateChange?.('listening');
    };

    this._recognition.onend = () => {
      if (this._shouldBeListening) {
        // Session ended but we want to keep listening
        // This handles Chrome's 60-second timeout and 7-second silence detection
        this._scheduleRestart();
      } else {
        this._options.onStateChange?.('idle');
      }
    };

    this._recognition.onerror = (event) => {
      const errorType = event.error;
      this._lastOnerrorTime = Date.now();

      if (FATAL_ERRORS.includes(errorType)) {
        // Fatal error - stop and notify
        this._shouldBeListening = false;
        this._clearTimeouts();
        this._options.onStateChange?.('error');
        this._options.onError?.(errorType, true);
      } else if (RECOVERABLE_ERRORS.includes(errorType)) {
        // Recoverable error - notify but let onend handle restart
        this._options.onStateChange?.('retrying');
        this._options.onError?.(errorType, false);

        // Safety timeout: if onend doesn't fire within 1 second, trigger restart manually
        // This handles rare edge cases where onerror fires but onend doesn't
        this._clearSafetyTimeout();
        this._safetyTimeout = setTimeout(() => {
          if (this._shouldBeListening && Date.now() - this._lastOnerrorTime >= 900) {
            console.warn('Safety timeout: onend did not fire after onerror, forcing restart');
            this._scheduleRestart();
          }
        }, 1000);
      } else {
        // Unknown error - treat as recoverable
        console.warn('Unknown recognition error:', errorType);
        this._options.onStateChange?.('retrying');
        this._options.onError?.(errorType, false);
      }
    };

    this._recognition.onresult = (event) => {
      // Get the latest result
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;

      this._options.onTranscript?.(transcript, isFinal);

      // iOS: simulate continuous mode by restarting after each final result
      // Since continuous=false on iOS, recognition stops after each utterance
      if (this._isIOS && isFinal && this._shouldBeListening) {
        this._scheduleRestart();
      }
    };
  }

  /**
   * Schedule a restart with exponential backoff
   * @private
   */
  _scheduleRestart() {
    // Calculate delay with exponential backoff
    // Desktop: 100ms, 200ms, 400ms, ... capped at 5000ms
    // iOS: 500ms minimum to avoid Safari rate-limiting rapid SpeechRecognition restarts
    const minDelay = this._isIOS ? 500 : 100;
    const delay = Math.min(minDelay * Math.pow(2, this._retryCount), 5000);
    this._retryCount++;

    this._clearRetryTimeout();
    this._retryTimeout = setTimeout(() => {
      if (this._shouldBeListening) {
        try {
          this._recognition.start();
        } catch (e) {
          // Handle "already started" edge case
          console.warn('Recognition start failed:', e.message);
          // Try again after a longer delay
          if (this._shouldBeListening) {
            this._scheduleRestart();
          }
        }
      }
    }, delay);
  }

  /**
   * Clear retry timeout
   * @private
   */
  _clearRetryTimeout() {
    if (this._retryTimeout) {
      clearTimeout(this._retryTimeout);
      this._retryTimeout = null;
    }
  }

  /**
   * Clear safety timeout
   * @private
   */
  _clearSafetyTimeout() {
    if (this._safetyTimeout) {
      clearTimeout(this._safetyTimeout);
      this._safetyTimeout = null;
    }
  }

  /**
   * Clear all timeouts
   * @private
   */
  _clearTimeouts() {
    this._clearRetryTimeout();
    this._clearSafetyTimeout();
  }

  /**
   * Start speech recognition
   * Note: This may trigger browser's mic permission prompt if not already granted
   */
  start() {
    if (this._shouldBeListening) {
      return; // Already listening
    }

    this._shouldBeListening = true;
    this._retryCount = 0;

    try {
      this._recognition.start();
    } catch (e) {
      // Handle edge case where recognition is already started
      console.warn('Recognition start failed:', e.message);
      this._scheduleRestart();
    }
  }

  /**
   * Stop speech recognition
   * Cleanly terminates all pending retries and stops recognition
   */
  stop() {
    this._shouldBeListening = false;
    this._clearTimeouts();

    try {
      this._recognition.stop();
    } catch (e) {
      // Ignore errors from stopping when not started
      console.warn('Recognition stop failed:', e.message);
    }

    this._options.onStateChange?.('idle');
  }

  /**
   * Pause recognition (e.g., when page is hidden)
   * Preserves the intent to listen so resume() can restart
   */
  pause() {
    if (!this._shouldBeListening) return;

    this._isPaused = true;
    this._clearTimeouts();

    try {
      this._recognition.stop();
    } catch (e) {
      // Ignore errors from stopping when not started
    }

    this._options.onStateChange?.('idle');
  }

  /**
   * Resume recognition after a pause (e.g., when page becomes visible again)
   */
  resume() {
    if (!this._isPaused) return;

    this._isPaused = false;
    this._retryCount = 0;

    try {
      this._recognition.start();
    } catch (e) {
      console.warn('Recognition resume failed:', e.message);
      this._scheduleRestart();
    }
  }

  /**
   * Check if currently listening
   * @returns {boolean} True if recognition is active or retrying
   */
  isListening() {
    return this._shouldBeListening;
  }

  /**
   * Check if recognition is paused (page hidden)
   * @returns {boolean} True if paused via visibility change
   */
  isPaused() {
    return this._isPaused;
  }
}

export default SpeechRecognizer;
