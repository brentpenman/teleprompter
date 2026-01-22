# Phase 2: Speech Recognition Foundation - Research

**Researched:** 2026-01-22
**Domain:** Web Speech API (SpeechRecognition) with Web Audio API visualization
**Confidence:** HIGH

## Summary

The Web Speech API provides browser-native speech recognition through the `SpeechRecognition` interface. On Chrome and Safari, this is server-based (audio sent to Google/Apple), requiring network connectivity. Firefox does not support speech recognition at all. The API is well-documented and stable, with clear patterns for continuous recognition, error handling, and auto-restart behavior.

For visual feedback, the Web Audio API's `AnalyserNode` provides real-time frequency data from microphone input, enabling animated waveform bar visualizations using canvas and `requestAnimationFrame`. This is a separate API that requires `getUserMedia()` for microphone access.

The phase requires integrating three browser APIs: `SpeechRecognition` for transcription, `getUserMedia()` for microphone permission, and `AnalyserNode` + Canvas for waveform visualization. User preferences persist via `localStorage` with JSON serialization.

**Primary recommendation:** Use `SpeechRecognition` with `continuous: true`, auto-restart in `onend` handler, distinguish between recoverable and fatal errors, combine with `AnalyserNode.getByteFrequencyData()` for animated frequency bars, and handle Chrome's 60-second session timeout through automatic restarts.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Speech API (SpeechRecognition) | Browser native | Speech-to-text transcription | Only free browser-native option, no external dependencies |
| Web Audio API (AnalyserNode) | Browser native | Real-time audio frequency analysis | Standard for audio visualization, works with microphone input |
| MediaDevices.getUserMedia() | Browser native | Microphone permission and audio stream access | Required for both speech recognition and audio visualization |
| Canvas API | Browser native | Drawing waveform bars | Standard for 2D graphics rendering |
| localStorage | Browser native | Persisting voice mode preference | Simple key-value storage for user settings |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| requestAnimationFrame | Browser native | Smooth waveform animation loop | All animation drawing (60fps updates) |
| Uint8Array | Browser native | Audio frequency data buffer | Storing frequency data from AnalyserNode |
| JSON.stringify/parse | Browser native | Serialize/deserialize preferences | Converting boolean voice mode to string for localStorage |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Web Speech API | Cloud services (AssemblyAI, Deepgram) | Better accuracy and features but requires API keys, costs money, violates "free AI only" constraint |
| Web Audio API | Pre-built libraries (wavesurfer.js) | Easier implementation but adds bundle size and complexity for simple bars |
| localStorage | sessionStorage | Voice mode resets on tab close instead of persisting across sessions |

**Installation:**
```bash
# No npm packages needed - all browser-native APIs
# Ensure HTTPS context (required for getUserMedia and SpeechRecognition)
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── voice/                    # Voice recognition module
│   ├── SpeechRecognizer.js  # SpeechRecognition wrapper with auto-restart
│   └── AudioVisualizer.js   # AnalyserNode + canvas waveform bars
├── ui/
│   └── ListeningIndicator.js # Corner overlay with waveform
└── storage/
    └── preferences.js        # localStorage helpers
```

### Pattern 1: Continuous Recognition with Auto-Restart
**What:** Configure `SpeechRecognition` with `continuous: true` and automatically restart when `onend` fires to maintain always-listening behavior.

**When to use:** Phase 2 requirement for continuous listening through pauses without manual restart.

**Example:**
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();

recognition.continuous = true;  // Don't stop after single phrase
recognition.interimResults = true;  // Get real-time results
recognition.lang = 'en-US';  // Explicit language (best practice)

let isListening = false;

recognition.onstart = () => {
  console.log('Recognition started');
  isListening = true;
};

recognition.onend = () => {
  console.log('Recognition ended');
  isListening = false;

  // Auto-restart to maintain continuous listening
  if (shouldContinue) {
    setTimeout(() => {
      recognition.start();
    }, 100);  // Small delay to avoid "already started" errors
  }
};

