# Architecture Research: Vosk WebAssembly Integration

**Domain:** Offline speech recognition via Vosk WASM in teleprompter
**Researched:** 2026-02-01
**Confidence:** MEDIUM

## Executive Summary

Vosk-browser provides WebAssembly-based speech recognition that can replace Web Speech API for offline/Firefox support. The integration requires:

1. **VoskRecognizer** - Drop-in replacement for SpeechRecognizer (same callback API)
2. **VoskModelLoader** - Model download, caching, and version management
3. **VoskAudioProcessor** - AudioWorklet for audio capture (replaces ScriptProcessorNode)
4. **Ring buffer** - Bridge 128-frame AudioWorklet chunks to larger Vosk processing buffers

Key architectural decision: **Use Vosklet over vosk-browser** - cleaner API, AudioWorklet support, better maintained.

**Integration strategy:** Adapter pattern - VoskRecognizer implements same interface as SpeechRecognizer, making it a true drop-in replacement with zero changes to WordMatcher, PositionTracker, or ScrollController.

## Current Architecture (v1.0)

```
getUserMedia → SpeechRecognizer → WordMatcher → PositionTracker → ScrollController
                     ↓
              AudioVisualizer
```

**SpeechRecognizer interface** (voice/SpeechRecognizer.js):
```javascript
class SpeechRecognizer {
  constructor({ lang, onTranscript, onError, onStateChange }) { }
  start() { }
  stop() { }
  pause() { }
  resume() { }
  isListening() { }
  isPaused() { }
  static isSupported() { }
  static getPlatform() { }
}

// Callbacks:
// onTranscript(text: string, isFinal: boolean)
// onError(errorType: string, isFatal: boolean)
// onStateChange(state: 'idle' | 'listening' | 'retrying' | 'error')
```

**Integration points:**
- `AudioVisualizer` connects to same `mediaStream` (no changes needed)
- `WordMatcher` receives transcripts via `onTranscript` callback (no changes)
- UI layer toggles between recognizers based on browser support/user preference

## Vosk Architecture (v1.2 Target)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Main Thread                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐   ┌──────────────────┐   ┌────────────┐  │
│  │  VoskRecognizer  │   │ VoskModelLoader  │   │ AudioViz   │  │
│  │                  │   │                  │   │            │  │
│  │ - start()        │   │ - download()     │   │ - start()  │  │
│  │ - stop()         │   │ - cache()        │   │ - draw()   │  │
│  │ - onTranscript   │   │ - versions       │   │            │  │
│  └────────┬─────────┘   └──────────────────┘   └──────┬─────┘  │
│           │                                             │        │
│           │ MessagePort                                 │        │
│           ↓                                             │        │
├───────────┼─────────────────────────────────────────────┼────────┤
│           │          AudioWorklet Thread                │        │
├───────────┼─────────────────────────────────────────────┼────────┤
│           │                                             │        │
│  ┌────────┴─────────┐   ┌──────────────┐   ┌──────────┴─────┐  │
│  │ VoskProcessor    │   │ RingBuffer   │   │ VisualizerNode │  │
│  │ (AudioWorklet)   │   │              │   │                │  │
│  │                  │   │ 128 → 8192   │   │ frequency data │  │
│  │ - process()      │←──│ accumulator  │   │                │  │
│  └────────┬─────────┘   └──────────────┘   └────────────────┘  │
│           │                                                      │
│           ↓                                                      │
├───────────┼──────────────────────────────────────────────────────┤
│           │           Web Worker Thread                          │
├───────────┼──────────────────────────────────────────────────────┤
│           │                                                      │
│  ┌────────┴────────┐                                             │
│  │   Vosk WASM     │                                             │
│  │   (vosklet.js)  │                                             │
│  │                 │                                             │
│  │ - createModel() │                                             │
│  │ - recognizer    │                                             │
│  │ - acceptWaveform│                                             │
│  └─────────────────┘                                             │
│           ↓                                                      │
│     Recognition events                                           │
│     ('result', 'partialresult')                                  │
│           ↑                                                      │
└───────────┼──────────────────────────────────────────────────────┘
            │
      Back to Main Thread
      via MessagePort
