/**
 * VoskRecognizer - Vosk offline speech recognition adapter
 *
 * Implements identical interface to SpeechRecognizer, enabling drop-in replacement
 * of Web Speech API with Vosk offline recognition.
 *
 * Key differences from SpeechRecognizer:
 * - Requires model to be loaded via loadModel() before start()
 * - No auto-restart logic (Vosk runs continuously)
 * - No retry/backoff (offline, no network errors)
 * - Requires cross-origin isolation (SharedArrayBuffer for WASM)
 * - Supports getAudioContext() for AudioVisualizer integration
 *
 * @example
 * if (!VoskRecognizer.isSupported()) {
 *   console.log('Vosk not supported (requires SharedArrayBuffer)');
 *   return;
 * }
 *
 * const recognizer = new VoskRecognizer({
 *   onTranscript: (text, isFinal) => console.log(text, isFinal),
 *   onError: (errorType, isFatal) => console.error(errorType, isFatal),
 *   onStateChange: (state) => console.log('State:', state)
 * });
 *
 * // Load model (from ModelLoader)
 * await recognizer.loadModel(modelArrayBuffer);
 *
 * // Start recognition
 * await recognizer.start();
 *
 * // ... later
 * await recognizer.stop();
 */

// vosk-browser is loaded as a global UMD bundle (see index.html)
// Access via window.Vosk
const Vosk = window.Vosk;

/**
 * VoskRecognizer class with interface matching SpeechRecognizer
 *
 * @example
 * if (!VoskRecognizer.isSupported()) {
 *   console.log('Vosk not supported (SharedArrayBuffer unavailable)');
 *   return;
 * }
 *
 * const recognizer = new VoskRecognizer({
 *   lang: 'en-US',
 *   onTranscript: (text, isFinal) => console.log(text, isFinal),
 *   onError: (errorType, isFatal) => console.error(errorType, isFatal),
 *   onStateChange: (state) => console.log('State:', state)
 * });
 *
 * // Load model first (from Phase 9 ModelLoader)
 * await recognizer.loadModel(modelArrayBuffer);
 *
 * // Start recognition
 * await recognizer.start();
 *
 * // ... later
 * await recognizer.stop();
 */

class VoskRecognizer {
  /**
   * Check if browser supports Vosk recognition
   * Vosk requires SharedArrayBuffer and cross-origin isolation (COOP/COEP headers)
   * @returns {boolean} True if supported (headers set in Phase 9)
   */
  static isSupported() {
    // Check SharedArrayBuffer availability and cross-origin isolation
    // Use globalThis for Node/browser compatibility
    const global = typeof self !== 'undefined' ? self : globalThis;
    return typeof SharedArrayBuffer !== 'undefined' && (global.crossOriginIsolated === true);
  }