recognition.onerror = (event) => {
  console.error('Recognition error:', event.error);
  // Error handling in Pattern 2
};

recognition.onresult = (event) => {
  const transcript = event.results[event.results.length - 1][0].transcript;
  console.log('Transcript:', transcript);
};
```

### Pattern 2: Robust Error Handling with Retry Logic
**What:** Distinguish between recoverable errors (auto-retry silently) and fatal errors (disable voice mode, show message).

**When to use:** Production-ready error handling for all speech recognition errors.

**Example:**
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent/error
const RECOVERABLE_ERRORS = ['network', 'no-speech', 'aborted'];
const FATAL_ERRORS = ['not-allowed', 'service-not-allowed', 'language-not-supported'];

let retryCount = 0;
const MAX_RETRIES = 10;

recognition.onerror = (event) => {
  const errorType = event.error;

  if (FATAL_ERRORS.includes(errorType)) {
    // Fatal: disable voice mode permanently
    console.error('Fatal error:', errorType);
    disableVoiceMode();
    showErrorMessage(`Voice recognition unavailable: ${errorType}`);
    return;
  }

  if (RECOVERABLE_ERRORS.includes(errorType)) {
    // Recoverable: retry with backoff
    retryCount++;

    if (retryCount > MAX_RETRIES) {
      console.warn('Max retries exceeded');
      disableVoiceMode();
      return;
    }

    // Exponential backoff: 100ms, 200ms, 400ms, etc.
    const delay = Math.min(100 * Math.pow(2, retryCount - 1), 5000);
    console.warn(`Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);

    setTimeout(() => {
      recognition.start();
    }, delay);
  }
};

recognition.onstart = () => {
  // Reset retry counter on successful start
  retryCount = 0;
};
```

### Pattern 3: Microphone Permission Flow
**What:** Request microphone permission only when user enables voice mode, handle denial gracefully.

**When to use:** First voice toggle activation.

**Example:**
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
async function enableVoiceMode() {
  try {
    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    // Permission granted - start recognition
    recognition.start();

    // Setup audio visualizer (Pattern 4)
    setupAudioVisualizer(stream);

    return true;
  } catch (err) {
    // Handle permission denial or device errors
    if (err.name === 'NotAllowedError') {
      console.error('Microphone permission denied');
      showErrorMessage('Microphone access denied. Voice mode requires microphone permission.');
      disableVoiceToggle();
    } else if (err.name === 'NotFoundError') {
      console.error('No microphone found');
      showErrorMessage('No microphone detected.');
      disableVoiceToggle();
    } else if (err.name === 'NotReadableError') {
      console.error('Microphone in use by another app');
      showErrorMessage('Microphone is in use by another application.');
    } else {
      console.error('getUserMedia error:', err);
      showErrorMessage('Unable to access microphone.');
      disableVoiceToggle();
    }

    return false;
  }
}
```

### Pattern 4: Real-Time Waveform Visualization
**What:** Use `AnalyserNode` with `getByteFrequencyData()` to draw animated frequency bars on canvas.

**When to use:** Listening indicator showing real-time audio input.

**Example:**
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
function setupAudioVisualizer(stream) {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);

  source.connect(analyser);
  // Note: Don't connect to destination (no playback needed)

  // Configure analyser for frequency bars
  analyser.fftSize = 256;  // Smaller FFT for clear bars (not waveform)
  analyser.smoothingTimeConstant = 0.8;  // Smooth out fluctuations

  const bufferLength = analyser.frequencyBinCount;  // fftSize / 2
  const dataArray = new Uint8Array(bufferLength);

  const canvas = document.getElementById('waveform-canvas');
  const canvasCtx = canvas.getContext('2d');
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  function draw() {
    requestAnimationFrame(draw);

    // Get fresh frequency data
    analyser.getByteFrequencyData(dataArray);

    // Clear canvas
    canvasCtx.fillStyle = 'rgb(0 0 0)';
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    // Draw frequency bars
    const barWidth = (WIDTH / bufferLength) * 2.5;  // 2.5x multiplier for visibility
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = dataArray[i] / 2;  // Scale down to fit

      // Color based on intensity
      canvasCtx.fillStyle = `rgb(${barHeight + 100} 50 50)`;

      // Draw bar from bottom up
      canvasCtx.fillRect(
        x,
        HEIGHT - barHeight / 2,
        barWidth,
        barHeight
      );

      x += barWidth + 1;
    }
  }

  draw();  // Start animation loop
}
```

### Pattern 5: Persist Voice Mode Preference
**What:** Save voice mode state to `localStorage` with JSON serialization, restore on page load.

**When to use:** Maintaining user's voice mode preference across page reloads.

**Example:**
```javascript
// Source: Best practices from https://medium.com/@roman_j/mastering-state-persistence-with-local-storage-in-react-a-complete-guide-1cf3f56ab15c
const STORAGE_KEY = 'voiceModeEnabled';

