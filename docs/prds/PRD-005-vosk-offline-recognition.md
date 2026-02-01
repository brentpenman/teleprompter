# PRD-005: Vosk Offline Speech Recognition

**Status**: Draft
**Priority**: Medium
**Effort**: Large (3-4 weeks)

---

## Problem Statement

The Web Speech API on Android Chrome produces an intrusive notification beep every time speech recognition is started or restarted. Since continuous voice tracking requires restarting recognition approximately every 60 seconds (Chrome timeout) and after 7 seconds of silence, users hear this beep repeatedly throughout their teleprompter session, creating a poor and distracting user experience.

This beep is **hardcoded in Android's native SpeechRecognizer API** at the system level and cannot be disabled or muted through web browser APIs due to sandboxing restrictions.

## Background

### Current Implementation

The app uses the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) via the `SpeechRecognizer` class (`voice/SpeechRecognizer.js`) for continuous speech-to-text. The implementation handles:

- Auto-restart on Chrome's 60-second session timeout
- Auto-restart after 7 seconds of silence detection
- Exponential backoff for error recovery
- Platform-specific behavior (iOS vs Android vs Desktop)

**Android-specific behavior** (from `SpeechRecognizer.js:76-86`):
```javascript
this._isAndroid = isAndroid;
this._recognition.continuous = !this._isIOS; // continuous=true on Android
```

### Root Cause of Beep

Every call to `recognition.start()` triggers Android's system-level SpeechRecognizer, which plays a notification sound (beep/ding) to indicate microphone activation. This is a privacy/security feature baked into Android OS.

**Why web apps can't disable it:**
- Native Android apps can mute the beep by setting `AudioManager.STREAM_MUSIC` volume to 0 before calling `SpeechRecognizer.startListening()`
- Web browsers do not expose `AudioManager` or system audio stream controls to JavaScript
- The beep is intentionally not bypassable from web contexts for security reasons

### Alternative Solutions Considered

1. **Cloud STT APIs (Deepgram, AssemblyAI)** — Solves beep issue but introduces cost, latency, and privacy concerns
2. **Increase timeout to reduce restarts** — Not possible; Chrome enforces 60s max session
3. **Volume manipulation via Web Audio API** — Cannot affect system notification stream
4. **Native app wrapper (Cordova/Capacitor)** — Moves project out of pure web, increases complexity

## Proposed Solution: Vosk Offline Recognition

Replace the Web Speech API with **Vosk**, an open-source offline speech recognition toolkit that runs entirely in the browser via WebAssembly.

### Why Vosk?

**Eliminates the beep:**
- Bypasses Android's native SpeechRecognizer completely
- Uses Web Audio API + WebAssembly for recognition
- No system-level microphone notifications

**Additional benefits:**
- **Offline-first**: Works without internet connection
- **Privacy**: All processing happens locally, zero data sent to servers
- **Cross-platform consistency**: Same behavior on iOS, Android, Desktop
- **Free**: Open-source (Apache 2.0 license), no API costs
- **Low latency**: Zero network round-trip, ~100-300ms processing time
- **Small models**: 50MB for English model, loaded once and cached

**Trade-offs:**
- **Accuracy**: ~85-90% WER vs 95%+ for cloud services (acceptable for teleprompter use case)
- **Initial load time**: 50MB model download on first use (cached thereafter)
- **CPU usage**: More intensive than Web Speech API (runs locally)
- **Browser support**: Requires WebAssembly support (Chrome 57+, Safari 11+, Firefox 52+)

## Technical Architecture

### High-Level Flow

```
User clicks Voice Toggle
  ↓
Request microphone (getUserMedia)
  ↓
Initialize Vosk WebAssembly module
  ↓
Download language model (cached after first load)
  ↓
Create AudioWorklet for real-time audio processing
  ↓
Stream audio chunks to Vosk recognizer
  ↓
Receive transcription results (interim and final)
  ↓
Pass to existing matching pipeline (WordMatcher, PositionTracker, etc.)
```

### Components to Implement

#### 1. VoskRecognizer Class (`voice/VoskRecognizer.js`)

Replacement for `SpeechRecognizer.js` with the same public API:

```javascript
class VoskRecognizer {
  static async isSupported() {
    return typeof WebAssembly !== 'undefined';
  }

  constructor(options = {}) {
    // options.lang, options.onTranscript, options.onError, options.onStateChange
    // Initialize Vosk module, set up audio processing
  }

  async start() {
    // Load model (if not cached), start AudioWorklet
  }

  stop() {
    // Stop audio processing, clean up resources
  }

  pause() / resume() {
    // Handle visibility changes
  }
}
```

**Key differences from SpeechRecognizer:**
- `start()` is async (must load model)
- No auto-restart needed (truly continuous)
- Model loading state (`downloading`, `loading`, `ready`)

#### 2. Vosk WebAssembly Integration

Use the official **vosk-browser** package:
- NPM package: `vosk-browser` (WASM build of Vosk)
- Model loading: Fetch from CDN or bundle in `/models/` directory
- AudioWorklet: Process audio at 16kHz sample rate (Vosk requirement)