  /**
   * Get platform detection info
   * Same implementation as SpeechRecognizer for consistency
   * @returns {{ isIOS: boolean, isAndroid: boolean, isMobile: boolean }}
   */
  static getPlatform() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid;
    return { isIOS, isAndroid, isMobile };
  }

  /**
   * Create a VoskRecognizer instance
   * @param {Object} options - Configuration options
   * @param {string} [options.lang='en-US'] - Recognition language (for compatibility, not used by Vosk)
   * @param {Function} [options.onTranscript] - Callback for transcripts (text, isFinal)
   * @param {Function} [options.onError] - Callback for errors (errorType, isFatal)
   * @param {Function} [options.onStateChange] - Callback for state changes (state: 'idle' | 'listening' | 'error')
   */
  constructor(options = {}) {
    // Store options
    this._options = options;

    // Internal state tracking
    this._shouldBeListening = false;
    this._isPaused = false;

    // Vosk resources
    this._model = null;
    this._recognizer = null;

    // Audio pipeline resources
    this._audioContext = null;
    this._source = null;
    this._processor = null;
    this._stream = null;

    // Vosk requirement: 16kHz sample rate
    this._sampleRate = 16000;
  }

  /**
   * Load Vosk model from ArrayBuffer
   * Must be called before start(). Model creation spawns Web Worker (~1-2s).
   * @param {ArrayBuffer} modelArrayBuffer - Vosk model binary data
   * @returns {Promise<void>}
   * @throws {Error} If model creation fails
   */
  async loadModel(modelArrayBuffer) {
    // vosk-browser expects a URL, not an ArrayBuffer
    // Convert ArrayBuffer to Blob URL that vosk-browser can fetch
    const blob = new Blob([modelArrayBuffer], { type: 'application/zip' });
    const blobUrl = URL.createObjectURL(blob);

    try {
      // Create Vosk model (spawns Web Worker, downloads from blob URL)
      this._model = await Vosk.createModel(blobUrl);
    } finally {
      // Clean up blob URL after model loaded
      URL.revokeObjectURL(blobUrl);
    }
  }

  /**
   * Start speech recognition
   * Triggers browser's mic permission prompt if not already granted.
   * @returns {Promise<void>}
   * @throws {Error} If model not loaded (call loadModel() first)
   * @throws {DOMException} If microphone permission denied (NotAllowedError)
   */
  async start() {
    // Check model loaded
    if (!this._model) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    // Already listening
    if (this._shouldBeListening) {
      return;
    }

    this._shouldBeListening = true;

    try {
      // 1. Request microphone access
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this._sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // 2. Create AudioContext with matching sample rate
      this._audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this._sampleRate
      });

      // 3. Create KaldiRecognizer
      this._recognizer = new this._model.KaldiRecognizer(this._sampleRate);

      // 4. Set up event listeners for transcription
      this._recognizer.on('result', (message) => {
        const text = message.result.text;
        console.log('[Vosk] Final result:', text);
        if (text && text.trim()) {
          this._options.onTranscript?.(text, true); // isFinal = true
        }
      });

      this._recognizer.on('partialresult', (message) => {
        const text = message.result.partial;
        console.log('[Vosk] Partial result:', text);
        if (text && text.trim()) {
          this._options.onTranscript?.(text, false); // isFinal = false
        }
      });

      // 5. Set up audio processing pipeline
      this._source = this._audioContext.createMediaStreamSource(this._stream);

      // ScriptProcessor for audio processing (deprecated but required by vosk-browser)
      // Note: ScriptProcessor is deprecated but still functional
      // vosk-browser doesn't support AudioWorklet yet (migration planned for v2)
      // Buffer size 4096 provides good balance for <500ms latency
      this._processor = this._audioContext.createScriptProcessor(4096, 1, 1);

      this._processor.onaudioprocess = (event) => {
        try {
          this._recognizer.acceptWaveform(event.inputBuffer);
        } catch (err) {
          console.error('Vosk processing error:', err);
          this._options.onError?.('audio-processing', false);
        }
      };

      // Connect pipeline: microphone -> processor -> (vosk in worker)
      // Do NOT connect to destination (avoid audio feedback)
      this._source.connect(this._processor);

      // Notify state change
      this._options.onStateChange?.('listening');

    } catch (err) {
      this._shouldBeListening = false;
      const isFatal = err.name === 'NotAllowedError';
      this._options.onError?.(err.name, isFatal);
      if (isFatal) {
        this._options.onStateChange?.('error');
      }
      throw err;
    }
  }

  /**
   * Stop speech recognition
   * Cleanly terminates all resources and frees WASM memory
   * @returns {Promise<void>}
   */
  async stop() {
    this._shouldBeListening = false;

    // Stop audio processing
    if (this._processor) {
      this._processor.disconnect();
      this._processor.onaudioprocess = null;
      this._processor = null;
    }

    if (this._source) {
      this._source.disconnect();
      this._source = null;
    }

    // Release microphone
    if (this._stream) {
      this._stream.getTracks().forEach(track => track.stop());
      this._stream = null;
    }

    // Close AudioContext
    if (this._audioContext && this._audioContext.state !== 'closed') {
      await this._audioContext.close();
      this._audioContext = null;
    }

    // Free WASM resources (CRITICAL for preventing memory leaks)
    if (this._recognizer) {
      this._recognizer.remove();
      this._recognizer = null;
    }

    // Notify state change
    this._options.onStateChange?.('idle');
  }

  /**
   * Pause recognition (e.g., when page is hidden)
   * Preserves the intent to listen so resume() can restart
   * @returns {void}
   */
  pause() {
    if (!this._shouldBeListening) return;

    this._isPaused = true;

    // Disconnect processor but keep everything else ready
    if (this._processor && this._source) {
      this._source.disconnect(this._processor);
    }

    this._options.onStateChange?.('idle');
  }

  /**
   * Resume recognition after a pause (e.g., when page becomes visible again)
   * @returns {void}
   */
  resume() {
    if (!this._isPaused) return;

    this._isPaused = false;

    // Reconnect processor
    if (this._processor && this._source) {
      this._source.connect(this._processor);
    }

    this._options.onStateChange?.('listening');
  }

  /**
   * Check if currently listening
   * @returns {boolean} True if recognition is active (not paused)
   */
  isListening() {
    return this._shouldBeListening && !this._isPaused;
  }

  /**
   * Check if recognition is paused (page hidden)
   * @returns {boolean} True if paused via visibility change
   */
  isPaused() {
    return this._isPaused;
  }

  /**
   * Get the AudioContext for audio visualization
   * @returns {AudioContext|null} The AudioContext if listening, null otherwise
   */
  getAudioContext() {
    return this._audioContext;
  }

  /**
   * Get the MediaStreamSource for audio visualization
   * @returns {MediaStreamAudioSourceNode|null} The source if listening, null otherwise
   */
  getMediaStreamSource() {
    return this._source;
  }
}

export default VoskRecognizer;