```

## Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **VoskRecognizer** | Drop-in replacement for SpeechRecognizer. Manages lifecycle, exposes same callback API | Class wrapping Vosklet module, translates Vosk events to SpeechRecognizer callbacks |
| **VoskModelLoader** | Download model files, cache in IndexedDB, manage versions, verify integrity | Static methods for model CRUD, IndexedDB wrapper, progress callbacks |
| **VoskAudioProcessor** | AudioWorklet processor - captures mic audio in 128-frame chunks, accumulates to buffer size Vosk expects | AudioWorkletProcessor subclass with ring buffer, posts audio to main thread |
| **RingBuffer** | Bridges AudioWorklet's 128-frame output to Vosk's preferred buffer size (4096-8192 frames) | Circular buffer in AudioWorklet global scope, prevents overflow |
| **Vosklet Module** | WebAssembly Vosk runtime, runs in Web Worker, processes audio and emits recognition events | Loaded via `loadVosklet()`, creates model/recognizer in worker |

## Data Flow: Mic to Transcript

### Initialization Flow

```
1. User clicks "Start with Vosk"
   ↓
2. VoskModelLoader.ensureModel(modelUrl)
   - Check IndexedDB for cached model
   - If missing: fetch from CDN with progress
   - Store in IndexedDB with version metadata
   ↓
3. VoskRecognizer.start()
   - await loadVosklet() (loads WASM module)
   - await module.createModel(modelBlob)
   - await module.createRecognizer(model, sampleRate)
   - Setup event listeners (result, partialresult)
   ↓
4. getUserMedia({ audio: true })
   ↓
5. audioContext.audioWorklet.addModule('vosk-processor.js')
   ↓
6. Create VoskAudioProcessor node
   - new AudioWorkletNode(context, 'vosk-processor')
   - Connect: mediaStreamSource → voskProcessor
   ↓
7. VoskAudioProcessor accumulates audio in ring buffer
   ↓
8. When buffer reaches threshold (e.g., 8192 frames):
   - Post audio chunk to main thread via port.postMessage()
   ↓
9. VoskRecognizer receives audio chunk
   - recognizer.acceptWaveform(audioData)
   ↓
10. Vosk WASM processes in Web Worker
    - Emits 'partialresult' events (interim)
    - Emits 'result' events (final)
   ↓
11. VoskRecognizer translates events to callbacks
    - partialresult → onTranscript(text, false)
    - result → onTranscript(text, true)
   ↓
12. WordMatcher receives transcripts (unchanged from v1.0)
```

### Runtime Audio Flow

```
Microphone
    ↓ (MediaStream)
AudioContext.createMediaStreamSource()
    ↓
VoskAudioProcessor (AudioWorklet)
    ↓ (128 frames per quantum)
RingBuffer.push(frames)
    ↓ (accumulates until threshold)
port.postMessage({ audio: Float32Array })
    ↓ (MessagePort to main thread)
VoskRecognizer.handleAudioChunk()
    ↓
voskRecognizer.acceptWaveform(audioData)
    ↓ (Web Worker)
Vosk WASM inference
    ↓
addEventListener('partialresult', e => { ... })
addEventListener('result', e => { ... })
    ↓
onTranscript(text, isFinal) callback
    ↓
WordMatcher (existing v1.0 code)
```

## Recommended Project Structure

```
src/
├── voice/
│   ├── SpeechRecognizer.js          # v1.0 (Web Speech API)
│   ├── VoskRecognizer.js            # v1.2 (Vosk adapter)
│   ├── vosk/
│   │   ├── VoskModelLoader.js       # Model download/caching
│   │   ├── vosk-processor.js        # AudioWorklet processor
│   │   └── ring-buffer.js           # Circular buffer helper
│   └── AudioVisualizer.js           # Unchanged (uses mediaStream)
├── matching/
│   └── WordMatcher.js               # Unchanged (agnostic to recognizer)
└── scroll/
    ├── PositionTracker.js           # Unchanged
    └── ScrollController.js          # Unchanged
