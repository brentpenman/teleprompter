# Phase 10: VoskRecognizer Adapter - Research

**Researched:** 2026-02-01
**Domain:** Browser-based offline speech recognition, WebAssembly integration, adapter pattern
**Confidence:** MEDIUM-HIGH

## Summary

Phase 10 requires creating a VoskRecognizer class that implements the exact same interface as the existing SpeechRecognizer (Web Speech API wrapper), enabling zero changes to downstream components (WordMatcher, PositionTracker, ScrollController, AudioVisualizer). This is a classic adapter pattern: wrap vosk-browser's KaldiRecognizer to match SpeechRecognizer's callback-based interface.

The standard approach uses vosk-browser (0.0.8), which provides a WebAssembly build of Vosk with a KaldiRecognizer API that fires 'result' and 'partialresult' events. The adapter must map these events to SpeechRecognizer's onTranscript callbacks (with isFinal flag), handle microphone capture via getUserMedia, manage WASM resource cleanup (recognizer.remove(), model.terminate()), and achieve <500ms latency through proper audio configuration (16kHz, mono, small buffer sizes).

**Key challenges identified:**
- vosk-browser uses deprecated ScriptProcessorNode (AudioWorklet migration incomplete, deferred to v2)
- Memory leak prevention requires explicit cleanup (recognizer.remove() + model.terminate())
- SharedArrayBuffer availability already verified in Phase 9 (COOP/COEP headers)
- Latency target <500ms requires careful audio buffer sizing and processing optimization
- Model must be loaded from Phase 9's ModelLoader before VoskRecognizer can initialize

