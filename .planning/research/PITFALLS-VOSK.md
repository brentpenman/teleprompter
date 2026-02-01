# Vosk Offline Recognition Integration Pitfalls

**Domain:** Vosk offline speech recognition for web applications
**Researched:** 2026-02-01
**Confidence:** MEDIUM (WebSearch + official sources, needs Context7 verification)

## Executive Summary

Integrating Vosk offline speech recognition into web applications fails predictably when developers underestimate three key challenges: **model delivery**, **AudioWorklet complexity**, and **performance on constrained devices**. The promise of "drop-in replacement for Web Speech API" obscures fundamental differences in architecture, resource management, and error handling.

**Key tension:** Vosk requires WebAssembly + 50MB model + AudioWorklet to match Web Speech API's single-line setup. Each component introduces failure modes that cloud-based APIs hide behind network calls.

**Critical insight:** Most failures stem from treating Vosk like a library when it's actually a **distributed system** - you must handle model distribution, runtime initialization, worker thread communication, and resource cleanup that Web Speech API manages for you.

---

## Critical Pitfalls

### Pitfall 1: Model Loading Without Quota Management

**What goes wrong:**

50MB model download succeeds, but IndexedDB storage fails with `QuotaExceededError`. Application appears to work (model downloaded) but crashes on next load (storage failed). Users on low-storage devices experience perpetual "first load" - download succeeds, storage fails, repeat.

**Why it happens:**

Developers test on desktop with abundant storage. IndexedDB quotas vary by browser and available disk space:
- Firefox: 10% of disk space or 10GB, whichever is smaller
- Chrome: Percentage of free disk space
- Safari iOS: **Strict caps + 7-day eviction policy** for all writable storage

The download succeeds (browser cache), but persisting to IndexedDB for offline use fails silently or with unclear errors.

**How to avoid:**

1. **Check quota before downloading:**
```javascript
async function canStoreModel(modelSize) {
  if (!navigator.storage?.estimate) {
    // Fallback: assume limited storage on older browsers
    return false;
  }

  const { quota, usage } = await navigator.storage.estimate();
  const available = quota - usage;
  const safetyMargin = 1.5; // 50% overhead for indices/overhead

  return available > (modelSize * safetyMargin);
}
```

2. **Implement fallback strategy:**
- If quota check fails, offer smaller model
- Provide "stream from CDN" mode (no local storage)
- Clear other app data to free space (with user consent)

3. **Handle QuotaExceededError explicitly:**
```javascript
try {
  await db.put('models', modelBlob);
} catch (err) {
  if (err.name === 'QuotaExceededError' ||
      err.inner?.name === 'QuotaExceededError') {  // Firefox wraps in AbortError
    // Offer user choice: delete old data, use smaller model, or stream
    await handleQuotaExceeded();
  }
}
```

4. **Monitor Safari 7-day eviction:**
- On Safari, all storage can be evicted after 7 days of non-use
- Show warning: "Model must re-download after 7 days inactive"
- Implement fast re-download flow

**Warning signs:**

- Users report "works first time, fails on reload"
- iOS users report "model downloads repeatedly"
- Error logs show `QuotaExceededError` but download succeeded
- Desktop testing works, mobile testing fails

**Phase to address:**

Phase 1: Model Loading Infrastructure - implement quota check + fallback before any download logic.

---

### Pitfall 2: Model Download Failure Without Recovery

**What goes wrong:**

Model download fails (network error, CORS, user navigates away) leaving application in broken state. User sees loading spinner indefinitely, refresh loops back to download attempt, no escape hatch. Worse: partial download stored corrupts IndexedDB, requiring manual browser data clear.

**Why it happens:**

Model downloads are large (50MB) and long-running (10-30s on mobile). Developers test on fast local connections where downloads complete instantly. Production failures:
- Mobile network drops mid-download
- User backgrounds app (mobile browsers suspend fetches)
- CDN CORS misconfiguration
- User hits "stop" button
- Browser closes tab during download

**How to avoid:**

1. **Implement resumable downloads with range requests:**
```javascript
async function downloadModelResumable(url, onProgress) {
  const cacheKey = `model-partial-${url}`;
  let downloaded = await getPartialDownload(cacheKey) || new Uint8Array();

  const headers = {};
  if (downloaded.length > 0) {
    headers['Range'] = `bytes=${downloaded.length}-`;
  }

  const response = await fetch(url, { headers });

  if (response.status === 206 || response.status === 200) {
    const reader = response.body.getReader();
    const chunks = [downloaded];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      onProgress(chunks.reduce((sum, c) => sum + c.length, 0));

      // Persist partial progress every 5MB
      if (chunks.length % 100 === 0) {
        await savePartialDownload(cacheKey, new Uint8Array(concatenate(chunks)));
      }
    }

    return new Uint8Array(concatenate(chunks));
  }
}
```