#### 3. Audio Pipeline

```javascript
// AudioWorklet processor
class VoskAudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0][0]; // Mono channel
    // Resample to 16kHz if needed
    // Send to Vosk recognizer via MessagePort
    return true;
  }
}
```

#### 4. Model Management (`voice/VoskModelLoader.js`)

Handle model downloading, caching, and versioning:
- Download models from GitHub releases or CDN
- Cache in IndexedDB (persistent storage)
- Support multiple language models
- Progress reporting for download (show progress bar in UI)

### Integration Points

**Minimal changes to existing code:**

1. `script.js:enableVoiceMode()` — swap `SpeechRecognizer` for `VoskRecognizer`
2. `script.js:handleSpeechTranscript()` — no changes (same callback interface)
3. UI loading states — add model download progress indicator

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | VoskRecognizer must provide the same public API as SpeechRecognizer | Must have |
| FR-2 | Voice mode must work on Android Chrome without beep sounds | Must have |
| FR-3 | Model download must show progress (50MB download) | Must have |
| FR-4 | Model must be cached persistently after first download | Must have |
| FR-5 | Graceful fallback to Web Speech API if Vosk fails to load | Should have |
| FR-6 | Support for multiple languages (initially English only) | Nice to have |
| FR-7 | Offline mode must work without internet after initial model download | Must have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | Recognition latency must be under 500ms for real-time tracking | Must have |
| NFR-2 | Model download time on 4G connection should be under 30 seconds | Should have |
| NFR-3 | CPU usage should not cause UI jank or excessive battery drain | Should have |
| NFR-4 | Memory usage should stay under 150MB (model + runtime) | Should have |
| NFR-5 | Accuracy sufficient for teleprompter (tolerate 10-15% WER) | Must have |

## Implementation Phases

### Phase 1: Proof of Concept (Week 1)
**Goal**: Validate Vosk works in browser and meets latency requirements

- [ ] Set up basic HTML page with Vosk integration
- [ ] Load English model (vosk-model-small-en-us-0.15, ~40MB)
- [ ] Capture mic audio and send to Vosk
- [ ] Display recognition results in console
- [ ] Measure latency (mic → transcript)
- [ ] Test on Android Chrome, iOS Safari, Desktop Chrome

**Success criteria**: <500ms latency, >80% WER on test script

### Phase 2: VoskRecognizer Class (Week 2)
**Goal**: Create production-ready drop-in replacement for SpeechRecognizer

- [ ] Implement `VoskRecognizer` class with full API parity
- [ ] Handle model loading states (downloading, loading, ready, error)
- [ ] Implement AudioWorklet for efficient audio processing
- [ ] Add error handling and retry logic
- [ ] Unit tests for VoskRecognizer
- [ ] Documentation

**Success criteria**: All SpeechRecognizer tests pass with VoskRecognizer

### Phase 3: Model Management (Week 3)
**Goal**: Production-grade model loading and caching

- [ ] Implement VoskModelLoader with IndexedDB caching
- [ ] Add model download progress events
- [ ] Support model versioning and updates
- [ ] Implement cache invalidation strategy
- [ ] Handle quota exceeded errors (fallback to memory)
- [ ] Add model integrity verification (checksum)

**Success criteria**: Second load is instant (<100ms), survives browser restart

### Phase 4: Integration & UI (Week 3-4)
**Goal**: Integrate into main app with seamless UX

- [ ] Add model download progress UI (progress bar in voice toggle)
- [ ] Update voice mode activation flow to handle async model loading
- [ ] Add settings option: "Recognition Engine" (Vosk/Web Speech API)
- [ ] Update error messages for Vosk-specific failures
- [ ] Add "Download model for offline use" button in editor
- [ ] Update onboarding/help text about offline capability

**Success criteria**: Users can enable voice mode on Android without beeps

### Phase 5: Testing & Polish (Week 4)
**Goal**: Production-ready quality

- [ ] Cross-browser testing (Chrome, Safari, Firefox, Edge)
- [ ] Mobile testing (Android Chrome, iOS Safari)
- [ ] Performance profiling (CPU, memory, battery)
- [ ] Accuracy testing with diverse scripts and accents
- [ ] Edge case handling (network errors during download, quota exceeded, etc.)
- [ ] Accessibility review
- [ ] Documentation updates

**Success criteria**: No regressions, beep eliminated, <5% user-reported issues

## Success Criteria

### Primary Goals
- ✅ Android Chrome users can use voice mode without hearing beep sounds
- ✅ Voice tracking accuracy is acceptable for teleprompter use (subjective, but >80% WER)
- ✅ Offline mode works after initial model download
- ✅ No regressions in existing voice mode features

