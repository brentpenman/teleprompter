/**
 * DeviceCapability - Device capability detection and engine recommendation
 *
 * Provides platform detection and recommends appropriate recognition engine:
 * - Platform detection: iOS, Android, mobile, desktop
 * - SharedArrayBuffer availability (required for Vosk)
 * - Device memory detection (Chromium only)
 * - Web Speech API availability
 * - Engine recommendation logic based on platform and capabilities
 *
 * @example
 * const info = DeviceCapability.detect();
 * console.log(info.voskSupported);  // true if Vosk can run
 *
 * const recommendation = DeviceCapability.recommendEngine();
 * console.log(recommendation.engine);  // 'vosk' or 'webspeech'
 * console.log(recommendation.reason);  // Why this engine was recommended
 */

class DeviceCapability {
  /**
   * Detect device capabilities and platform
   * @returns {Object} Detection results with platform, capabilities, and support flags
   */
  static detect() {
    // Platform detection (same logic as SpeechRecognizer.getPlatform())
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    const isMobile = isIOS || isAndroid;
    const isDesktop = !isMobile;

    // SharedArrayBuffer availability (required for Vosk WASM)
    // Check both existence and cross-origin isolation
    const global = typeof self !== 'undefined' ? self : globalThis;
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' &&
                                   (global.crossOriginIsolated === true);

    // Device memory detection (Chromium only: Chrome, Edge)
    // Returns RAM in GB rounded down to nearest power of 2 (0.5, 1, 2, 4, 8...)
    // Safari/Firefox don't support this API, will be null
    const deviceMemory = typeof navigator.deviceMemory !== 'undefined'
      ? navigator.deviceMemory
      : null;

    // Determine device tier based on memory
    let deviceTier = 'unknown';
    if (deviceMemory !== null) {
      if (deviceMemory < 2) {
        deviceTier = 'low';      // <2GB RAM (budget phones, old devices)
      } else if (deviceMemory < 4) {
        deviceTier = 'mid';       // 2-4GB RAM (mid-range devices)
      } else {
        deviceTier = 'high';      // 4GB+ RAM (high-end devices)
      }
    }

    // Web Speech API availability
    const hasWebSpeechAPI = typeof window !== 'undefined' &&
                            !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    return {
      platform: {
        isIOS,
        isAndroid,
        isMobile,
        isDesktop
      },
      capabilities: {
        hasSharedArrayBuffer,
        hasWebSpeechAPI,
        deviceMemory,
        deviceTier
      },
      // Vosk requires SharedArrayBuffer (iOS Safari blocks this even with COOP/COEP headers)
      voskSupported: hasSharedArrayBuffer,
      webSpeechSupported: hasWebSpeechAPI
    };
  }

  /**
   * Recommend recognition engine based on device capabilities
   * @returns {Object} Recommendation with engine, reason, and shouldDownloadModel flag
   */
  static recommendEngine() {
    const { platform, capabilities, voskSupported, webSpeechSupported } = DeviceCapability.detect();

    // iOS: Vosk not supported (SharedArrayBuffer unavailable on iOS Safari)
    if (platform.isIOS) {
      return {
        engine: 'webspeech',
        reason: 'iOS Safari does not support Vosk (SharedArrayBuffer unavailable)',
        shouldDownloadModel: false
      };
    }

    // Android: Prefer Vosk to avoid notification beep (PRIMARY GOAL of v1.2)
    // Web Speech API triggers Android microphone notification beep
    // Vosk offline processing should avoid this
    if (platform.isAndroid && voskSupported) {
      return {
        engine: 'vosk',
        reason: 'Android device with Vosk support - offline recognition avoids notification beep',
        shouldDownloadModel: true
      };
    }

    // Desktop with low memory: Use Web Speech API (avoid large model download)
    if (platform.isDesktop && capabilities.deviceTier === 'low') {
      return {
        engine: 'webspeech',
        reason: 'Low memory device - Web Speech API recommended to avoid large download',
        shouldDownloadModel: false
      };
    }

    // Desktop with Vosk support: Prefer Vosk for offline capability
    if (platform.isDesktop && voskSupported) {
      return {
        engine: 'vosk',
        reason: 'Desktop device with Vosk support - offline recognition recommended',
        shouldDownloadModel: true
      };
    }

    // Fallback: Web Speech API
    // Handles:
    // - Android without SharedArrayBuffer
    // - Desktop without SharedArrayBuffer
    // - Any other edge cases
    return {
      engine: 'webspeech',
      reason: 'Vosk not supported - using Web Speech API',
      shouldDownloadModel: false
    };
  }
}

export default DeviceCapability;