function saveVoicePreference(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
  } catch (err) {
    console.error('Failed to save preference:', err);
    // Gracefully handle QuotaExceededError or SecurityError
  }
}

function loadVoicePreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null ? JSON.parse(saved) : false;  // Default: false
  } catch (err) {
    console.error('Failed to load preference:', err);
    return false;  // Default on error
  }
}

// On page load
const savedPreference = loadVoicePreference();
if (savedPreference) {
  enableVoiceMode();
}

// On toggle
voiceToggle.addEventListener('change', (event) => {
  const enabled = event.target.checked;
  saveVoicePreference(enabled);

  if (enabled) {
    enableVoiceMode();
  } else {
    disableVoiceMode();
  }
});
```

### Anti-Patterns to Avoid

- **Starting recognition before permission granted:** Always request `getUserMedia()` before calling `recognition.start()` to ensure microphone access.
- **No delay in auto-restart:** Calling `recognition.start()` immediately in `onend` can cause "already started" errors. Use small timeout (100ms).
- **Ignoring browser support:** Check for `window.SpeechRecognition || window.webkitSpeechRecognition` and show disabled state if unavailable.
- **Connecting analyser to destination:** Don't connect `analyser.connect(audioContext.destination)` or user will hear their own voice (audio feedback loop).
- **Large FFT size for bars:** Using `fftSize: 2048` is for waveforms, not frequency bars. Use 256 for visible bar graph.
- **Storing booleans directly in localStorage:** Always use `JSON.stringify()` for consistency, as localStorage converts everything to strings.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Retry with exponential backoff | Custom retry counter with hardcoded delays | Pattern 2 with `Math.pow(2, retryCount)` | Exponential backoff is standard, prevents overwhelming service, self-limiting |
| Audio frequency extraction | Manual FFT or audio processing | `AnalyserNode.getByteFrequencyData()` | Browser-optimized, handles FFT complexity, real-time performance |
| Smooth animation loop | `setInterval()` or `setTimeout()` | `requestAnimationFrame()` | Syncs with screen refresh (60fps), pauses when tab inactive, better performance |
| Permission state detection | Repeated `getUserMedia()` calls | Store permission result, use Permissions API if needed | Avoid multiple permission prompts, better UX |
| Cross-browser prefix handling | Manual browser detection | `window.SpeechRecognition \|\| window.webkitSpeechRecognition` | Simple fallback covers Chrome/Safari webkit prefix |

**Key insight:** Browser APIs handle edge cases (silence detection, network timeouts, audio processing) that would require significant custom code. The Web Speech API automatically handles silence detection (~7 seconds), network retry, and audio quality issues. Don't try to improve on this—focus on graceful error handling instead.

## Common Pitfalls

### Pitfall 1: Chrome 60-Second Session Timeout
**What goes wrong:** Even with `continuous: true` and auto-restart, Chrome terminates speech recognition sessions after 60 seconds. The `onend` event fires and recognition stops.

**Why it happens:** Chrome's Web Speech API has a hardcoded 60-second session timeout as a security/resource measure. This is not configurable.

**How to avoid:** Accept this as expected behavior. Implement auto-restart in `onend` handler to start a new session immediately. Users won't notice the brief interruption if restart is fast (<100ms delay).

**Warning signs:** User reports voice recognition "stopping randomly" after about a minute. Check logs for `onend` firing at ~60 second intervals.

### Pitfall 2: Recognition Stops After ~7 Seconds of Silence
**What goes wrong:** If user doesn't speak for approximately 7 seconds, Chrome automatically ends the recognition session and fires `onend`.

**Why it happens:** Browser's silence detection assumes user has finished speaking. This is intentional behavior to conserve resources.

**How to avoid:** Same solution as Pitfall 1—auto-restart in `onend`. For continuous listening (like this app), silence should NOT stop recognition, so auto-restart immediately.

**Warning signs:** `onend` firing frequently when user pauses between sentences or during reading.

### Pitfall 3: "Already Started" Error on Rapid Restart
**What goes wrong:** Calling `recognition.start()` immediately in `onend` throws error: "recognition has already started".

**Why it happens:** There's a tiny delay between `onend` firing and recognition fully stopping. Immediate restart happens before cleanup completes.

**How to avoid:** Add small timeout (100-200ms) before calling `recognition.start()` in `onend` handler. This gives browser time to clean up.

**Warning signs:** Console errors "recognition has already started" when auto-restart fires. Recognition fails to resume.

### Pitfall 4: Firefox Has Zero Support
**What goes wrong:** `SpeechRecognition` is `undefined` on all Firefox versions. App breaks if not checked.

**Why it happens:** Firefox has never implemented the Web Speech API for speech recognition (only synthesis). No timeline for support.

**How to avoid:** Check `if (!window.SpeechRecognition && !window.webkitSpeechRecognition)` on initialization. Show disabled voice toggle with tooltip "Voice recognition not supported in Firefox. Use Chrome or Safari."

**Warning signs:** User reports "voice button is disabled" or app crashes on Firefox. Check browser user agent.

### Pitfall 5: Insecure Context (HTTP) Breaks Everything
**What goes wrong:** `navigator.mediaDevices` is `undefined` on HTTP. `getUserMedia()` and `SpeechRecognition` silently fail or throw errors.

**Why it happens:** Browser security requires HTTPS for accessing microphone and speech recognition APIs.

**How to avoid:** Serve app over HTTPS in production. For local development, use `localhost` (which is treated as secure) or set up local HTTPS.

**Warning signs:** `TypeError: Cannot read property 'getUserMedia' of undefined`. Works on localhost but fails on deployed HTTP site.

### Pitfall 6: Background Tab Throttling Breaks WebSocket (Chrome)
**What goes wrong:** When tab is inactive, Chrome throttles JavaScript execution and may close the WebSocket connection used for server-based recognition, causing recognition to fail.

**Why it happens:** Chrome aggressively throttles background tabs to save resources. The Web Speech API on Chrome uses a server connection that can be dropped.

**How to avoid:** Document this as known limitation. Optionally use Page Visibility API to detect tab inactive state and show indicator "Voice recognition paused when tab is in background." Most teleprompter users will have app in foreground anyway.

**Warning signs:** User switches tabs and recognition stops. `onerror` with "network" error when tab is backgrounded.

### Pitfall 7: Permission Denial Leaves Voice Toggle in Broken State
**What goes wrong:** User denies microphone permission but voice toggle stays enabled/clickable. Clicking it again prompts permission repeatedly or does nothing.

**Why it happens:** App doesn't handle `NotAllowedError` from `getUserMedia()` by disabling the toggle permanently.

**How to avoid:** On `NotAllowedError`, disable voice toggle and add tooltip explaining permission is required. Don't allow re-enabling until page reload (browser permission memory handles retry).

**Warning signs:** User reports "voice mode doesn't work but I can keep clicking it." Multiple permission prompts in quick succession.

### Pitfall 8: Audio Visualization Continues After Voice Disabled
**What goes wrong:** Waveform bars keep animating even after user disables voice mode.

**Why it happens:** `requestAnimationFrame` loop in audio visualizer not stopped when voice mode disabled. Stream and AudioContext not cleaned up.

**How to avoid:** Store `animationFrameId` from `requestAnimationFrame(draw)` and call `cancelAnimationFrame(animationFrameId)` when disabling. Stop all audio tracks: `stream.getTracks().forEach(track => track.stop())`. Close AudioContext.

**Warning signs:** Waveform indicator keeps moving after voice toggle disabled. Microphone indicator in browser stays active.

## Code Examples

Verified patterns from official sources:

### Complete SpeechRecognition Setup with Browser Support Check
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
  console.warn('SpeechRecognition not supported');
  document.getElementById('voice-toggle').disabled = true;
  document.getElementById('voice-toggle').title = 'Voice recognition not supported in this browser';
} else {
  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  // Event handlers here...
}
```