2. **Provide explicit failure UI:**
- Show download progress percentage
- "Cancel" button that cleans up partial state
- "Retry" button that resumes from last checkpoint
- "Use cloud recognition" fallback option

3. **Validate model integrity:**
```javascript
async function validateModel(modelData, expectedHash) {
  const hash = await crypto.subtle.digest('SHA-256', modelData);
  const hashHex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  if (hashHex !== expectedHash) {
    throw new Error('Model corrupted - hash mismatch');
  }
}
```

4. **Handle Vosk model creation failure:**
```javascript
async function createVoskModel(modelPath) {
  try {
    const model = await Vosk.createModel(modelPath);
    // Test model is actually usable
    const recognizer = await Vosk.createRecognizer(model, 16000);
    await recognizer.free();
    return model;
  } catch (err) {
    // "Failed to create a model" - common error from corrupted download
    if (err.message.includes('Failed to create')) {
      await clearModelCache();
      throw new Error('Model corrupted - please re-download');
    }
    throw err;
  }
}
```

**Warning signs:**

- Users report "stuck on loading screen"
- IndexedDB shows partial model data
- Errors: "Failed to create a model", "ConstArpaLm section reading failed"
- Download succeeds on WiFi, fails on mobile network
- Model works with absolute paths in testing, fails with relative paths in production

**Phase to address:**

Phase 1: Model Loading Infrastructure - implement before exposing to users. Resumable downloads + integrity validation are table stakes.

**Recovery plan:**

If production has broken models in user storage:
1. Implement version check on model load
2. Clear IndexedDB if version mismatch detected
3. Force fresh download with integrity check

---

### Pitfall 3: AudioWorklet Memory Leaks

**What goes wrong:**

Application works perfectly for 5 minutes, then becomes sluggish. After 45-60 minutes of continuous use, browser tab crashes with "out of memory". Memory profiling shows steady 1MB/20s leak. Vosk recognizer and audio buffers not properly released.

**Why it happens:**

Vosk's WASM/C++ layer requires explicit memory management. JavaScript garbage collection doesn't clean up:
- Vosk recognizer instances (must call `recognizer.free()`)
- Vosk model instances (must call `model.free()`)
- AudioWorklet buffers passed to recognizer (accumulate in WASM heap)

Developers accustomed to JavaScript's automatic GC forget to clean up. Common leak sources:
- Recognizer created on each audio chunk (should reuse one instance)
- Audio data copied to WASM without deallocation
- Model reloaded on recognizer restart (should cache)
- Event listeners on AudioWorklet not removed

**How to avoid:**

1. **Singleton pattern for recognizer:**
```javascript
class VoskRecognizerManager {
  constructor() {
    this.recognizer = null;
    this.model = null;
  }

  async initialize(modelPath) {
    if (this.model) return; // Already initialized

    this.model = await Vosk.createModel(modelPath);
    this.recognizer = await Vosk.createRecognizer(this.model, 16000);
  }

  async processAudio(audioData) {
    if (!this.recognizer) throw new Error('Not initialized');
    return await this.recognizer.acceptWaveform(audioData);
  }

  async destroy() {
    // CRITICAL: Free in reverse order of creation
    if (this.recognizer) {
      await this.recognizer.free();
      this.recognizer = null;
    }
    if (this.model) {
      await this.model.free();
      this.model = null;
    }
  }
}
```

2. **Cleanup on page unload:**
```javascript
window.addEventListener('beforeunload', async () => {
  await recognizerManager.destroy();
});

// Also cleanup on visibility change (mobile backgrounding)
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    await recognizerManager.destroy();
  } else {
    await recognizerManager.initialize(modelPath);
  }
});
```

3. **AudioWorklet buffer management:**
```javascript
// In AudioWorkletProcessor
process(inputs, outputs, parameters) {
  const audioData = inputs[0][0]; // Float32Array

  // WRONG: Passing Float32Array directly accumulates in WASM
  // this.recognizer.acceptWaveform(audioData);

  // RIGHT: Convert to Int16, process, release
  const int16Data = this.float32ToInt16(audioData);
  this.recognizer.acceptWaveform(int16Data);
  // int16Data will be GC'd by JavaScript engine

  return true;
}

float32ToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}
```

