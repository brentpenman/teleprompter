# Phase 11: Engine Selection & Polish - Research

**Researched:** 2026-02-01
**Domain:** Settings UI design, engine selection patterns, device capability detection, graceful degradation, cross-platform validation
**Confidence:** MEDIUM-HIGH

## Summary

Phase 11 integrates the Vosk offline recognition engine (Phase 10) with the existing Web Speech API recognizer (Phase 1) through an engine selection UI that gives users control while providing intelligent fallback when Vosk is unavailable. The primary goal is enabling voice mode on Android Chrome without notification beeps—achieved by using Vosk's offline processing instead of Web Speech API's cloud-based recognition which triggers Android's microphone notification.

The standard approach combines localStorage for settings persistence, device capability detection (navigator.deviceMemory, SharedArrayBuffer availability, platform detection) to recommend appropriate engines, skeleton screens for loading states, and graceful degradation when Vosk fails. The existing VoskRecognizer and SpeechRecognizer classes share identical interfaces, making engine switching straightforward. The ModelLoader from Phase 9 provides download infrastructure, and validation requires real device testing on Android Chrome (primary goal), iOS Safari, and desktop browsers.

**Key challenges identified:**
- Android beep elimination unverified—Vosk's offline processing should avoid notification, but requires real device testing
- iOS Safari doesn't support SharedArrayBuffer even with COOP/COEP headers, so Vosk unavailable (Web Speech API fallback required)
- Device capability detection limited—navigator.deviceMemory only available in Chromium browsers, not Safari
- Cross-platform testing requires real devices or cloud services (BrowserStack)—Playwright emulation insufficient for microphone permission testing

**Primary recommendation:** Build settings panel with engine selector (toggle or radio buttons), persist preference in localStorage with try-catch for private browsing, detect device capability using SharedArrayBuffer + platform detection to recommend engines, show loading states during model download/initialization, implement automatic fallback to Web Speech API when Vosk unavailable, and validate on real Android/iOS devices using BrowserStack or physical devices. The Android beep test is critical—this validates the entire v1.2 milestone value proposition.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| localStorage API | Native | Settings persistence | Browser-native, simple key-value storage, 5MB quota sufficient |
| Device Memory API | Native | Capability detection | Browser-native, provides RAM estimate for device tier detection |
| SharedArrayBuffer | Native | Vosk capability check | Required by Vosk WASM, availability indicates Vosk support |
| Platform detection | Native | OS/browser detection | navigator.userAgent for iOS/Android/mobile detection |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| BrowserStack | Cloud | Real device testing | Android/iOS validation, microphone permission testing |
| Playwright | 1.x | Local emulation testing | Desktop browser testing, initial validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| localStorage | sessionStorage | Data cleared when session ends, settings don't persist |
| localStorage | IndexedDB | Overcomplicated for simple key-value settings (save IndexedDB for model cache) |
| BrowserStack | Physical devices | More authentic but harder to scale, requires device collection |
| Platform detection | navigator.userAgentData | Newer API, better privacy, but limited Safari support |

**Installation:**
```bash
# No additional dependencies for core functionality
# Native browser APIs only

# For cross-platform testing (dev/CI only)
npm install --save-dev @playwright/test
# BrowserStack: cloud service, no npm package
```

**Recommendation:** Use native localStorage API with JSON serialization, detect capabilities with multiple signals (SharedArrayBuffer, platform, deviceMemory), and validate on real devices via BrowserStack for critical Android beep test.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── voice/
│   ├── SpeechRecognizer.js       # Existing Web Speech API wrapper
│   ├── VoskRecognizer.js         # Phase 10: Vosk adapter
│   ├── recognizerFactory.js      # NEW: Factory to create recognizer based on settings
│   └── AudioVisualizer.js        # Existing (works with both engines)
├── model/
│   ├── ModelLoader.js            # Phase 9: model download/cache orchestration
│   └── ...                       # Other Phase 9 components
├── ui/
│   ├── SettingsPanel.js          # NEW: Engine selection UI
│   └── LoadingStates.js          # NEW: Download progress, loading indicators
├── settings/
│   └── SettingsManager.js        # NEW: localStorage wrapper for preferences
└── script.js                      # Main app (integrate engine selection)
```

### Pattern 1: Settings Persistence with localStorage
**What:** Store user preferences (engine selection, UI settings) in localStorage with error handling
**When to use:** Any user preference that should persist across sessions
**Example:**
```javascript
// Source: MDN localStorage + best practices from WebSearch 2026
class SettingsManager {
  constructor(storageKey = 'teleprompter-settings') {
    this.storageKey = storageKey;
    this.defaults = {
      recognitionEngine: 'auto',  // 'auto' | 'vosk' | 'webspeech'
      fontSize: 48,
      scrollSpeed: 50,
      highlightEnabled: true,
      mirrorEnabled: false
    };
  }