**Primary recommendation:** Create VoskRecognizer class with identical interface to SpeechRecognizer. Use singleton pattern for Model (one Web Worker per session). Implement explicit cleanup in stop() method. Accept model ArrayBuffer in constructor. Map KaldiRecognizer events to callback interface. Handle continuous recognition by never stopping (unlike Web Speech API's 60s timeout).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vosk-browser | 0.0.8 | Offline speech recognition | Only browser-compatible WASM build of Vosk |
| getUserMedia API | Native | Microphone audio capture | Browser-native, required for real-time audio |
| AudioContext | Native | Audio processing pipeline | Browser-native, connects mic to recognizer |
| ScriptProcessorNode | Native (deprecated) | Audio buffer processing | Used by vosk-browser, migration deferred |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Web Workers | Native | Background processing | vosk-browser runs recognition in worker |
| MessageChannel | Native | Worker communication | vosk-browser internal mechanism |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vosk-browser | Raw Vosk WASM | Requires manual worker setup, no examples |
| vosk-browser | Whisper.cpp WASM | Larger models (150MB+), higher accuracy, more latency |
| ScriptProcessorNode | AudioWorklet | Better performance, vosk-browser doesn't support yet |

**Installation:**
```bash
npm install vosk-browser@^0.0.8
```

**Known limitation:** vosk-browser unmaintained for 3 years (last update 2021) but still functional. ScriptProcessorNode deprecation has no removal timeline. Monitor for browser warnings.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── voice/
│   ├── SpeechRecognizer.js       # Existing Web Speech API wrapper
│   ├── VoskRecognizer.js         # NEW: Vosk adapter (this phase)
│   ├── AudioVisualizer.js        # Existing visualizer (works with both)
│   └── recognizerFactory.js      # NEW: Factory to create recognizer instances (Phase 11)
├── model/
│   ├── ModelLoader.js            # Phase 9: loads model from cache/download
│   └── ...                       # Other Phase 9 components
└── script.js                      # Main app (Phase 11 integration)
```

### Pattern 1: Adapter Pattern for Interface Compatibility
**What:** Wrap vosk-browser's KaldiRecognizer to match SpeechRecognizer's interface
**When to use:** Replacing one implementation with another while keeping consumers unchanged
**Example:**
```javascript
// Existing SpeechRecognizer interface (from codebase analysis)
class SpeechRecognizer {
  constructor(options) {
    // options: { onTranscript, onError, onStateChange, lang }
  }
  start() { /* ... */ }
  stop() { /* ... */ }
  pause() { /* ... */ }
  resume() { /* ... */ }
  isListening() { /* ... */ }
  isPaused() { /* ... */ }
  static isSupported() { /* ... */ }
  static getPlatform() { /* ... */ }
}

// VoskRecognizer must implement same interface
class VoskRecognizer {
  constructor(options) {
    this._options = options;
    this._model = null;
    this._recognizer = null;
    this._audioContext = null;
    this._stream = null;
    this._shouldBeListening = false;
    this._isPaused = false;
  }

  async start() {
    // 1. Get microphone via getUserMedia
    // 2. Create AudioContext + ScriptProcessor
    // 3. Initialize KaldiRecognizer from model
    // 4. Wire up event listeners
    // 5. Call onStateChange('listening')
  }

  stop() {
    // 1. Stop audio processing
    // 2. Clean up WASM resources (recognizer.remove())
    // 3. Stop media tracks
    // 4. Call onStateChange('idle')
  }

  // ... other methods match SpeechRecognizer
}
```

**Critical:** Interface must be identical - same method names, same callback signatures, same state transitions. This enables drop-in replacement.

### Pattern 2: vosk-browser Initialization and Event Handling
**What:** Load model, create recognizer, listen to result events
**When to use:** Setting up Vosk for continuous speech recognition
**Example:**
```javascript
// Source: vosk-browser npm docs + GitHub examples
import * as Vosk from 'vosk-browser';

async function initializeVosk(modelArrayBuffer, sampleRate = 16000) {
  // Create model from ArrayBuffer (spawns Web Worker)
  const model = await Vosk.createModel(modelArrayBuffer);

  // Create recognizer (can create multiple from same model)
  const recognizer = new model.KaldiRecognizer(sampleRate);

  // Listen for final results
  recognizer.on('result', (message) => {
    // message.result.text = final transcription
    // message.result.result = array of word objects with timing
    console.log('Final:', message.result.text);
  });

  // Listen for partial results (interim transcription)
  recognizer.on('partialresult', (message) => {
    // message.result.partial = interim transcription
    console.log('Interim:', message.result.partial);
  });

  return { model, recognizer };
}
```

**Important:** Model creation is async and expensive (spawns Web Worker). Create once per session, reuse for multiple recognizer instances if needed.

### Pattern 3: Audio Capture and Processing Pipeline
**What:** Connect microphone to Vosk via AudioContext and ScriptProcessor
**When to use:** Real-time speech recognition from microphone
**Example:**
```javascript
// Source: vosk-browser examples + Web Audio API best practices
async function setupAudioPipeline(recognizer, sampleRate = 16000) {
  // Request microphone with specific constraints
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,           // Mono
      sampleRate: sampleRate,    // 16kHz (Vosk requirement)
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  // Create AudioContext with matching sample rate
  const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: sampleRate
  });

  // Create source from microphone stream
  const source = audioContext.createMediaStreamSource(stream);

  // ScriptProcessor for audio processing (deprecated but required by vosk-browser)
  // Buffer size: smaller = lower latency, higher CPU usage
  // 4096 is good balance for <500ms latency
  const bufferSize = 4096;
  const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

  // Process audio buffers
  processor.onaudioprocess = (event) => {
    const inputData = event.inputBuffer.getChannelData(0);

    // vosk-browser expects AudioBuffer, not Float32Array
    // acceptWaveform handles extraction automatically
    try {
      recognizer.acceptWaveform(event.inputBuffer);
    } catch (err) {
      console.error('Vosk processing error:', err);
    }
  };

  // Connect pipeline: microphone -> processor -> (vosk in worker)
  // NOTE: Do NOT connect processor to destination (avoid audio feedback)
  source.connect(processor);

  return { audioContext, source, processor, stream };
}
```

**Latency optimization:**
- Use smallest buffer size that doesn't cause glitches (4096 = ~256ms at 16kHz)
- Ensure sample rate matches Vosk model (16kHz for most models)
- Enable audio enhancements (echo cancellation, noise suppression)
- ScriptProcessor deprecated but AudioWorklet not yet supported by vosk-browser

### Pattern 4: WASM Resource Cleanup
**What:** Properly free WASM memory to prevent leaks over long sessions
**When to use:** When stopping recognition or destroying recognizer
**Example:**
```javascript
// Source: vosk-browser documentation
class VoskRecognizer {
  async stop() {
    this._shouldBeListening = false;

    // 1. Stop audio processing first
    if (this._processor) {
      this._processor.disconnect();
      this._processor.onaudioprocess = null;
    }

    if (this._source) {
      this._source.disconnect();
    }

    // 2. Stop media tracks (release microphone)
    if (this._stream) {
      this._stream.getTracks().forEach(track => track.stop());
      this._stream = null;
    }

    // 3. Close AudioContext
    if (this._audioContext && this._audioContext.state !== 'closed') {
      await this._audioContext.close();
      this._audioContext = null;
    }

    // 4. Free WASM resources (CRITICAL for preventing memory leaks)
    if (this._recognizer) {
      this._recognizer.remove(); // Frees recognizer memory
      this._recognizer = null;
    }

    // 5. Optionally terminate model (if not reusing)
    // Only do this if VoskRecognizer owns the model lifecycle
    if (this._model && this._ownsModel) {
      this._model.terminate(); // Terminates Web Worker + frees memory
      this._model = null;
    }

    this._options.onStateChange?.('idle');
  }
}
```

**Critical:** Call recognizer.remove() before model.terminate(). Failing to clean up WASM resources causes memory leaks over 60+ minute sessions (VOSK-10 requirement).

### Pattern 5: Mapping Vosk Events to SpeechRecognizer Callbacks
**What:** Translate Vosk's event-based API to SpeechRecognizer's callback API
**When to use:** Maintaining interface compatibility in adapter
**Example:**
```javascript
// SpeechRecognizer fires: onTranscript(text, isFinal)
// Vosk fires: 'result' and 'partialresult' events

