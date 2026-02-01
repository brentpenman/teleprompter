/**
 * RecognizerFactory - Factory for creating recognition instances with automatic fallback
 *
 * Provides unified interface for creating recognizers based on user preference:
 * - 'auto': Uses DeviceCapability.recommendEngine() to select appropriate engine
 * - 'vosk': Attempts Vosk with Web Speech API fallback on error
 * - 'webspeech': Creates Web Speech API recognizer directly
 *
 * Key features:
 * - Automatic fallback from Vosk to Web Speech API on initialization errors
 * - Model loading with progress callbacks for Vosk
 * - Returns recognizer instance, engine used, and fallback reason (if applicable)
 *
 * @example
 * const { recognizer, engineUsed, fallbackReason } = await RecognizerFactory.create(
 *   'auto',
 *   { onTranscript, onError, onStateChange },
 *   (progress) => console.log(progress)
 * );
 */

import SpeechRecognizer from './SpeechRecognizer.js';
import VoskRecognizer from './VoskRecognizer.js';
import { ModelLoader } from '../src/model/ModelLoader.js';
import { ModelCache } from '../src/model/ModelCache.js';
import { ModelDownloader } from '../src/model/ModelDownloader.js';
import { ModelValidator } from '../src/model/ModelValidator.js';
import { modelConfig } from '../src/config/modelConfig.js';
import DeviceCapability from '../settings/DeviceCapability.js';

class RecognizerFactory {
  /**
   * Create recognizer instance based on user preference with automatic fallback
   *
   * @param {string} preferredEngine - 'auto', 'vosk', or 'webspeech'
   * @param {Object} callbacks - Recognition callbacks
   *   @param {Function} callbacks.onTranscript - Transcript callback (text, isFinal)
   *   @param {Function} callbacks.onError - Error callback (errorType, isFatal)
   *   @param {Function} callbacks.onStateChange - State callback (state)
   * @param {Function} onModelProgress - Progress callback for Vosk model loading (optional)
   *   Receives: { status, loaded, total, percentage }
   * @returns {Promise<Object>} - { recognizer, engineUsed, fallbackReason }
   * @throws {Error} - If neither Vosk nor Web Speech API is available
   */
  static async create(preferredEngine, callbacks, onModelProgress) {
    // Validate inputs
    if (!preferredEngine || !['auto', 'vosk', 'webspeech'].includes(preferredEngine)) {
      throw new Error('preferredEngine must be "auto", "vosk", or "webspeech"');
    }

    if (!callbacks || typeof callbacks.onTranscript !== 'function') {
      throw new Error('callbacks.onTranscript is required');
    }

    // Determine target engine
    let targetEngine = preferredEngine;
    if (preferredEngine === 'auto') {
      const recommendation = DeviceCapability.recommendEngine();
      targetEngine = recommendation.engine;
    }

    // Attempt to create target engine
    if (targetEngine === 'vosk') {
      // Check Vosk support before attempting
      if (!VoskRecognizer.isSupported()) {
        console.warn('Vosk not supported (SharedArrayBuffer unavailable), falling back to Web Speech API');
        return RecognizerFactory._createWebSpeech(callbacks, 'Vosk not supported (SharedArrayBuffer unavailable)');
      }

      try {
        // Create Vosk recognizer
        const recognizer = new VoskRecognizer(callbacks);

        // Create ModelLoader with dependencies
        const cache = new ModelCache();
        await cache.open(); // Initialize IndexedDB connection

        const loader = new ModelLoader(
          cache,
          new ModelDownloader(),
          new ModelValidator()
        );

        // Load model with progress tracking
        const modelArrayBuffer = await loader.loadModel(modelConfig, onModelProgress || (() => {}));

        // Initialize Vosk with model
        await recognizer.loadModel(modelArrayBuffer);

        return {
          recognizer,
          engineUsed: 'vosk',
          fallbackReason: null
        };
      } catch (error) {
        // Vosk initialization failed, fall back to Web Speech API
        console.error('Vosk initialization failed:', error);
        console.warn('Falling back to Web Speech API');
        return RecognizerFactory._createWebSpeech(callbacks, `Vosk failed: ${error.message}`);
      }
    }

    // Web Speech API requested or fallback
    return RecognizerFactory._createWebSpeech(callbacks, null);
  }

  /**
   * Create Web Speech API recognizer (private helper)
   *
   * @param {Object} callbacks - Recognition callbacks
   * @param {string|null} fallbackReason - Reason for fallback (null if intentional)
   * @returns {Object} - { recognizer, engineUsed, fallbackReason }
   * @throws {Error} - If Web Speech API not supported
   * @private
   */
  static _createWebSpeech(callbacks, fallbackReason) {
    if (!SpeechRecognizer.isSupported()) {
      throw new Error('Neither Vosk nor Web Speech API is supported in this browser');
    }

    const recognizer = new SpeechRecognizer(callbacks);
    return {
      recognizer,
      engineUsed: 'webspeech',
      fallbackReason
    };
  }
}

export default RecognizerFactory;