4. **Monitoring and warnings:**
```javascript
// Warn if memory usage increasing
if (performance.memory) {
  const checkMemory = () => {
    const used = performance.memory.usedJSHeapSize;
    const limit = performance.memory.jsHeapSizeLimit;

    if (used / limit > 0.9) {
      console.warn('Memory usage critical:', used / limit);
      // Consider auto-restart recognizer
    }
  };

  setInterval(checkMemory, 30000); // Check every 30s
}
```

**Warning signs:**

- Browser tab slows down after 30+ minutes
- Memory profiling shows steady increase (not sawtooth GC pattern)
- "Out of memory" crashes on long sessions
- Multiple recognizer instances in memory (DevTools heap snapshot)
- AudioWorklet processor accumulating buffers

**Phase to address:**

Phase 2: AudioWorklet Integration - implement cleanup patterns from the start. Memory leaks are hard to fix retroactively.

**Recovery plan:**

If users experiencing crashes:
1. Implement auto-restart every 30 minutes (recognizer.free() + recreate)
2. Add "Clear cache and reload" button
3. Monitor performance.memory and proactively restart

---

### Pitfall 4: Android 16KB Page Size Incompatibility

**What goes wrong:**

Application works on development devices (Pixel 6, older Samsung). Ships to production. Users with Pixel 8/9, newer Samsung devices (Android 15+) report immediate crashes: `UnsatisfiedLinkError` on Vosk library load. Native library compiled with 4KB page alignment fails on 16KB kernel devices.

**Why it happens:**

Android 15+ enforces 16KB page size support. Vosk's native libraries (distributed via npm/CDN) compiled with traditional 4KB alignment. Devices running 16KB kernels (Pixel 8/9, newer flagships) reject 4KB-aligned libraries.

This is a **recent breaking change** (late 2025). Developers testing on older devices don't encounter it. Google Play requires 16KB support as of late 2025.

**How to avoid:**

1. **Check Vosk build status:**
   - Issue #1752 and #2007 on alphacep/vosk-api track this
   - As of 2026-02-01, 16KB page size builds are work-in-progress
   - **Do not ship to production until Vosk releases 16KB-compatible builds**

2. **Device detection and fallback:**
```javascript
async function detectPageSize() {
  // Can't directly detect page size from JavaScript
  // Proxy: detect specific device models known to use 16KB
  const ua = navigator.userAgent;

  const is16KBDevice =
    /Pixel (8|9)/.test(ua) ||
    (/SM-S9/.test(ua) && /Android 1[5-9]/.test(ua)); // Samsung S23+ on Android 15+

  return is16KBDevice ? 16 : 4; // KB
}

async function initializeRecognition() {
  const pageSize = await detectPageSize();

  if (pageSize === 16) {
    // Check if Vosk has 16KB build available
    const has16KBBuild = await checkVosk16KBSupport();

    if (!has16KBBuild) {
      console.warn('Device requires 16KB page size, Vosk not compatible');
      return await initializeWebSpeechFallback();
    }
  }

  return await initializeVosk();
}
```

3. **Test on real devices:**
   - Pixel 8 or 9 (primary test case)
   - Samsung Galaxy S23+ with Android 15
   - Use BrowserStack/device farm for coverage

4. **Monitor Vosk releases:**
   - Subscribe to GitHub issues #1752, #2007
   - Test each Vosk release candidate for 16KB support
   - Update immediately when 16KB builds available

**Warning signs:**

- Works in development (Pixel 6, older devices)
- Crashes on newer devices (Pixel 8/9, S23+)
- Error: `UnsatisfiedLinkError: dlopen failed: ... page size ...`
- Android 15+ devices report library load failure
- Issue only affects native Vosk loading, not WASM (browser version)

**Phase to address:**

Phase 0: Feasibility Check - verify Vosk 16KB support exists before committing to Vosk. If not available, delay migration or plan Web Speech API fallback for affected devices.

**Recovery plan:**

If shipped without 16KB support:
1. Detect affected devices server-side (user-agent)
2. Serve Web Speech API version to 16KB devices
3. Show "Offline mode coming soon for your device" message
4. Update to 16KB Vosk build when available

---

### Pitfall 5: Real-Time Latency Budget Violation

**What goes wrong:**

Vosk initialization succeeds, recognition works, but latency exceeds 500ms requirement. User speaks "four score and seven", teleprompter scrolls 1 second later. On slower devices (iPhone SE, budget Android), latency reaches 1.5-2 seconds, making voice control unusable.

**Why it happens:**