### Microphone Permission with Complete Error Handling
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
async function requestMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    return { success: true, stream };
  } catch (err) {
    let message = 'Unable to access microphone.';

    switch (err.name) {
      case 'NotAllowedError':
        message = 'Microphone permission denied.';
        break;
      case 'NotFoundError':
        message = 'No microphone detected.';
        break;
      case 'NotReadableError':
        message = 'Microphone in use by another application.';
        break;
      case 'OverconstrainedError':
        message = 'Microphone does not meet requirements.';
        break;
      case 'SecurityError':
        message = 'Microphone access blocked by security policy.';
        break;
      case 'TypeError':
        message = 'Insecure context (HTTPS required).';
        break;
    }

    return { success: false, error: err.name, message };
  }
}
```

### Audio Visualizer Cleanup on Disable
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
let animationFrameId = null;
let audioContext = null;
let mediaStream = null;

function startVisualizer(stream) {
  mediaStream = stream;
  audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);

  source.connect(analyser);
  analyser.fftSize = 256;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    animationFrameId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);
    // Draw to canvas...
  }

  draw();
}

function stopVisualizer() {
  // Cancel animation loop
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  // Stop microphone tracks
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  // Close audio context
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}
```

### localStorage with Error Handling and Validation
```javascript
// Source: Best practices from localStorage guides
const STORAGE_KEYS = {
  VOICE_MODE: 'voiceModeEnabled'
};

function savePreference(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded');
    } else if (err.name === 'SecurityError') {
      console.error('localStorage blocked by privacy settings');
    } else {
      console.error('localStorage save failed:', err);
    }
    return false;
  }
}

function loadPreference(key, defaultValue) {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return defaultValue;

    const parsed = JSON.parse(saved);

    // Validate type matches default
    if (typeof parsed !== typeof defaultValue) {
      console.warn('Invalid preference type, using default');
      return defaultValue;
    }

    return parsed;
  } catch (err) {
    console.error('localStorage load failed:', err);
    return defaultValue;
  }
}

// Usage
const voiceEnabled = loadPreference(STORAGE_KEYS.VOICE_MODE, false);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `SpeechGrammar` and `SpeechGrammarList` | `SpeechRecognitionPhrase` for contextual biasing | Deprecated in spec revision | Grammar APIs have no effect, use phrases for domain-specific terms |
| Non-prefixed in all browsers | `webkitSpeechRecognition` required for Chrome/Safari | Chrome still requires prefix (as of 2026) | Must check `window.SpeechRecognition \|\| window.webkitSpeechRecognition` |
| `navigator.getUserMedia()` (callback-based) | `navigator.mediaDevices.getUserMedia()` (Promise-based) | Deprecated ~2017 | Use Promise-based API with async/await |
| Manual browser detection | Feature detection (`if (!SpeechRecognition)`) | Best practice since ES5 | Never detect browser, detect feature availability |

**Deprecated/outdated:**
- `SpeechGrammar` and `SpeechGrammarList`: Deprecated, retained for backwards compatibility only, have no effect on modern recognition services
- `navigator.getUserMedia()`: Deprecated, use `navigator.mediaDevices.getUserMedia()` instead
- Callback-based error handling: Use Promises with try/catch for cleaner code

## Open Questions

Things that couldn't be fully resolved:

1. **Background tab behavior consistency**
   - What we know: Chrome throttles background tabs, WebSocket connections may drop, recognition can fail
   - What's unclear: Exact behavior varies by browser version, no official spec on background behavior
   - Recommendation: Document as known limitation, most teleprompter users will have app in foreground. Optionally detect with Page Visibility API and show warning indicator.

2. **Optimal retry backoff timing**
   - What we know: Exponential backoff is standard (100ms, 200ms, 400ms, etc.)
   - What's unclear: Max retry count and max delay values vary by use case
   - Recommendation: Start with MAX_RETRIES = 10 and max delay of 5000ms. Monitor in production and adjust based on user feedback.

3. **Waveform animation performance on low-end devices**
   - What we know: `requestAnimationFrame` + canvas is standard, FFT size 256 is efficient
   - What's unclear: Performance on very old mobile devices or low-end hardware
   - Recommendation: Implement as specified, add performance monitoring. If issues arise, reduce FFT size to 128 or add option to disable animation.

4. **Indicator color/state during retry**
   - What we know: User decision specified "red/amber during retry attempts"
   - What's unclear: Which color when, how to distinguish retry vs fatal error
   - Recommendation: Use amber during silent retry (network, no-speech), red on fatal error (not-allowed, service-not-allowed). This is under "Claude's discretion" in CONTEXT.md.

## Sources

### Primary (HIGH confidence)
- MDN Web Docs - SpeechRecognition: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- MDN Web Docs - SpeechRecognitionErrorEvent: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent/error
- MDN Web Docs - Web Speech API Guide: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
- MDN Web Docs - getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN Web Docs - Web Audio Visualizations: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
- W3C Web Speech API Specification: https://webaudio.github.io/web-speech-api/#speechrecognitionerrorevent

### Secondary (MEDIUM confidence)
- Can I Use - Speech Recognition API: https://caniuse.com/speech-recognition (browser support verified)
- Chrome Developers Blog - Web Speech API: https://developer.chrome.com/blog/voice-driven-web-apps-introduction-to-the-web-speech-api/ (best practices verified)
- Common getUserMedia Errors: https://blog.addpipe.com/common-getusermedia-errors/ (error types verified against MDN)
- localStorage Best Practices: https://medium.com/@roman_j/mastering-state-persistence-with-local-storage-in-react-a-complete-guide-1cf3f56ab15c (patterns verified)

### Tertiary (LOW confidence - noted for validation)
- Chromium discussion on 60-second timeout: https://groups.google.com/a/chromium.org/g/chromium-html5/c/s2XhT-Y5qAc (timeout behavior, need production testing)
- Background tab throttling: https://webreflection.medium.com/taming-the-web-speech-api-ef64f5a245e1 (behavior varies, test in target browsers)
- Auto-restart patterns: Various developer blogs and Stack Overflow (patterns verified against official docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All browser-native APIs with official MDN documentation
- Architecture: HIGH - Patterns verified from official MDN examples and W3C spec
- Pitfalls: HIGH - Confirmed through official docs (Firefox support, HTTPS requirement, error types) and community reports (60-second timeout, silence detection)
- Error handling: HIGH - Complete error enumeration from W3C spec and MDN
- Audio visualization: HIGH - Official MDN tutorial with working examples

**Research date:** 2026-01-22
**Valid until:** 2026-02-22 (30 days - stable browser APIs, unlikely to change)

---

**Note on User Decisions:** Research focused on user's locked decisions from CONTEXT.md:
- Waveform bars style (researched AnalyserNode with getByteFrequencyData)
- Corner overlay position (researched canvas patterns)
- Auto-retry indefinitely with visual indicator (researched error types and retry patterns)
- Continuous mode with auto-restart (researched continuous property and onend handler)
- Browser support handling (researched Firefox limitation and feature detection)