```

### Structure Rationale

- **voice/vosk/** subfolder - Isolates Vosk-specific code, keeps `voice/` clean
- **VoskRecognizer.js at same level as SpeechRecognizer.js** - Emphasizes they're alternatives
- **vosk-processor.js separate file** - AudioWorklet requires separate script (loaded via `addModule`)
- **ring-buffer.js** - Reusable utility, could be used by other audio processing features
- **Existing components unchanged** - Adapter pattern ensures zero changes to downstream

## Architectural Patterns

### Pattern 1: Adapter Pattern (VoskRecognizer)

**What:** VoskRecognizer implements SpeechRecognizer's interface exactly, translating Vosk events to expected callbacks.

**When to use:** When integrating a library with different API surface into existing architecture.

**Trade-offs:**
- **Pro:** Zero changes to downstream consumers (WordMatcher, PositionTracker, etc.)
- **Pro:** Easy A/B testing (toggle between recognizers)
- **Pro:** Vosk-specific complexity hidden behind familiar interface
- **Con:** May hide Vosk-specific features (speaker ID, word-level timestamps)

**Example:**
```javascript
class VoskRecognizer {
  constructor({ lang, onTranscript, onError, onStateChange }) {
    this._lang = lang;
    this._onTranscript = onTranscript;
    this._onError = onError;
    this._onStateChange = onStateChange;

    // Vosk-specific internal state
    this._module = null;
    this._model = null;
    this._recognizer = null;
    this._audioProcessor = null;
    this._shouldBeListening = false;
  }

  async start() {
    try {
      this._shouldBeListening = true;
      this._onStateChange?.('loading'); // New state for model loading

      // Ensure model is cached
      const modelBlob = await VoskModelLoader.ensureModel(this._lang);

      // Load Vosklet module
      this._module = await loadVosklet();

      // Create model and recognizer
      this._model = await this._module.createModel(modelBlob, 'model', this._lang);
      this._recognizer = await this._module.createRecognizer(this._model, 16000);

      // Setup event listeners (Vosk API)
      this._recognizer.addEventListener('partialresult', (e) => {
        this._onTranscript?.(e.detail.partial, false);
      });

      this._recognizer.addEventListener('result', (e) => {
        this._onTranscript?.(e.detail.text, true);
      });

      // Setup audio pipeline
      await this._setupAudioPipeline();

      this._onStateChange?.('listening');
    } catch (err) {
      this._onError?.(err.message, true);
      this._onStateChange?.('error');
    }
  }

  stop() {
    this._shouldBeListening = false;
    this._audioProcessor?.disconnect();
    this._recognizer?.free?.(); // Cleanup Vosk resources
    this._onStateChange?.('idle');
  }

  isListening() {
    return this._shouldBeListening;
  }

  // ... pause(), resume(), static methods
}
```

### Pattern 2: Ring Buffer for Buffer Size Mismatch

**What:** AudioWorklet processes 128 frames per quantum. Vosk expects larger chunks (4096-8192 frames) for efficient processing. Ring buffer accumulates frames until threshold reached.

**When to use:** Any time AudioWorklet output doesn't match consumer's expected buffer size.

**Trade-offs:**
- **Pro:** Efficient processing (fewer Vosk calls)
- **Pro:** Lower CPU usage (batch processing)
- **Con:** Adds latency (must wait for buffer to fill)
- **Con:** Memory overhead (circular buffer)

**Example:**
```javascript
// vosk-processor.js (AudioWorklet)
class VoskAudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Ring buffer config
    this.bufferSize = options.processorOptions?.bufferSize || 8192;
    this.ringBuffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.frameCount = 0;

    // Port for sending to main thread
    this.port.onmessage = this.handleMessage.bind(this);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channel = input[0]; // Mono channel
    const framesAvailable = channel.length; // Always 128 in spec

    // Write to ring buffer
    for (let i = 0; i < framesAvailable; i++) {
      this.ringBuffer[this.writeIndex] = channel[i];
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      this.frameCount++;

      // When buffer is full, send to main thread
      if (this.frameCount >= this.bufferSize) {
        this.sendBufferToMainThread();
        this.frameCount = 0;
      }
    }

    return true; // Keep processor alive
  }

  sendBufferToMainThread() {
    // Copy buffer (avoid race conditions)
    const audioChunk = new Float32Array(this.bufferSize);

    // Handle wrap-around in ring buffer
    if (this.writeIndex === 0) {
      // Simple case: buffer is contiguous
      audioChunk.set(this.ringBuffer);
    } else {
      // Wrapped case: copy tail then head
      const tailSize = this.bufferSize - this.writeIndex;
      audioChunk.set(this.ringBuffer.subarray(this.writeIndex), 0);
      audioChunk.set(this.ringBuffer.subarray(0, this.writeIndex), tailSize);
    }

    // Transfer to main thread (zero-copy)
    this.port.postMessage({ audio: audioChunk }, [audioChunk.buffer]);
  }
}