  // Load settings from localStorage with fallback to defaults
  load() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return { ...this.defaults };

      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings added in updates
      return { ...this.defaults, ...parsed };
    } catch (error) {
      // Private browsing mode or localStorage disabled
      console.warn('Failed to load settings from localStorage:', error);
      return { ...this.defaults };
    }
  }

  // Save settings to localStorage with error handling
  save(settings) {
    try {
      const merged = { ...this.defaults, ...settings };
      localStorage.setItem(this.storageKey, JSON.stringify(merged));
      return true;
    } catch (error) {
      // QuotaExceededError or SecurityError in private browsing
      console.error('Failed to save settings to localStorage:', error);
      return false;
    }
  }

  // Update specific setting
  set(key, value) {
    const settings = this.load();
    settings[key] = value;
    return this.save(settings);
  }

  // Get specific setting
  get(key) {
    const settings = this.load();
    return settings[key];
  }

  // Clear all settings (reset to defaults)
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
```

**Best practices:**
- Always wrap localStorage access in try-catch (fails in private browsing)
- Serialize complex objects with JSON.stringify/parse
- Merge with defaults to handle schema changes
- Use single storage key for all settings (reduces localStorage entries)
- Keep settings small (<5MB total quota)

### Pattern 2: Device Capability Detection for Engine Recommendation
**What:** Detect device capabilities to recommend appropriate recognition engine
**When to use:** During app initialization, engine selection UI
**Example:**
```javascript
// Source: MDN Device Memory API + SharedArrayBuffer detection + platform detection
class DeviceCapability {
  static detect() {
    // Platform detection (iOS/Android/Desktop)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    const isMobile = isIOS || isAndroid;

    // SharedArrayBuffer availability (required for Vosk)
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' &&
                                   (typeof self !== 'undefined' ? self.crossOriginIsolated === true : false);

    // Device memory (RAM detection, Chromium only)
    // Returns gigabytes rounded down to nearest power of 2 (0.5, 1, 2, 4, 8, etc.)
    const deviceMemory = navigator.deviceMemory || null;

    // Determine device tier based on memory (if available)
    let deviceTier = 'unknown';
    if (deviceMemory !== null) {
      if (deviceMemory < 2) deviceTier = 'low';      // <2GB RAM
      else if (deviceMemory < 4) deviceTier = 'mid'; // 2-4GB RAM
      else deviceTier = 'high';                      // 4GB+ RAM
    }

    // Web Speech API availability
    const hasWebSpeechAPI = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    return {
      platform: {
        isIOS,
        isAndroid,
        isMobile,
        isDesktop: !isMobile
      },
      capabilities: {
        hasSharedArrayBuffer,
        hasWebSpeechAPI,
        deviceMemory,
        deviceTier
      },
      // Vosk requires SharedArrayBuffer (not available on iOS Safari even with headers)
      voskSupported: hasSharedArrayBuffer,
      webSpeechSupported: hasWebSpeechAPI
    };
  }

  static recommendEngine() {
    const { platform, capabilities, voskSupported, webSpeechSupported } = DeviceCapability.detect();

    // iOS: Vosk not supported (no SharedArrayBuffer), use Web Speech API
    if (platform.isIOS) {
      return {
        engine: 'webspeech',
        reason: 'iOS Safari does not support Vosk (SharedArrayBuffer unavailable)',
        shouldDownloadModel: false
      };
    }

    // Android: Prefer Vosk to avoid notification beep (primary goal)
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
    return {
      engine: 'webspeech',
      reason: 'Vosk not supported - using Web Speech API',
      shouldDownloadModel: false
    };
  }
}