Vosk's latency has multiple components developers overlook:
1. **AudioWorklet buffer accumulation** (128-1024 samples @ 16kHz = 8-64ms)
2. **Model right-context delay** (Vosk models with 42-frame context = 500ms wait for scoring)
3. **WASM inference time** (10-20ms CPU, longer on old devices)
4. **Worker thread communication** (postMessage roundtrip = 5-15ms)
5. **Main thread processing** (match finding, scroll calculation)

Total: 523-599ms in **best case**. On constrained devices: 800-2000ms.

Developers test on desktop/flagship phones (10ms inference) and hit 500ms target. Production devices (CPU throttling, background processes) exceed budget.

**How to avoid:**

1. **Choose small model with low right-context:**
   - vosk-model-small-en-us-0.15: 50MB, 10-frame context (~120ms latency)
   - Avoid large models (1.8GB) - 42-frame context = 500ms inherent delay
   - Trade accuracy (85-90% small model vs 95%+ large) for responsiveness

2. **Optimize AudioWorklet buffering:**
```javascript
// AudioWorkletProcessor
constructor(options) {
  super();
  this.bufferSize = 4096; // 256ms @ 16kHz - balance latency vs processing overhead
  this.buffer = new Float32Array(this.bufferSize);
  this.bufferIndex = 0;
}

process(inputs, outputs, parameters) {
  const input = inputs[0][0];

  // Accumulate to buffer size, then process
  for (let i = 0; i < input.length; i++) {
    this.buffer[this.bufferIndex++] = input[i];

    if (this.bufferIndex === this.bufferSize) {
      this.processBuffer(this.buffer);
      this.bufferIndex = 0;
    }
  }

  return true;
}
```

3. **Measure end-to-end latency:**
```javascript
class LatencyMonitor {
  constructor() {
    this.timestamps = [];
  }

  recordSpoken(transcript, audioTimestamp) {
    this.timestamps.push({
      transcript,
      audioTimestamp,
      recognizedAt: performance.now()
    });
  }

  recordScrolled(position, scrollTimestamp) {
    // Match with spoken event
    const latency = scrollTimestamp - this.findAudioTimestamp(position);

    if (latency > 500) {
      console.warn('Latency budget exceeded:', latency, 'ms');
    }

    return latency;
  }

  getStats() {
    const latencies = this.timestamps.map(t => t.recognizedAt - t.audioTimestamp);
    return {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99)
    };
  }
}
```

4. **Device-specific model selection:**
```javascript
async function selectModel() {
  const deviceTier = await detectDeviceTier();

  if (deviceTier === 'high') {
    // Modern flagship: can handle medium model
    return 'vosk-model-en-us-0.22'; // Better accuracy, 20ms inference
  } else if (deviceTier === 'medium') {
    // Mid-range: small model
    return 'vosk-model-small-en-us-0.15'; // 10ms inference
  } else {
    // Budget/old device: fallback to Web Speech API
    return null; // Use cloud recognition
  }
}

async function detectDeviceTier() {
  // Proxy for device performance
  const cores = navigator.hardwareConcurrency || 2;
  const memory = navigator.deviceMemory || 2; // GB

  if (cores >= 8 && memory >= 4) return 'high';
  if (cores >= 4 && memory >= 2) return 'medium';
  return 'low';
}
```

5. **Reduce model context (advanced):**
   - Vosk models trained with 42-frame right context have inherent 500ms delay
   - Request or train models with 10-frame context (Zamia models use this)
   - Tradeoff: slightly lower accuracy, much better responsiveness
   - Requires custom model training - document as future optimization

**Warning signs:**

- Works on development machine (MacBook, flagship phone)
- Users report "sluggish response"
- Latency measurements show p95 > 500ms
- Older devices (iPhone SE, Pixel 3a) exceed 1 second
- Latency increases over time (might be coupled with memory leak)

**Phase to address:**

Phase 2: AudioWorklet Integration - measure latency from day one. Optimize before accuracy.

**Recovery plan:**

If latency too high in production:
1. Offer "High accuracy" (current model) vs "Fast response" (smaller model) toggle
2. Auto-detect device tier and select appropriate model
3. Fall back to Web Speech API on devices that can't meet latency budget

---

### Pitfall 6: Microphone Permission Handling

**What goes wrong:**

User denies microphone permission. Application shows blank screen or "Loading..." indefinitely. User grants permission in browser settings, reloads page, still doesn't work (permission granted but app didn't re-request). On iOS Safari, permission prompt requires user gesture but app auto-initializes on load.

**Why it happens:**