function setupVoskEventHandlers(recognizer, options) {
  // Map partial results to interim transcripts
  recognizer.on('partialresult', (message) => {
    const text = message.result.partial;
    if (text && text.trim()) {
      options.onTranscript?.(text, false); // isFinal = false
    }
  });

  // Map final results to final transcripts
  recognizer.on('result', (message) => {
    const text = message.result.text;
    if (text && text.trim()) {
      options.onTranscript?.(text, true); // isFinal = true
    }
  });

  // Vosk doesn't have explicit error events
  // Errors typically thrown during acceptWaveform or model creation
  // Handle in try-catch blocks and call onError callback
}
```

**Difference from Web Speech API:** Vosk doesn't auto-restart. Once started, it runs continuously until explicitly stopped. No need for retry logic like SpeechRecognizer has.

### Anti-Patterns to Avoid
- **Creating new Model on every start():** Model creation spawns Web Worker, very expensive. Create once, reuse.
- **Not calling remove()/terminate():** WASM memory leaks will accumulate over long sessions
- **Connecting ScriptProcessor to destination:** Creates audio feedback loop
- **Using wrong sample rate:** Vosk models expect 16kHz, mismatched rates cause poor accuracy
- **Large ScriptProcessor buffers:** 8192 or 16384 adds too much latency, use 4096 or less

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WASM Vosk integration | Custom Emscripten build | vosk-browser package | Pre-built WASM, Web Worker setup, message passing |
| Audio resampling | Manual resampling code | AudioContext sampleRate option | Browser-native, hardware-accelerated |
| Microphone permissions | Custom permission UI | getUserMedia() built-in prompt | Standardized, secure, users trust it |
| Worker communication | Manual postMessage handling | vosk-browser's API | Already handles serialization, errors |

**Key insight:** vosk-browser abstracts away the complexity of WASM module loading, Web Worker communication, and message serialization. While unmaintained, it's the only browser-ready package and works reliably.

## Common Pitfalls

### Pitfall 1: Memory Leaks from WASM Resources
**What goes wrong:** Long sessions (60+ minutes) cause browser to consume increasing memory, eventually slowing down or crashing
**Why it happens:** WASM allocates memory manually, JavaScript GC doesn't automatically free it
**How to avoid:**
- Always call recognizer.remove() in stop() method
- Call model.terminate() when completely done (but not on every stop if reusing)
- Use singleton pattern for Model to ensure one instance per session
**Warning signs:** Chrome DevTools shows increasing memory usage, WASM memory not released after stop

### Pitfall 2: ScriptProcessor Deprecation Warnings
**What goes wrong:** Browser console shows warnings about deprecated ScriptProcessorNode
**Why it happens:** vosk-browser hasn't migrated to AudioWorklet yet
**How to avoid:**
- Accept the deprecation (no removal timeline announced)
- Document in code comments for future migration (Phase v2)
- Monitor vosk-browser GitHub for AudioWorklet support
**Warning signs:** Console warnings, but functionality still works

### Pitfall 3: Sample Rate Mismatch
**What goes wrong:** Recognition accuracy is poor, transcripts are garbled or empty
**Why it happens:** Vosk models trained on 16kHz, feeding 48kHz (browser default) causes mismatch
**How to avoid:**
- Always create AudioContext with sampleRate: 16000
- Match getUserMedia constraints (sampleRate: 16000)
- Pass same rate to KaldiRecognizer constructor
**Warning signs:** Transcripts are nonsensical, accuracy much worse than Web Speech API

### Pitfall 4: Initializing Before Model Loaded
**What goes wrong:** VoskRecognizer.start() fails or hangs
**Why it happens:** Trying to create KaldiRecognizer before model ArrayBuffer is available
**How to avoid:**
- Accept model in constructor or separate loadModel() method
- Don't call start() until model is ready
- Provide clear error if model not loaded
**Warning signs:** Errors about undefined model, recognizer creation fails

### Pitfall 5: Blocking Main Thread During Model Initialization
**What goes wrong:** UI freezes for 1-2 seconds when initializing Vosk
**Why it happens:** Vosk.createModel() is async but takes time to spawn worker and transfer data
**How to avoid:**
- Show loading state during initialization
- Don't block user interaction
- Initialize model early (when entering teleprompter mode, before clicking voice button)
**Warning signs:** UI unresponsive, user can't click buttons during init

## Code Examples

Verified patterns from official sources:

### Complete VoskRecognizer Skeleton
```javascript
// Adapter implementing SpeechRecognizer interface for Vosk
import * as Vosk from 'vosk-browser';