registerProcessor('vosk-processor', VoskAudioProcessor);
```

### Pattern 3: Progressive Model Loading with Caching

**What:** Model files are large (40-200MB). Download with progress reporting, cache in IndexedDB, verify integrity.

**When to use:** Any ML model loading in browser (Whisper, Vosk, Transformers.js).

**Trade-offs:**
- **Pro:** Offline support after first load
- **Pro:** User sees progress (not stuck at blank screen)
- **Pro:** Integrity check prevents corrupt models
- **Con:** First load is slow (unavoidable)
- **Con:** IndexedDB API is complex

**Example:**
```javascript
// VoskModelLoader.js
class VoskModelLoader {
  static MODEL_DB_NAME = 'vosk-models';
  static MODEL_STORE_NAME = 'models';

  /**
   * Ensure model is available (download if needed)
   * @param {string} modelUrl - URL to model file (tar.gz or directory)
   * @param {Function} onProgress - Progress callback (bytesLoaded, bytesTotal)
   * @returns {Promise<Blob>} Model blob ready for Vosklet
   */
  static async ensureModel(modelUrl, onProgress = null) {
    // Check cache first
    const cachedModel = await this._getFromCache(modelUrl);
    if (cachedModel) {
      onProgress?.(100, 100);
      return cachedModel;
    }

    // Download with progress
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`Failed to fetch model: ${response.statusText}`);

    const contentLength = parseInt(response.headers.get('content-length') || '0');
    const reader = response.body.getReader();
    const chunks = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      receivedLength += value.length;
      onProgress?.(receivedLength, contentLength);
    }

    // Combine chunks into Blob
    const modelBlob = new Blob(chunks);

    // Cache for next time
    await this._saveToCache(modelUrl, modelBlob);

    return modelBlob;
  }

  static async _getFromCache(modelUrl) {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.MODEL_STORE_NAME, 'readonly');
      const store = tx.objectStore(this.MODEL_STORE_NAME);
      const request = store.get(modelUrl);

      request.onsuccess = () => resolve(request.result?.blob || null);
      request.onerror = () => reject(request.error);
    });
  }

  static async _saveToCache(modelUrl, blob) {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.MODEL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(this.MODEL_STORE_NAME);
      const request = store.put({ url: modelUrl, blob, timestamp: Date.now() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  static async _openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.MODEL_DB_NAME, 1);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.MODEL_STORE_NAME)) {
          db.createObjectStore(this.MODEL_STORE_NAME, { keyPath: 'url' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async clearCache() {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.MODEL_STORE_NAME, 'readwrite');
      const request = tx.objectStore(this.MODEL_STORE_NAME).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  static async getCacheSize() {
    const db = await this._openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.MODEL_STORE_NAME, 'readonly');
      const store = tx.objectStore(this.MODEL_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const totalBytes = request.result.reduce((sum, item) => sum + item.blob.size, 0);
        resolve(totalBytes);
      };
      request.onerror = () => reject(request.error);
    });
  }
}
```

## Integration Points

### 1. SpeechRecognizer Interface Compliance

**Contract:**
```javascript
// Constructor
new Recognizer({ lang, onTranscript, onError, onStateChange })