Web Speech API and Vosk both require `getUserMedia()` but handle failures differently:
- Web Speech API: single permission prompt, clear error if denied
- Vosk: requires AudioWorklet + getUserMedia, more complex initialization
- iOS Safari: requires user gesture for permission prompt
- Permission state persists across reloads but apps don't check it

Developers test with permission already granted (from previous session) and never hit denial path.

**How to avoid:**

1. **Check permission state before initializing:**
```javascript
async function checkMicrophonePermission() {
  if (!navigator.permissions?.query) {
    // Older browsers: attempt getUserMedia to trigger prompt
    return 'prompt';
  }

  const result = await navigator.permissions.query({ name: 'microphone' });
  return result.state; // 'granted', 'denied', or 'prompt'
}

async function initializeRecognition() {
  const permissionState = await checkMicrophonePermission();

  if (permissionState === 'denied') {
    showPermissionDeniedUI();
    return;
  }

  if (permissionState === 'prompt') {
    // Show UI explaining why we need permission
    showPermissionRequestUI();
    // Wait for user gesture
    await waitForUserGesture();
  }

  // Now request microphone
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    await initializeVosk(stream);
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showPermissionDeniedUI();
    } else if (err.name === 'NotFoundError') {
      showNoMicrophoneUI();
    } else {
      throw err;
    }
  }
}
```

2. **User gesture requirement (iOS Safari):**
```javascript
function waitForUserGesture() {
  return new Promise(resolve => {
    // Show "Tap to enable microphone" button
    const button = document.getElementById('enable-mic-button');
    button.style.display = 'block';

    button.addEventListener('click', () => {
      button.style.display = 'none';
      resolve();
    }, { once: true });
  });
}
```

3. **Permission change listener:**
```javascript
async function watchPermissionChanges() {
  const result = await navigator.permissions.query({ name: 'microphone' });

  result.addEventListener('change', async () => {
    if (result.state === 'granted') {
      // User granted permission in settings - reinitialize
      await initializeRecognition();
    } else if (result.state === 'denied') {
      // User revoked permission - cleanup
      await cleanupRecognition();
      showPermissionDeniedUI();
    }
  });
}
```

4. **Clear UI states:**
```javascript
function showPermissionDeniedUI() {
  // Show instructions for enabling in browser settings
  document.getElementById('error-message').innerHTML = `
    <h3>Microphone Access Required</h3>
    <p>Voice control requires microphone access.</p>
    <ol>
      <li>Click the lock icon in your address bar</li>
      <li>Change microphone to "Allow"</li>
      <li>Reload this page</li>
    </ol>
  `;
}
```

**Warning signs:**

- Users report "stuck on loading" (permission denied but not handled)
- iOS users report "nothing happens" (no user gesture before getUserMedia)
- Permission granted in settings but app doesn't work (no reload or re-init)
- Different behavior on first visit vs returning visit

**Phase to address:**

Phase 2: AudioWorklet Integration - handle permission flows before recognition logic.

---

### Pitfall 7: Model CORS and CDN Configuration

**What goes wrong:**

Model download fails with CORS error despite CDN configured for CORS. Works in development (local server), fails in production (CDN). Or: model downloads in Chrome, fails in Firefox/Safari. Or: model downloads on WiFi, fails on mobile (CDN not optimized for slow connections).

**Why it happens:**

50MB model files require special CDN configuration:
- CORS headers must include `Access-Control-Allow-Origin`
- Range request support needed for resumable downloads
- Compression (gzip/brotli) can corrupt binary files if misconfigured
- CDN caching can serve stale CORS headers

Common misconfigurations:
- CORS enabled for `/models/*.json` but not `/models/*.zip`
- Range requests disabled (needed for resume)
- Content-Type incorrect (application/octet-stream required for binary)
- Cache-Control too aggressive (serves 404 from cache)

**How to avoid:**

1. **Validate CDN configuration:**
```javascript
async function validateModelCDN(modelUrl) {
  // Check CORS headers
  const headResponse = await fetch(modelUrl, { method: 'HEAD' });
  const corsHeader = headResponse.headers.get('Access-Control-Allow-Origin');

  if (!corsHeader || (corsHeader !== '*' && corsHeader !== window.location.origin)) {
    console.error('CORS not configured:', modelUrl);
    return false;
  }

  // Check Range request support
  const acceptRanges = headResponse.headers.get('Accept-Ranges');
  if (acceptRanges !== 'bytes') {
    console.warn('Range requests not supported - downloads not resumable');
  }

  // Check Content-Type
  const contentType = headResponse.headers.get('Content-Type');
  if (!contentType.includes('application/octet-stream') &&
      !contentType.includes('application/zip')) {
    console.warn('Unexpected Content-Type:', contentType);
  }

  return true;
}
```