class VoskRecognizer {
  static isSupported() {
    // Vosk requires SharedArrayBuffer (verified in Phase 9)
    return typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
  }

  static getPlatform() {
    // Same as SpeechRecognizer
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    return { isIOS, isAndroid, isMobile: isIOS || isAndroid };
  }

  constructor(options = {}) {
    this._options = options; // { onTranscript, onError, onStateChange, lang }
    this._model = null;
    this._recognizer = null;
    this._audioContext = null;
    this._source = null;
    this._processor = null;
    this._stream = null;
    this._shouldBeListening = false;
    this._isPaused = false;
    this._sampleRate = 16000; // Vosk requirement
  }

  async loadModel(modelArrayBuffer) {
    // Create Vosk model (spawns Web Worker)
    this._model = await Vosk.createModel(modelArrayBuffer);
  }

  async start() {
    if (this._shouldBeListening) return;
    if (!this._model) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    this._shouldBeListening = true;

    try {
      // 1. Request microphone
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this._sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // 2. Create AudioContext
      this._audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this._sampleRate
      });

      // 3. Create KaldiRecognizer
      this._recognizer = new this._model.KaldiRecognizer(this._sampleRate);

      // 4. Set up event listeners
      this._recognizer.on('result', (message) => {
        const text = message.result.text;
        if (text && text.trim()) {
          this._options.onTranscript?.(text, true); // isFinal = true
        }
      });