### Secondary Goals
- ✅ Model loads in <30s on 4G connection
- ✅ CPU usage does not cause frame drops or excessive heat
- ✅ Cross-platform consistency (same behavior on iOS/Android/Desktop)
- ✅ Users can choose between Vosk and Web Speech API

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Vosk accuracy too low for production | High | Medium | Run accuracy tests in Phase 1; abort if <80% WER |
| 50MB download is prohibitive for mobile users | Medium | Low | Show clear prompt before downloading; support Web Speech API fallback |
| WebAssembly performance too slow on old devices | High | Medium | Set minimum browser versions; fallback to Web Speech API |
| IndexedDB quota exceeded on some browsers | Medium | Medium | Fallback to in-memory caching; prompt user to clear space |
| Vosk library has bugs or is abandoned | High | Low | Test thoroughly in Phase 1; maintain fork if needed |
| Users prefer Web Speech API accuracy despite beep | Low | Low | Provide setting to switch between engines |

## Out of Scope

### Not Included in This PRD

- **Cloud STT integration** (Deepgram, AssemblyAI, etc.) — separate PRD if needed
- **Multiple language model support** — English only for v1, expand later
- **Custom model training** — use pre-trained Vosk models
- **Speaker diarization** — single speaker only
- **Punctuation/formatting** — basic transcription only (matching handles fuzzy logic)
- **Real-time accent adaptation** — use fixed models
- **Vosk-specific tuning UI** (confidence threshold, etc.) — use defaults

### Future Enhancements (Post-MVP)

- Language selection (Spanish, French, etc.)
- Model size options (small 40MB, medium 100MB, large 1GB)
- Hybrid mode (Vosk for continuous, Web Speech API for final pass)
- Custom vocabulary/jargon support

## Affected Files

| File | Changes |
|------|---------|
| `voice/VoskRecognizer.js` | **New file** — Vosk-based recognizer class |
| `voice/VoskModelLoader.js` | **New file** — Model download and caching logic |
| `voice/VoskAudioProcessor.js` | **New file** — AudioWorklet processor |
| `script.js` | Update `enableVoiceMode()` to use VoskRecognizer; add model loading UI |
| `index.html` | Add settings toggle for recognition engine selection |
| `styles.css` | Add styles for model download progress UI |
| `package.json` | Add `vosk-browser` dependency |
| `README.md` | Document offline capability and model download |

## Dependencies

### NPM Packages
- `vosk-browser` — Vosk WebAssembly build (~2MB)

### External Resources
- Vosk model files (hosted on CDN or bundled)
  - `vosk-model-small-en-us-0.15` (40MB) — recommended for production
  - Alternative: `vosk-model-en-us-0.22` (1.8GB) — higher accuracy, optional

### Browser APIs Required
- WebAssembly (Chrome 57+, Safari 11+, Firefox 52+)
- AudioWorklet (Chrome 66+, Safari 14.1+, Firefox 76+)
- IndexedDB (all modern browsers)
- getUserMedia (already in use)

## Alternatives Considered

### 1. Cloud STT (Deepgram, AssemblyAI)
**Pros**: Higher accuracy, professional support
**Cons**: Costs $0.0043/min (~$15/month for heavy user), privacy concerns, latency
**Decision**: Rejected for v1 due to cost and privacy; consider for premium tier

### 2. Native App Wrapper (Capacitor)
**Pros**: Can mute Android beep via native code
**Cons**: Loses PWA benefits, app store submission, maintenance burden
**Decision**: Rejected; stay pure web

### 3. Accept the Beep
**Pros**: No implementation effort
**Cons**: Poor UX, user complaints
**Decision**: Rejected; beep is dealbreaker for many users

### 4. Whisper.cpp WASM
**Pros**: State-of-art accuracy (OpenAI Whisper)
**Cons**: Models are 75MB-1.5GB, slower inference than Vosk
**Decision**: Consider for future; Vosk is better fit for real-time

## Open Questions

1. **Model hosting**: Bundle models in repo (increases repo size) vs CDN (adds external dependency)?
   - **Recommendation**: CDN for production, optional bundling for self-hosting

2. **Fallback strategy**: Auto-fallback to Web Speech API on Vosk failure, or show error?
   - **Recommendation**: Show clear error with option to switch to Web Speech API (user choice)

3. **Minimum browser version**: Drop support for older browsers without AudioWorklet?
   - **Recommendation**: Require AudioWorklet (Chrome 66+, Safari 14.1+); fallback for older browsers

4. **Recognition mode**: Continuous vs restart-on-final (like iOS workaround)?
   - **Recommendation**: Truly continuous (Vosk advantage); no artificial restarts

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Beep elimination | 100% of Vosk users | User testing on Android Chrome |
| Recognition accuracy (WER) | <15% | Automated testing with test scripts |
| Model load time (4G) | <30s | Performance testing |
| Latency (mic to transcript) | <500ms | Performance testing |
| Offline success rate | >95% | Integration testing |
| User satisfaction | >4.0/5.0 | Post-release survey |

---

## Appendix: Technical References

- **Vosk Documentation**: https://alphacephei.com/vosk/
- **vosk-browser NPM**: https://www.npmjs.com/package/vosk-browser
- **Vosk Models**: https://alphacephei.com/vosk/models
- **AudioWorklet API**: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- **IndexedDB API**: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