2. **CDN configuration checklist:**
```
# CloudFlare example
Cache-Control: public, max-age=31536000, immutable
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Max-Age: 86400
Accept-Ranges: bytes
Content-Type: application/octet-stream
Content-Encoding: (none) # Do NOT gzip binary model files
```

3. **Fallback CDN strategy:**
```javascript
const MODEL_URLS = [
  'https://cdn1.example.com/models/vosk-model-small-en-us-0.15.zip',
  'https://cdn2.example.com/models/vosk-model-small-en-us-0.15.zip',
  'https://github.com/releases/...' // GitHub releases as backup
];

async function downloadModelWithFallback() {
  for (const url of MODEL_URLS) {
    try {
      const model = await downloadModel(url);
      return model;
    } catch (err) {
      console.warn('Failed to download from', url, err);
      // Try next CDN
    }
  }

  throw new Error('All model CDNs failed');
}
```

4. **Development vs production URL handling:**
```javascript
function getModelUrl() {
  if (window.location.hostname === 'localhost') {
    // Development: local server (no CORS needed)
    return '/models/vosk-model-small-en-us-0.15.zip';
  } else {
    // Production: CDN with CORS
    return 'https://cdn.example.com/models/vosk-model-small-en-us-0.15.zip';
  }
}
```

**Warning signs:**

- CORS errors in production but not development
- Model downloads in Chrome, fails in Firefox/Safari
- CDN logs show 200 responses but browser shows errors
- Range request errors (missing Accept-Ranges header)
- Download speed much slower than expected (CDN not optimized)

**Phase to address:**

Phase 1: Model Loading Infrastructure - test CDN configuration before first deployment.

---

### Pitfall 8: API Migration Compatibility Gaps

**What goes wrong:**

Vosk marketed as "drop-in replacement for Web Speech API" but subtle differences break existing code. Events fire at different times, transcript format differs, continuous recognition behaves differently. Existing position tracking logic assumes Web Speech API timing/format and fails with Vosk.

**Why it happens:**

Web Speech API and Vosk have **fundamentally different architectures**:

| Aspect | Web Speech API | Vosk |
|--------|----------------|------|
| Results | `result` + `interim` events | `acceptWaveform()` returns JSON |
| Timing | Variable (cloud processing) | Consistent (local processing) |
| Continuous | `continuous: true` keeps listening | Must manually feed audio chunks |
| Restart | Auto-restarts on silence | Must detect silence and restart |
| Confidence | Per-word confidence scores | Per-result confidence (or none) |
| Alternatives | Multiple alternatives per word | Single best hypothesis |

Developers expect identical behavior and discover differences only in integration testing.

**How to avoid:**

1. **Create compatibility wrapper:**
```javascript
class SpeechRecognitionAdapter {
  constructor(engine = 'webspeech') {
    this.engine = engine;
    if (engine === 'webspeech') {
      this.recognition = new webkitSpeechRecognition();
    } else {
      this.recognition = new VoskRecognition(); // Custom wrapper
    }
  }

  start() {
    return this.recognition.start();
  }

  stop() {
    return this.recognition.stop();
  }

  addEventListener(event, callback) {
    if (this.engine === 'webspeech') {
      this.recognition.addEventListener(event, callback);
    } else {
      // Map Vosk events to Web Speech API events
      this.recognition.on(this.mapEvent(event), callback);
    }
  }

  mapEvent(webSpeechEvent) {
    const eventMap = {
      'result': 'transcript',
      'end': 'stopped',
      'error': 'error'
    };
    return eventMap[webSpeechEvent] || webSpeechEvent;
  }
}
```

2. **Normalize transcript format:**
```javascript
class VoskRecognition extends EventTarget {
  async acceptWaveform(audioData) {
    const result = await this.recognizer.acceptWaveform(audioData);

    if (result) {
      const voskResult = JSON.parse(await this.recognizer.result());

      // Convert Vosk format to Web Speech API format
      const webSpeechResult = {
        isFinal: true,
        results: [[{
          transcript: voskResult.text,
          confidence: voskResult.confidence || 0.9 // Vosk may not provide confidence
        }]]
      };

      this.dispatchEvent(new CustomEvent('result', {
        detail: webSpeechResult
      }));
    } else {
      // Partial result
      const partialResult = JSON.parse(await this.recognizer.partialResult());

      const webSpeechResult = {
        isFinal: false,
        results: [[{
          transcript: partialResult.partial,
          confidence: 0.5 // Interim results have lower confidence
        }]]
      };

      this.dispatchEvent(new CustomEvent('result', {
        detail: webSpeechResult
      }));
    }
  }
}
```