      this._recognizer.on('partialresult', (message) => {
        const text = message.result.partial;
        if (text && text.trim()) {
          this._options.onTranscript?.(text, false); // isFinal = false
        }
      });

      // 5. Set up audio processing
      this._source = this._audioContext.createMediaStreamSource(this._stream);
      this._processor = this._audioContext.createScriptProcessor(4096, 1, 1);

      this._processor.onaudioprocess = (event) => {
        try {
          this._recognizer.acceptWaveform(event.inputBuffer);
        } catch (err) {
          console.error('Vosk processing error:', err);
          this._options.onError?.('audio-processing', false);
        }
      };

      this._source.connect(this._processor);
      // Do NOT connect to destination (avoid feedback)

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

    // Free WASM resources (CRITICAL)
    if (this._recognizer) {
      this._recognizer.remove();
      this._recognizer = null;
    }

    this._options.onStateChange?.('idle');
  }

  pause() {
    if (!this._shouldBeListening) return;
    this._isPaused = true;
    // Disconnect processor but keep everything else ready
    if (this._processor && this._source) {
      this._source.disconnect(this._processor);
    }
    this._options.onStateChange?.('idle');
  }

  resume() {
    if (!this._isPaused) return;
    this._isPaused = false;
    // Reconnect processor
    if (this._processor && this._source) {
      this._source.connect(this._processor);
    }
    this._options.onStateChange?.('listening');
  }

  isListening() {
    return this._shouldBeListening && !this._isPaused;
  }

  isPaused() {
    return this._isPaused;
  }
}

export default VoskRecognizer;
```

### Testing VoskRecognizer with Existing Components
```javascript
// Verify VoskRecognizer works with existing pipeline (from script.js analysis)
import VoskRecognizer from './voice/VoskRecognizer.js';
import { ModelLoader } from './model/ModelLoader.js';
import { modelConfig } from './config/modelConfig.js';

// Load model (from Phase 9)
const loader = new ModelLoader(cache, downloader, validator);
const modelArrayBuffer = await loader.loadModel(modelConfig, (progress) => {
  console.log('Model loading:', progress.status);
});

// Create VoskRecognizer (same interface as SpeechRecognizer)
const recognizer = new VoskRecognizer({
  onTranscript: handleSpeechTranscript, // Existing handler from script.js
  onError: (errorType, isFatal) => {
    console.error('Vosk error:', errorType, isFatal);
  },
  onStateChange: (state) => {
    console.log('State:', state);
    // Same state handling as SpeechRecognizer
  }
});

// Load model into recognizer
await recognizer.loadModel(modelArrayBuffer);

// Start recognition (identical to SpeechRecognizer)
await recognizer.start();

// Existing components (WordMatcher, PositionTracker, ScrollController)
// work unchanged because interface is identical
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cloud STT APIs | Offline WASM models | 2020-2021 | Privacy, offline capability, no API costs |
| ScriptProcessorNode | AudioWorklet | 2018 (spec) | Better performance, main thread unblocked |
| Large models (>1GB) | Small models (40-50MB) | 2019-2020 | Browser-feasible, mobile-friendly |
| Server-side Vosk | Browser Vosk (WASM) | 2021 (vosk-browser) | Runs in browser, no server needed |

**Deprecated/outdated:**
- **ScriptProcessorNode**: Deprecated in spec but no removal timeline. vosk-browser still uses it, migration to AudioWorklet incomplete.
- **Large vocabulary models**: Older Vosk models were 500MB-2GB, newer compact models 40-50MB with minimal accuracy loss
- **Manual WASM compilation**: vosk-browser provides pre-built WASM, no need for custom Emscripten builds

**Current best practices (2025):**
- Use vosk-browser despite unmaintained status (only browser-ready package)
- Accept ScriptProcessor deprecation, plan AudioWorklet migration for v2
- Use small models (40-50MB) for mobile compatibility
- Implement proper WASM cleanup to prevent memory leaks
- Ensure SharedArrayBuffer availability via COOP/COEP headers (Phase 9)