// Methods
start()           // Start listening
stop()            // Stop listening
pause()           // Pause (visibility change)
resume()          // Resume after pause
isListening()     // Boolean state check
isPaused()        // Boolean pause check

// Static methods
static isSupported()  // Check browser compatibility

// Callbacks
onTranscript(text: string, isFinal: boolean)
onError(errorType: string, isFatal: boolean)
onStateChange(state: 'idle' | 'listening' | 'retrying' | 'error')
```

**VoskRecognizer must:**
- Accept same constructor options
- Implement all methods with same signatures
- Emit same callback signatures
- Handle errors gracefully (network failures, model loading errors)
- Support same state transitions

**Differences to handle:**
- Vosk has async initialization (model loading) - add 'loading' state
- Vosk has no built-in auto-restart - implement in VoskRecognizer
- Vosk uses different event names ('result' vs onresult) - translate
- Vosk emits different result structures - normalize to { text, isFinal }

### 2. AudioVisualizer Integration

**Current setup (v1.0):**
```javascript
const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
recognizer.start();                  // Uses mediaStream internally
audioVisualizer.start(mediaStream);  // Uses same stream
```

**With VoskRecognizer:**
```javascript
const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
await voskRecognizer.start(mediaStream);  // Pass stream explicitly
audioVisualizer.start(mediaStream);       // Uses same stream
```

**Key consideration:** AudioVisualizer creates separate AnalyserNode from same mediaStream. VoskRecognizer's AudioWorklet also connects to same stream. Both can coexist without conflict.

**Architecture:**
```
MediaStream
    ├→ MediaStreamSource → VoskAudioProcessor → (processing)
    └→ MediaStreamSource → AnalyserNode → AudioVisualizer.draw()
```

Both branches independent, no interference.

### 3. Model Management Lifecycle

**Where to load model:**
- **Option A:** Load on demand when user starts Vosk mode
  - Pro: No upfront delay for Web Speech API users
  - Con: First Vosk start is slow

- **Option B:** Preload during app initialization
  - Pro: Vosk starts instantly when user switches
  - Con: All users pay loading cost, even if never use Vosk

**Recommendation:** Option A (on-demand). Add UI hint: "First use downloads model (50MB), cached for future."

**Model version management:**
```javascript
// Store version metadata in IndexedDB alongside blob
{
  url: 'https://cdn.com/vosk-model-en-us-0.22.tar.gz',
  blob: Blob,
  timestamp: 1738425600000,
  version: '0.22',
  sampleRate: 16000,
  language: 'en-US'
}