3. **Document breaking changes:**
```markdown
## Web Speech API to Vosk Migration Breaking Changes

### 1. Continuous Recognition
Web Speech API: Set `continuous = true`, handles automatically
Vosk: Must feed audio chunks continuously, detect silence manually

### 2. Confidence Scores
Web Speech API: Per-word confidence in `result.confidence`
Vosk: May not provide confidence, or only per-result

### 3. Result Timing
Web Speech API: Variable timing (cloud latency)
Vosk: Consistent timing (local processing) - may need to adjust timeouts

### 4. Alternatives
Web Speech API: `results[0][0-4]` for multiple alternatives
Vosk: Single best hypothesis (configure with `alternatives: N`)

### 5. Error Handling
Web Speech API: `error` event with `error.error` type
Vosk: Promise rejections, must wrap in try/catch
```

4. **Feature detection and graceful degradation:**
```javascript
async function initializeRecognition() {
  const features = {
    hasWebSpeech: 'webkitSpeechRecognition' in window,
    hasVosk: await checkVoskSupport(),
    hasAudioWorklet: 'AudioWorklet' in window,
    hasIndexedDB: 'indexedDB' in window
  };

  if (features.hasVosk && features.hasAudioWorklet && features.hasIndexedDB) {
    return new SpeechRecognitionAdapter('vosk');
  } else if (features.hasWebSpeech) {
    return new SpeechRecognitionAdapter('webspeech');
  } else {
    throw new Error('No speech recognition available');
  }
}
```

**Warning signs:**

- Existing tests pass with Web Speech API, fail with Vosk
- Timing assumptions in position tracking break
- Confidence scores used for filtering produce different results
- Continuous recognition stops unexpectedly
- Event listeners not firing

**Phase to address:**

Phase 3: Web Speech API Compatibility Layer - create adapter before swapping engines.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip quota check, assume space available | Faster initial load | Users with low storage hit QuotaExceededError loop | Never - check is fast |
| Load model without integrity validation | Simpler code | Corrupted downloads cause "Failed to create model" | Never - hash check is cheap |
| Single CDN URL without fallback | Simpler configuration | CDN outage breaks all users | Development only |
| No memory leak prevention (skip .free() calls) | Simpler code structure | Tab crashes after 45-60 minutes | Never - cleanup is critical |
| Use large model for best accuracy | Higher accuracy (95%+ vs 85-90%) | 500ms latency budget violated, poor UX | High-end devices only, offer as opt-in |
| Skip device tier detection | Everyone gets same experience | Budget devices have terrible latency | Small user base, known device types |
| No permission state checking | Simpler initialization flow | Users stuck on blank screen if denied | Never - breaks entire feature |
| Assume Web Speech API compatibility | Faster migration | Subtle bugs in production | Prototype only, must test thoroughly |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Creating new recognizer per audio chunk | Memory leak, increasing latency | Singleton recognizer, reuse instance | Immediately, 1MB/20s leak |
| Loading large model on all devices | Budget devices exceed latency budget | Device tier detection, model selection | p95 latency >1s on old devices |
| No buffer size optimization | High latency or high CPU usage | Tune buffer size (4096 samples = 256ms) | Real-time performance suffers |
| Blocking main thread during model load | UI freezes for 2-5 seconds | Load in Web Worker, show progress | User perceives app as crashed |
| No partial download checkpoints | Network failure = restart from 0 | Save progress every 5MB | Mobile network interruptions |
| AudioWorklet without SharedArrayBuffer | High postMessage overhead | Use SharedArrayBuffer if available | Continuous processing shows lag |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| IndexedDB storage | Store raw model blob without versioning | Version models, clear old on update |
| AudioWorklet initialization | Inline processor code in main bundle | Separate .js file, loaded with `addModule()` |
| Model paths | Relative paths work in dev, fail in production | Absolute paths or properly resolved URLs |
| Microphone stream | Request new stream for each session | Reuse stream, stop/start tracks as needed |
| CORS for models | Assume same-origin or public CDN works | Explicit CORS configuration, test all browsers |
| Web Speech API replacement | Change engine without compatibility layer | Wrap both in adapter, normalize events/format |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No download progress indicator | "Is it frozen?" - users reload mid-download | Show percentage + estimated time remaining |
| Permission denied = blank screen | Users don't know what went wrong | Clear error message + instructions to enable |
| No offline indicator | Users think app broken when offline | Show "Working offline" badge when model loaded |
| Model download on mobile without warning | Unexpected 50MB data usage | Warn on cellular, prompt for WiFi/continue |
| No fallback for incompatible devices | Feature completely unavailable | Graceful degradation to Web Speech API |
| Loading model on every page load | 2-5 second delay every time | Cache in IndexedDB, load once per session |