## Open Questions

Things that couldn't be fully resolved:

1. **AudioWorklet Migration Timeline**
   - What we know: vosk-browser uses deprecated ScriptProcessor, has incomplete AudioWorklet implementation
   - What's unclear: When/if vosk-browser will complete migration, whether to fork and implement ourselves
   - Recommendation: Accept ScriptProcessor for v1.2, defer AudioWorklet to v2. Document in code comments. Monitor GitHub issue #9.

2. **Latency Target Achievability on Low-End Devices**
   - What we know: <500ms latency required, depends on buffer size, device CPU, model size
   - What's unclear: Whether Pixel 3a and iPhone SE can consistently hit <500ms with 40MB model
   - Recommendation: Implement with 4096 buffer size, measure actual latency in Phase 11 device testing. May need to tune buffer size per device tier.

3. **Model Reuse Strategy**
   - What we know: Model.terminate() frees memory, model creation is expensive (~1-2s)
   - What's unclear: Whether to create one model per session or recreate on each voice mode toggle
   - Recommendation: Singleton pattern - create model once when entering teleprompter mode, keep alive until exiting. Terminate only when leaving teleprompter view.

4. **Error Recovery Patterns**
   - What we know: Web Speech API has retry logic for network/no-speech errors, Vosk is offline so different failure modes
   - What's unclear: What errors Vosk can actually throw during recognition, how to recover
   - Recommendation: Wrap acceptWaveform() in try-catch, log errors but don't stop recognition. Only fatal errors (mic permission denied) should disable voice mode.

5. **Android Beep Elimination Verification**
   - What we know: Primary goal is eliminating Android notification beep caused by Web Speech API
   - What's unclear: Whether Vosk's offline processing truly avoids the beep, or if Android triggers it for any mic access
   - Recommendation: Test on actual Android device ASAP in Phase 11. This is the primary validation criterion for entire v1.2 milestone.

## Sources

### Primary (HIGH confidence)
- vosk-browser npm package (0.0.8) - API documentation, examples
- GitHub ccoreilly/vosk-browser - Issue discussions (#9 ScriptProcessor, #8 AudioWorklet)
- MDN Web Audio API - ScriptProcessorNode, AudioContext, getUserMedia
- Existing SpeechRecognizer.js codebase - Interface requirements

### Secondary (MEDIUM confidence)
- Research papers on Vosk real-time performance (2024-2025) - Latency benchmarks, optimization techniques
- WebSearch vosk-browser tutorials - Usage patterns, common pitfalls
- Vosk official documentation (alphacephei.com) - General Vosk concepts, model requirements

### Tertiary (LOW confidence)
- WebSearch results on vosk-browser examples - Code snippets (not verified)
- Community discussions on ScriptProcessor vs AudioWorklet - Migration challenges

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - vosk-browser is only browser option, well-documented
- Architecture: HIGH - Adapter pattern straightforward, existing SpeechRecognizer provides clear spec
- Pitfalls: MEDIUM-HIGH - Memory leaks documented, sample rate issues verified, latency target needs device testing
- Latency target: MEDIUM - Theoretical achievability yes, real device performance TBD in Phase 11

**Research date:** 2026-02-01
**Valid until:** 90 days (vosk-browser stable/unmaintained, APIs mature, unlikely to change)

**Key success factors:**
1. Exact interface match with SpeechRecognizer (enables zero changes downstream)
2. Proper WASM cleanup (prevents memory leaks over 60+ minutes)
3. Singleton Model pattern (avoids expensive re-initialization)
4. 16kHz sample rate (ensures accuracy)
5. Small buffer size 4096 (achieves <500ms latency)
6. Comprehensive error handling (graceful degradation)

**Implementation readiness:** Ready to plan. Phase 9 infrastructure provides model loading, COOP/COEP headers verified, existing SpeechRecognizer provides clear interface specification. Main unknowns are device-specific latency performance and Android beep verification, both testable in Phase 11.