export default DeviceCapability;
```

**Important:** iOS Safari blocks SharedArrayBuffer even with COOP/COEP headers, so Vosk will never work on iOS. Always fall back to Web Speech API.

### Pattern 3: Recognizer Factory with Fallback
**What:** Factory pattern to create appropriate recognizer instance with automatic fallback
**When to use:** When initializing voice mode
**Example:**
```javascript
// Source: Factory pattern + graceful degradation best practices
import SpeechRecognizer from './SpeechRecognizer.js';
import VoskRecognizer from './VoskRecognizer.js';
import { ModelLoader } from '../model/ModelLoader.js';
import { modelConfig } from '../config/modelConfig.js';
import DeviceCapability from '../settings/DeviceCapability.js';

class RecognizerFactory {
  /**
   * Create recognizer instance based on user preference with automatic fallback
   * @param {string} preferredEngine - 'auto', 'vosk', or 'webspeech'
   * @param {Object} callbacks - { onTranscript, onError, onStateChange }
   * @param {Function} onModelProgress - Progress callback for Vosk model loading
   * @returns {Promise<{recognizer, engineUsed, fallbackReason?}>}
   */
  static async create(preferredEngine, callbacks, onModelProgress) {
    const { voskSupported, webSpeechSupported } = DeviceCapability.detect();

    // Determine target engine
    let targetEngine = preferredEngine;
    if (preferredEngine === 'auto') {
      const recommendation = DeviceCapability.recommendEngine();
      targetEngine = recommendation.engine;
    }

    // Try to create preferred/recommended engine
    if (targetEngine === 'vosk') {
      // Check Vosk support before attempting
      if (!voskSupported) {
        console.warn('Vosk not supported (SharedArrayBuffer unavailable), falling back to Web Speech API');
        return RecognizerFactory._createWebSpeech(callbacks, 'Vosk not supported');
      }

      try {
        // Create Vosk recognizer
        const recognizer = new VoskRecognizer(callbacks);

        // Load model (from Phase 9 ModelLoader)
        const loader = new ModelLoader(cache, downloader, validator);
        const modelArrayBuffer = await loader.loadModel(modelConfig, onModelProgress);

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

    // Web Speech API requested or Vosk not available
    return RecognizerFactory._createWebSpeech(callbacks, null);
  }

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
```

**Fallback chain:**
1. User selects Vosk → Try Vosk → If fails, fall back to Web Speech API
2. User selects Web Speech API → Use Web Speech API (no fallback needed)
3. User selects Auto → Detect device → Recommend engine → Follow fallback chain

### Pattern 4: Loading States UI (Skeleton Screens)
**What:** Show clear loading states during model download and initialization
**When to use:** Any async operation >1 second that blocks user interaction
**Example:**
```javascript
// Source: UX patterns from NN/G skeleton screens + Carbon Design System loading patterns
class LoadingStates {
  // Show skeleton screen during model download
  static showDownloadProgress(container, progress) {
    const { status, percentage, loaded, total } = progress;

    let statusText = '';
    switch (status) {
      case 'checking-quota':
        statusText = 'Checking storage space...';
        break;
      case 'downloading':
        const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
        const totalMB = (total / (1024 * 1024)).toFixed(1);
        statusText = `Downloading model: ${loadedMB}MB / ${totalMB}MB (${percentage}%)`;
        break;
      case 'validating':
        statusText = 'Validating model integrity...';
        break;
      case 'caching':
        statusText = 'Caching model for offline use...';
        break;
      case 'complete':
        statusText = 'Model ready!';
        break;
      default:
        statusText = 'Loading...';
    }

    container.innerHTML = `
      <div class="loading-state">
        <div class="skeleton-loader"></div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${percentage || 0}%"></div>
        </div>
        <p class="status-text">${statusText}</p>
      </div>
    `;
  }

  // Show simple spinner for quick operations (<10s)
  static showSpinner(container, message = 'Initializing...') {
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p class="status-text">${message}</p>
      </div>
    `;
  }

  // Show engine status indicator (in teleprompter view)
  static showEngineIndicator(engineUsed, modelCached, cacheSize, lastUpdated) {
    const indicator = document.getElementById('engine-indicator');
    if (!indicator) return;

    let statusHTML = '';
    if (engineUsed === 'vosk') {
      const cacheMB = (cacheSize / (1024 * 1024)).toFixed(1);
      const dateStr = lastUpdated ? new Date(lastUpdated).toLocaleDateString() : 'N/A';
      statusHTML = `
        <span class="engine-badge vosk">Vosk (Offline)</span>
        <span class="model-status">
          ${modelCached ? `Model cached: ${cacheMB}MB (${dateStr})` : 'Model not cached'}
        </span>
      `;
    } else {
      statusHTML = `<span class="engine-badge webspeech">Web Speech API (Online)</span>`;
    }

    indicator.innerHTML = statusHTML;
  }

  // Error state UI
  static showError(container, errorMessage, canRetry = false) {
    container.innerHTML = `
      <div class="error-state">
        <span class="error-icon">⚠️</span>
        <p class="error-message">${errorMessage}</p>
        ${canRetry ? '<button class="retry-btn">Retry</button>' : ''}
      </div>
    `;
  }
}

export default LoadingStates;
```

**Best practices:**
- Show skeleton screens for loads >1s, <10s
- Show progress bars for downloads (with percentage and MB)
- Use spinners for indeterminate operations <10s
- Never block user with blank screens
- Provide clear error messages with actionable guidance

### Pattern 5: Settings Panel UI (Toggle Switches)
**What:** Settings panel with engine selector, model management, and preferences
**When to use:** Settings overlay or modal in teleprompter controls
**Example:**
```javascript
// Source: Toggle switch UX guidelines (NN/G) + settings panel patterns
class SettingsPanel {
  constructor(settingsManager, deviceCapability) {
    this.settings = settingsManager;
    this.capability = deviceCapability;
  }

  render(container) {
    const currentSettings = this.settings.load();
    const { voskSupported, webSpeechSupported } = this.capability.detect();
    const recommendation = this.capability.recommendEngine();

    container.innerHTML = `
      <div class="settings-panel">
        <h2>Settings</h2>

        <!-- Engine Selection -->
        <section class="settings-section">
          <h3>Recognition Engine</h3>
          <p class="settings-help">
            ${recommendation.reason}
          </p>

          <div class="radio-group">
            <label>
              <input type="radio" name="engine" value="auto"
                     ${currentSettings.recognitionEngine === 'auto' ? 'checked' : ''}>
              <span>Auto (Recommended)</span>
            </label>

            <label ${!voskSupported ? 'class="disabled"' : ''}>
              <input type="radio" name="engine" value="vosk"
                     ${currentSettings.recognitionEngine === 'vosk' ? 'checked' : ''}
                     ${!voskSupported ? 'disabled' : ''}>
              <span>Vosk (Offline) ${!voskSupported ? '- Not supported' : ''}</span>
            </label>

            <label ${!webSpeechSupported ? 'class="disabled"' : ''}>
              <input type="radio" name="engine" value="webspeech"
                     ${currentSettings.recognitionEngine === 'webspeech' ? 'checked' : ''}
                     ${!webSpeechSupported ? 'disabled' : ''}>
              <span>Web Speech API (Online) ${!webSpeechSupported ? '- Not supported' : ''}</span>
            </label>
          </div>
        </section>

        <!-- Model Management (Vosk only) -->
        ${voskSupported ? `
          <section class="settings-section">
            <h3>Offline Model</h3>
            <div class="model-info">
              <p>Model: ${modelConfig.name}</p>
              <p>Size: ~${(modelConfig.size / (1024 * 1024)).toFixed(1)}MB</p>
              <p id="cache-status">Checking cache...</p>
            </div>
            <button id="download-model-btn" class="btn-primary">
              Download for Offline Use
            </button>
            <button id="clear-model-btn" class="btn-secondary">
              Clear Cached Model
            </button>
          </section>
        ` : ''}

        <!-- Other Settings -->
        <section class="settings-section">
          <h3>Display</h3>
          <label class="toggle-switch">
            <input type="checkbox" id="highlight-toggle"
                   ${currentSettings.highlightEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-label">Highlight spoken words</span>
          </label>

          <label class="toggle-switch">
            <input type="checkbox" id="mirror-toggle"
                   ${currentSettings.mirrorEnabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            <span class="toggle-label">Mirror mode (beam-splitter)</span>
          </label>
        </section>

        <button id="close-settings-btn" class="btn-close">Close</button>
      </div>
    `;

    this._attachEventListeners(container);
    this._updateCacheStatus();
  }

  _attachEventListeners(container) {
    // Engine selection
    container.querySelectorAll('input[name="engine"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.settings.set('recognitionEngine', e.target.value);
      });
    });

    // Toggle switches (immediate effect)
    const highlightToggle = container.querySelector('#highlight-toggle');
    if (highlightToggle) {
      highlightToggle.addEventListener('change', (e) => {
        this.settings.set('highlightEnabled', e.target.checked);
        // Update UI immediately (no save required)
      });
    }

    // Model management buttons
    const downloadBtn = container.querySelector('#download-model-btn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this._downloadModel());
    }

    const clearBtn = container.querySelector('#clear-model-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this._clearModel());
    }
  }

  async _updateCacheStatus() {
    const statusEl = document.getElementById('cache-status');
    if (!statusEl) return;

    try {
      const models = await cache.listModels();
      const voskModel = models.find(m => m.id === modelConfig.id);

      if (voskModel) {
        const sizeMB = (voskModel.size / (1024 * 1024)).toFixed(1);
        const dateStr = new Date(voskModel.cachedAt).toLocaleDateString();
        statusEl.textContent = `Cached: ${sizeMB}MB (${dateStr})`;
      } else {
        statusEl.textContent = 'Not cached - download required for offline use';
      }
    } catch (error) {
      statusEl.textContent = 'Cache status unavailable';
    }
  }

  async _downloadModel() {
    // Show loading state, initiate download (similar to RecognizerFactory)
  }

  async _clearModel() {
    // Clear model from cache, update UI
  }
}

export default SettingsPanel;
```

**Toggle switch best practices:**
- Take immediate effect (no Save button required)
- Show clear on/off states with color
- Minimum tap target 44x44px
- Disable with visual feedback when feature unavailable
- Use radio buttons for mutually exclusive options (engine selection)

### Anti-Patterns to Avoid
- **Using sessionStorage for settings:** Settings won't persist across sessions, frustrating users
- **Not handling localStorage errors:** App crashes in private browsing mode
- **Blocking UI during download:** Users should be able to cancel or navigate away
- **Not showing loading states:** Users abandon when they see blank screens >3s
- **Assuming Vosk works on iOS:** SharedArrayBuffer unavailable on iOS Safari, always falls back
- **Not validating Android beep elimination:** Primary goal unverified without real device testing
- **Using Playwright mobile emulation for mic testing:** Doesn't simulate actual microphone permissions or notifications

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Settings persistence | Custom storage API | localStorage with try-catch | Native, simple, 5MB quota, universally supported |
| Device tier detection | Custom benchmarking | navigator.deviceMemory | Native, instant, no performance cost |
| Platform detection | Custom regex parsing | SpeechRecognizer.getPlatform() | Already implemented, tested, consistent |
| Progress bars | Custom CSS animations | Native <progress> element + CSS | Semantic HTML, accessible, browser-optimized |
| Cross-platform testing | Manual device testing | BrowserStack + Playwright | Scalable, reproducible, CI/CD integration |

**Key insight:** Browser APIs have matured significantly for settings persistence and capability detection. Using native APIs reduces bundle size, improves performance, and ensures compatibility. For cross-platform validation, cloud testing services provide real devices at scale.

## Common Pitfalls

### Pitfall 1: localStorage Throws in Private Browsing
**What goes wrong:** App crashes when trying to save settings in Safari private browsing or iOS WKWebView
**Why it happens:** localStorage.setItem() throws SecurityError in private browsing mode
**How to avoid:**
- Always wrap localStorage access in try-catch blocks
- Provide in-memory fallback when localStorage unavailable
- Test in Safari private browsing mode during development
**Warning signs:** Uncaught SecurityError in console, app doesn't load in private browsing

### Pitfall 2: Assuming Vosk Works on iOS
**What goes wrong:** Users on iOS devices see "Vosk" option but it never works
**Why it happens:** iOS Safari blocks SharedArrayBuffer even with COOP/COEP headers for security reasons
**How to avoid:**
- Detect SharedArrayBuffer availability before showing Vosk option
- Hide or disable Vosk option on iOS with explanation
- Always fall back to Web Speech API on iOS
**Warning signs:** iOS users report voice mode doesn't work, console shows SharedArrayBuffer errors

### Pitfall 3: Not Testing Android Beep Elimination
**What goes wrong:** Entire v1.2 milestone value proposition unvalidated—beep may still occur with Vosk
**Why it happens:** Assumption that offline processing avoids notification without actual device testing
**How to avoid:**
- Test on real Android Chrome device (Pixel, Samsung, etc.) ASAP
- Verify notification beep absent when using Vosk
- Test with different Android versions (12+, 13, 14)
**Warning signs:** No real device testing in plan, validation deferred to "later"

### Pitfall 4: Blocking UI During Model Download
**What goes wrong:** Users can't interact with app during 40MB download, abandon when on slow connection
**Why it happens:** Synchronous download UI blocks main thread or prevents navigation
**How to avoid:**
- Show progress in non-modal overlay (can dismiss)
- Allow background download while user continues
- Provide cancel option during download
- Store download state to resume later
**Warning signs:** Users on 4G connections complain app freezes, high bounce rate during initial load

### Pitfall 5: Not Showing Which Engine Is Active
**What goes wrong:** Users don't know whether they're using Vosk or Web Speech API, can't troubleshoot issues
**Why it happens:** No visual indicator in teleprompter view showing active engine
**How to avoid:**
- Display engine badge in teleprompter view (persistent, subtle)
- Show fallback reason when Vosk initialization fails
- Log engine selection to console for debugging
**Warning signs:** User support requests "why is voice mode behaving differently?" with no way to answer

### Pitfall 6: Using Playwright Emulation for Mobile Testing
**What goes wrong:** Tests pass but real devices fail—microphone permissions and notifications behave differently
**Why it happens:** Playwright mobile emulation simulates viewport/user agent but not OS-level features
**How to avoid:**
- Use Playwright for desktop browser testing only
- Use BrowserStack or physical devices for iOS/Android testing
- Test actual microphone permissions flow on real devices
**Warning signs:** Tests pass but users report permission errors, notification beep still occurs on Android

## Code Examples

Verified patterns from existing codebase and research:

### Complete Settings Integration
```javascript
// Integration example: script.js modifications for Phase 11
import SettingsManager from './settings/SettingsManager.js';
import DeviceCapability from './settings/DeviceCapability.js';
import RecognizerFactory from './voice/recognizerFactory.js';
import LoadingStates from './ui/LoadingStates.js';

// Initialize settings manager
const settingsManager = new SettingsManager();

// Load persisted settings
const settings = settingsManager.load();
state.fontSize = settings.fontSize;
state.scrollSpeed = settings.scrollSpeed;
state.highlightEnabled = settings.highlightEnabled;
state.mirrorEnabled = settings.mirrorEnabled;

// Voice mode initialization with engine selection
async function initializeVoiceMode() {
  state.voiceState = 'initializing';

  // Get engine preference (from settings or auto-detect)
  const enginePreference = settings.recognitionEngine || 'auto';

  try {
    // Create recognizer with fallback
    const { recognizer, engineUsed, fallbackReason } = await RecognizerFactory.create(
      enginePreference,
      {
        onTranscript: handleSpeechTranscript,
        onError: handleSpeechError,
        onStateChange: handleSpeechStateChange
      },
      (progress) => {
        // Show model download progress (Vosk only)
        LoadingStates.showDownloadProgress(listeningIndicator, progress);
      }
    );

    // Store recognizer and engine info
    speechRecognizer = recognizer;
    state.activeEngine = engineUsed;

    // Show fallback reason if applicable
    if (fallbackReason) {
      console.warn('Engine fallback:', fallbackReason);
      showNotification(`Using Web Speech API: ${fallbackReason}`, 'warning');
    }

    // Update UI indicator
    LoadingStates.showEngineIndicator(
      engineUsed,
      /* modelCached */ true,
      /* cacheSize */ modelConfig.size,
      /* lastUpdated */ Date.now()
    );

    // Start recognition
    await speechRecognizer.start();

    state.voiceEnabled = true;
    state.voiceState = 'listening';

  } catch (error) {
    console.error('Voice mode initialization failed:', error);
    state.voiceState = 'error';
    LoadingStates.showError(listeningIndicator, error.message, true);
  }
}

// Settings panel integration
function showSettings() {
  const settingsPanel = new SettingsPanel(settingsManager, DeviceCapability);
  const overlay = document.getElementById('settings-overlay');
  settingsPanel.render(overlay);
  overlay.classList.remove('hidden');
}
```

### Device Capability Detection in Action
```javascript
// Real-world usage: Engine recommendation on app load
document.addEventListener('DOMContentLoaded', () => {
  const capability = DeviceCapability.detect();
  const recommendation = DeviceCapability.recommendEngine();

  console.log('Device capabilities:', capability);
  console.log('Recommended engine:', recommendation);

  // Show first-time user guidance
  if (!settingsManager.get('hasSeenEngineInfo')) {
    showEngineRecommendation(recommendation);
    settingsManager.set('hasSeenEngineInfo', true);
  }
});

function showEngineRecommendation(recommendation) {
  const message = `
    <h3>Voice Mode Setup</h3>
    <p>${recommendation.reason}</p>
    ${recommendation.shouldDownloadModel ? `
      <p>Download the ${(modelConfig.size / (1024 * 1024)).toFixed(0)}MB model now
      for offline voice control, or use Web Speech API (online only).</p>
      <button id="download-now-btn">Download Now</button>
      <button id="use-online-btn">Use Online</button>
    ` : `
      <p>Web Speech API will be used for voice control (requires internet connection).</p>
      <button id="got-it-btn">Got It</button>
    `}
  `;

  showModal(message);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cookies for settings | localStorage API | 2011-2012 | Simpler API, more storage (5MB vs 4KB), no server overhead |
| User agent sniffing | Feature detection | 2015+ | More reliable, privacy-friendly, fewer false positives |
| Modal loading screens | Skeleton screens | 2018-2020 | Perceived performance improvement, reduced abandonment |
| Manual device testing | Cloud testing platforms | 2015+ | Scalable, reproducible, CI/CD integration |
| Chrome-only Web Speech API | Cross-browser + offline | 2020-2025 | Privacy, offline capability, no Android beep |

**Deprecated/outdated:**
- **Cookies for settings storage:** localStorage simpler, more storage, no server round-trips
- **navigator.userAgentData:** Newer API with privacy benefits but limited Safari support; use navigator.userAgent for now
- **Modal spinners for all loading:** Skeleton screens preferred for >1s loads, spinners for indeterminate <10s
- **localStorage without try-catch:** Required in 2026 due to private browsing mode errors

**Current best practices (2026):**
- Use localStorage with try-catch for settings persistence
- Detect capabilities with multiple signals (SharedArrayBuffer, platform, deviceMemory)
- Show skeleton screens during model download with progress bars
- Implement graceful degradation (Vosk → Web Speech API fallback)
- Test on real devices via BrowserStack for mobile validation
- Use toggle switches for immediate-effect settings (no Save button)

## Open Questions

Things that couldn't be fully resolved:

1. **Android Beep Elimination Verification**
   - What we know: Web Speech API triggers notification beep on Android Chrome, Vosk is offline processing
   - What's unclear: Whether offline processing actually avoids the beep, or if Android triggers it for any microphone access
   - Recommendation: Test on real Android device (Pixel 3a or newer) ASAP in Phase 11 validation. This is the PRIMARY success criterion for v1.2 milestone. If beep persists with Vosk, entire milestone value proposition fails.

2. **iOS Safari SharedArrayBuffer Support Timeline**
   - What we know: iOS Safari currently blocks SharedArrayBuffer even with COOP/COEP headers
   - What's unclear: Whether Apple will enable it in future iOS versions, or if it's permanently blocked for security
   - Recommendation: Assume permanently unavailable on iOS, always fall back to Web Speech API. Monitor WebKit blog for updates.

3. **Device Memory API Safari Support**
   - What we know: navigator.deviceMemory only available in Chromium browsers (Chrome, Edge)
   - What's unclear: Whether Safari will ever implement it, or if alternatives exist for device tier detection on iOS
   - Recommendation: Use platform detection + SharedArrayBuffer availability as fallback on Safari. Assume mid-tier device if deviceMemory unavailable.

4. **Model Download Background Strategy**
   - What we know: Service Workers can download in background, but adds complexity
   - What's unclear: Whether background download worth the complexity for 40MB one-time download
   - Recommendation: Defer to v2. For v1.2, show progress in foreground with cancel option. Most users will download once and cache permanently.

5. **Cross-Platform Testing Budget**
   - What we know: BrowserStack provides real device testing, but costs money (subscription or pay-per-use)
   - What's unclear: Whether project has budget for BrowserStack, or if physical devices available
   - Recommendation: Start with BrowserStack free trial for critical Android beep test. If budget unavailable, borrow physical Android device from team member. Desktop testing with Playwright is free.

6. **Optimal Device Tier Thresholds**
   - What we know: navigator.deviceMemory returns RAM in GB (0.5, 1, 2, 4, 8...)
   - What's unclear: Optimal thresholds for low/mid/high tier (e.g., is 2GB low or mid?)
   - Recommendation: Use <2GB = low, 2-4GB = mid, >4GB = high based on research. Monitor Vosk performance on actual devices and adjust thresholds in future updates if needed.

## Sources

### Primary (HIGH confidence)
- MDN Web APIs (localStorage, Device Memory API, IndexedDB, StorageManager) - Official documentation
- Existing codebase (VoskRecognizer.js, SpeechRecognizer.js, ModelLoader.js) - Implementation reference
- Phase 9 RESEARCH.md - Model loading infrastructure patterns
- Phase 10 RESEARCH.md - VoskRecognizer interface specification
- BrowserStack documentation 2026 - Cross-platform testing capabilities
- Playwright documentation 2026 - Local emulation testing

### Secondary (MEDIUM confidence)
- NN/G Skeleton Screens article - UX loading state patterns
- NN/G Toggle Switch Guidelines - Settings UI best practices
- WebSearch: localStorage best practices 2026 - Error handling, private browsing
- WebSearch: graceful degradation PWA 2026 - Fallback patterns
- WebSearch: Device Memory API tutorials 2025-2026 - Capability detection examples
- WebSearch: UI loading states patterns 2025-2026 - Skeleton screens vs spinners

### Tertiary (LOW confidence)
- GitHub issues (annyang, Web Speech API) - Android beep workarounds (NO definitive solution found)
- WebSearch: toggle switch design 2026 - General UI patterns
- WebSearch: cross-platform testing tools 2026 - BrowserStack alternatives

## Metadata

**Confidence breakdown:**
- Settings persistence (localStorage): HIGH - Native API, well-documented, existing patterns verified
- Device capability detection: MEDIUM-HIGH - APIs available but deviceMemory limited to Chromium
- Engine selection UI: HIGH - Existing SpeechRecognizer/VoskRecognizer interfaces defined, factory pattern straightforward
- Fallback implementation: HIGH - Graceful degradation patterns established, both recognizers implement identical interface
- Android beep elimination: LOW - **UNVERIFIED** assumption that Vosk avoids beep, requires real device testing
- Cross-platform validation: MEDIUM - Tools available (BrowserStack, Playwright) but not yet tested in this project

**Research date:** 2026-02-01
**Valid until:** 60 days (browser APIs stable, but mobile OS updates could affect SharedArrayBuffer/permissions)

**Key success factors:**
1. **Android beep test CRITICAL:** Validate Vosk eliminates notification beep on real Android Chrome device
2. Settings persistence with error handling (localStorage try-catch)
3. Device capability detection with multiple signals (SharedArrayBuffer, platform, deviceMemory)
4. Clear loading states (skeleton screens for download, spinner for initialization)
5. Automatic fallback to Web Speech API when Vosk unavailable
6. Real device testing on Android, iOS, Desktop (BrowserStack or physical devices)
7. Engine indicator in UI so users know which engine is active

**Implementation readiness:** Ready to plan with one critical validation gap. Phase 9 (ModelLoader) and Phase 10 (VoskRecognizer) provide all infrastructure needed. Settings persistence and capability detection use native APIs with established patterns. Primary unknown is Android beep elimination—**this must be tested on real device early in Phase 11**. If beep persists with Vosk, may need alternative approach (e.g., native Android app wrapper, different offline engine, or accept limitation).

**Primary risk:** Android beep elimination unverified. If Vosk doesn't eliminate the beep (e.g., Android triggers notification for ANY microphone access regardless of cloud vs offline), the entire v1.2 milestone value proposition fails. Recommend testing this FIRST in Phase 11 before building full settings UI.