## "Looks Done But Isn't" Checklist

- [ ] **Model loading:** Download succeeds but verify integrity (hash check) - corrupted models fail silently
- [ ] **Quota management:** Model stored but verify quota available before download - some devices silently fail
- [ ] **Memory cleanup:** Recognizer works but verify `.free()` called on cleanup - leaks take 30+ min to manifest
- [ ] **Permission handling:** Works when granted but verify denial flow - stuck users can't recover
- [ ] **CDN configuration:** Works on localhost but verify CORS on production CDN - different browsers behave differently
- [ ] **Latency measurement:** Works smoothly but verify p95 latency <500ms - outlier devices exceed budget
- [ ] **Device compatibility:** Works on test devices but verify Pixel 8/9 (16KB page size) - newer devices crash
- [ ] **Resume after backgrounding:** Works initially but verify iOS Safari resume after app backgrounded - memory eviction

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Model quota exceeded | LOW | 1. Detect quota error 2. Offer smaller model or clear old data 3. Re-download |
| Corrupted model in storage | LOW | 1. Detect "Failed to create model" 2. Clear IndexedDB 3. Force re-download with hash check |
| Memory leak in production | MEDIUM | 1. Implement auto-restart every 30 min 2. Monitor performance.memory 3. Release fixed version |
| 16KB page size incompatibility | HIGH | 1. Device detection 2. Fallback to Web Speech API 3. Wait for Vosk 16KB builds 4. Deploy update |
| Latency budget violation | MEDIUM | 1. Device tier detection 2. Smaller model for slow devices 3. Fallback to Web Speech for very slow |
| CORS misconfiguration | LOW | 1. Fix CDN headers 2. Invalidate cache 3. Users auto-recover on next load |
| Permission denied loop | LOW | 1. Add permission state check 2. Show clear UI 3. Watch permission changes |
| API compatibility issues | HIGH | 1. Create compatibility wrapper 2. Test all event flows 3. Deploy adapter layer |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Model quota exceeded | Phase 1: Model Loading | Test on device with <100MB free storage |
| Model download failure | Phase 1: Model Loading | Kill network mid-download, verify resume works |
| AudioWorklet memory leak | Phase 2: AudioWorklet | Run for 60 minutes, verify memory stable |
| 16KB page size crash | Phase 0: Feasibility | Test on Pixel 8/9, Samsung S23+ with Android 15 |
| Latency budget violation | Phase 2: AudioWorklet | Measure p95 latency on Pixel 3a, iPhone SE |
| Microphone permission | Phase 2: AudioWorklet | Test permission denial, verify clear error UI |
| Model CORS failure | Phase 1: Model Loading | Test from production domain, all browsers |
| API compatibility gaps | Phase 3: Compatibility Layer | Run existing test suite with Vosk engine |

## Sources

### Web Research (MEDIUM confidence)

- [vosk-browser issues #58, #89, #94](https://github.com/ccoreilly/vosk-browser/issues) - Performance delays, model loading failures
- [Vosk API issues #2007, #1752](https://github.com/alphacep/vosk-api/issues) - Android 16KB page size alignment requirement
- [Vosk memory leak issues #44, #209, #1351, #83](https://github.com/alphacep/vosk-api/issues) - Memory accumulation in long sessions
- [IndexedDB quota limits - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) - Browser storage quotas
- [Vosk latency optimization](https://alphacephei.com/nsh/2020/11/27/latency.html) - Official guidance on reducing latency
- [AudioWorklet compatibility](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) - Browser support and secure context requirements
- [Web Speech API offline discussion](https://github.com/WICG/speech-api/issues/108) - Differences from cloud-based API
- [Vosk model requirements](https://alphacephei.com/vosk/models) - Model sizes and accuracy tradeoffs

### Technical Specifications (HIGH confidence)

- Safari 7-day storage eviction: Documented in WebKit blog posts (2020+)
- Android 16KB page size requirement: Google Play policy (late 2025)
- AudioWorklet secure context requirement: Web Audio API specification
- IndexedDB quota formulas: Storage API specification

---

*Research mode: Pitfalls - Vosk Integration*
*Confidence: MEDIUM - Based on WebSearch + official sources, should verify with Context7 and production testing*
*Researched: 2026-02-01*