// Check for updates
async checkForUpdate(currentVersion) {
  const latestVersion = await fetch('https://api.vosk.ai/latest').then(r => r.json());
  return latestVersion > currentVersion;
}
```

### 4. Error Handling Parity

**SpeechRecognizer errors:**
```javascript
RECOVERABLE_ERRORS = ['network', 'no-speech', 'aborted']
FATAL_ERRORS = ['not-allowed', 'service-not-allowed']
```

**VoskRecognizer error mapping:**
```javascript
// Vosk-specific errors → SpeechRecognizer error types
{
  'model-load-failed': 'network',      // Recoverable (retry)
  'model-corrupt': 'service-not-allowed', // Fatal (re-download)
  'wasm-load-failed': 'service-not-allowed', // Fatal
  'audioworklet-unsupported': 'service-not-allowed', // Fatal
  'acceptwaveform-failed': 'aborted'   // Recoverable
}
```

## Anti-Patterns

### Anti-Pattern 1: Using ScriptProcessorNode

**What people do:** Use deprecated `ScriptProcessorNode` for audio capture (vosk-browser default).

**Why it's wrong:**
- Deprecated since 2018
- Runs on main thread (blocks UI)
- Fixed buffer sizes (4096), no flexibility
- Poor performance on mobile
- Console warnings in dev tools

**Do this instead:** Use AudioWorklet with ring buffer pattern (shown above). Runs in dedicated audio thread, no UI blocking, 128-frame processing.

### Anti-Pattern 2: Blocking Main Thread with Model Loading

**What people do:** Synchronously load model blob into Vosk without progress feedback.

**Why it's wrong:**
- 50-200MB download blocks UI
- User sees frozen screen
- No way to cancel
- Looks like app crashed

**Do this instead:**
- Show loading spinner with progress bar
- Stream model download with progress callback
- Allow cancellation
- Cache in IndexedDB for next time

### Anti-Pattern 3: Ignoring Buffer Size Mismatch

**What people do:** Send 128-frame chunks directly to `acceptWaveform` from AudioWorklet.

**Why it's wrong:**
- Vosk optimized for 4096-8192 frame chunks
- 128-frame chunks = 64x more function calls
- Overhead dominates, recognition is slow
- Higher CPU usage
- Poor battery life on mobile

**Do this instead:** Use ring buffer to accumulate to optimal size before calling `acceptWaveform`. Trade ~50ms latency for 10x better performance.

### Anti-Pattern 4: Not Handling Model Version Changes

**What people do:** Cache model once, never check for updates.

**Why it's wrong:**
- User stuck with old model (worse accuracy)
- No way to force re-download if corrupt
- Breaking changes in Vosk API not detected

**Do this instead:**
- Store version metadata with cached model
- Periodically check for updates (e.g., on app start)
- Provide "Clear cache & re-download" button
- Validate model blob hash if available

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **Single user (MVP)** | Single model (en-US), IndexedDB caching, on-demand loading. AudioWorklet with ring buffer. No optimizations needed. |
| **Multi-language support** | Multiple models (50MB each). Language selector in UI. Cache all used languages. Add cache eviction policy (LRU, max 500MB). |
| **Multi-user (enterprise)** | Shared model CDN (CloudFront). User preferences storage (which languages to cache). Model preloading in Service Worker. |

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Model load time (first) | <10s on 10 Mbps | 50MB model, show progress |
| Model load time (cached) | <500ms | IndexedDB read + Vosk init |
| Recognition latency | <200ms | AudioWorklet buffer (8192 frames @ 16kHz = 512ms) |
| CPU usage | <5% (desktop), <15% (mobile) | Ring buffer reduces Vosk calls |
| Memory usage | <150MB | Model (50MB) + WASM runtime (~100MB) |

## Build Order (Suggested)

Based on dependency graph and risk:

### Phase 1: Proof of Concept (Vosk works)
1. **Minimal Vosk integration** - Load model, process audio, log transcripts
   - Use Vosklet demo code as starting point
   - ScriptProcessorNode OK for POC (simple, fewer moving parts)
   - No caching yet (direct fetch)
   - Goal: Verify Vosk produces accurate transcripts for test script

### Phase 2: Core Components
2. **VoskAudioProcessor (AudioWorklet)** - Replace ScriptProcessorNode
   - Implement ring buffer pattern
   - Test buffer sizes (4096, 8192, 16384) for latency/CPU trade-off
   - Goal: Production-grade audio capture

3. **VoskModelLoader** - IndexedDB caching and progress
   - Download with progress callback
   - Store in IndexedDB
   - Cache hit/miss logic
   - Goal: Fast second load, no re-download

### Phase 3: Integration
4. **VoskRecognizer adapter** - Drop-in SpeechRecognizer replacement
   - Implement full interface (start, stop, pause, resume)
   - Translate Vosk events to callbacks
   - Error handling and state management
   - Goal: Zero changes to WordMatcher/PositionTracker

5. **UI integration** - Recognizer selection
   - Toggle between Web Speech API and Vosk
   - Model loading UI (spinner, progress bar)
   - Cache management (clear, size display)
   - Goal: User can choose recognizer, see model status

### Phase 4: Polish
6. **Error recovery** - Handle network failures, corrupt models
   - Retry logic for model download
   - Model validation (hash check if available)
   - Fallback to Web Speech API on Vosk failure
   - Goal: Robust error handling

7. **Performance tuning** - Optimize buffer size, memory usage
   - Profile with Chrome DevTools
   - Test on mobile devices
   - Adjust ring buffer size based on device
   - Goal: <5% CPU on desktop, <15% on mobile

### Why This Order

**POC first:** De-risk Vosk accuracy before investing in architecture.

**AudioWorklet before caching:** Audio pipeline is core functionality. Caching is optimization.

**Adapter before UI:** Ensures recognizer swap works at API level before adding UI complexity.

**Error recovery last:** Need working happy path first to understand failure modes.

## Technology Choices: Vosklet vs vosk-browser

### Vosklet (Recommended)

**Pros:**
- Cleaner API (`loadVosklet()` vs manual Worker setup)
- AudioWorklet support via `createTransferer()` (experimental but exists)
- Better TypeScript support
- More actively maintained (2023+ updates)
- Simpler model loading (accepts Blob directly)

**Cons:**
- Requires SharedArrayBuffer (strict COOP/COEP headers)
- Less mature than vosk-browser (fewer users)
- Documentation is sparse

**When to use:** Green-field project, can set COOP/COEP headers, want modern API.

### vosk-browser (Alternative)

**Pros:**
- More mature (2020+, more users)
- No SharedArrayBuffer requirement (works without headers)
- Better documented (more GitHub issues = more answers)
- Supports older browsers

**Cons:**
- ScriptProcessorNode by default (deprecated)
- AudioWorklet support is "half-baked" per GitHub issues
- More verbose API (manual Worker management)
- Less active development

**When to use:** Legacy project, can't set COOP/COEP headers, need broader browser support.

### Recommendation

**Use Vosklet** for this project because:
1. Modern architecture (AudioWorklet, SharedArrayBuffer)
2. Cleaner API matches project's clean architecture
3. Project already uses modern patterns (ES modules, async/await)
4. Can set COOP/COEP headers (simple add to server config)

**Set headers:**
```javascript
// server.js or Vite config
headers: {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}
```

## Sources

### HIGH Confidence (Official/Verified)

- [Vosklet Documentation](https://github.com/msqr1/Vosklet/blob/main/Documentation.md) - API reference, compilation, usage
- [vosk-browser GitHub](https://github.com/ccoreilly/vosk-browser) - API, limitations, AudioWorklet status
- [AudioWorklet Design Pattern - Chrome Developers](https://developer.chrome.com/blog/audio-worklet-design-pattern) - Ring buffer, SharedArrayBuffer, WebAssembly integration
- [Background Audio Processing - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet) - Lifecycle, message passing, processor setup
- [vosk-browser npm](https://www.npmjs.com/package/vosk-browser) - Installation, basic usage

### MEDIUM Confidence (Community)

- [vosk-browser AudioWorklet support (GitHub Issue #8)](https://github.com/ccoreilly/vosk-browser/issues/8) - "Half baked" AudioWorklet implementation, Safari issues
- [ScriptProcessorNode deprecation (GitHub Issue #9)](https://github.com/ccoreilly/vosk-browser/issues/9) - Migration discussion, blockers
- [Vosklet vs vosk-browser comparison](https://github.com/msqr1/Vosklet) - "Inspired by vosk-browser", differences in API
- Ring buffer gist examples - Community implementations, pattern validation

### Key Findings

1. **Vosklet uses AudioWorklet via `createTransferer()`** - Creates AudioWorkletNode with custom buffer size, transfers audio to main thread
2. **vosk-browser stuck on ScriptProcessorNode** - AudioWorklet support exists but Safari issues prevent adoption
3. **Ring buffer is essential** - 128-frame AudioWorklet chunks too small for Vosk, must accumulate
4. **SharedArrayBuffer required for Vosklet** - Needs COOP/COEP headers, not always possible
5. **Model sizes** - 40-250MB (quantized), slow first load, caching essential

---

*Architecture research for: Vosk WebAssembly integration for offline speech recognition*
*Researched: 2026-02-01*
*Confidence: MEDIUM (Community sources, some unverified patterns)*
