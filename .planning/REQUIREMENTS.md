# Requirements: AI Voice-Controlled Teleprompter v1.2

**Defined:** 2026-02-01
**Core Value:** The teleprompter follows YOU, not the other way around.

## v1.2 Requirements

Requirements for Vosk offline speech recognition integration. Each maps to roadmap phases.

### Model Management

- [ ] **MODEL-01**: App downloads Vosk model (40MB) with visible progress indicator
- [ ] **MODEL-02**: App caches downloaded model in IndexedDB for offline use
- [ ] **MODEL-03**: App validates model integrity using SHA-256 hash before caching
- [ ] **MODEL-04**: App checks available storage quota before downloading model
- [ ] **MODEL-05**: App loads cached model instantly on subsequent visits (<2s)
- [ ] **MODEL-06**: App provides clear error messages when model download fails
- [ ] **MODEL-07**: App handles quota exceeded errors with user-actionable guidance
- [ ] **MODEL-08**: App allows user to clear cached model to free storage

### VoskRecognizer Implementation

- [ ] **VOSK-01**: VoskRecognizer class implements same interface as SpeechRecognizer (start, stop, pause, resume methods)
- [ ] **VOSK-02**: VoskRecognizer emits same events as SpeechRecognizer (onTranscript, onError, onStateChange)
- [ ] **VOSK-03**: VoskRecognizer provides continuous recognition without manual restarts
- [ ] **VOSK-04**: VoskRecognizer emits interim results during speech (isFinal: false)
- [ ] **VOSK-05**: VoskRecognizer emits final results when utterance complete (isFinal: true)
- [ ] **VOSK-06**: VoskRecognizer captures audio via getUserMedia API
- [ ] **VOSK-07**: VoskRecognizer properly cleans up resources on stop (.free() for WASM)
- [ ] **VOSK-08**: VoskRecognizer handles microphone permission errors gracefully
- [ ] **VOSK-09**: VoskRecognizer achieves <500ms latency from speech to transcript
- [ ] **VOSK-10**: VoskRecognizer maintains stable memory usage over 60+ minutes

### Engine Selection & UI

- [ ] **ENGINE-01**: User can select recognition engine (Vosk or Web Speech API)
- [ ] **ENGINE-02**: App persists engine preference in localStorage
- [ ] **ENGINE-03**: App detects device capability and recommends appropriate engine
- [ ] **ENGINE-04**: App shows model download progress UI (percentage, MB downloaded)
- [ ] **ENGINE-05**: App displays clear loading states (downloading, loading model, ready)
- [ ] **ENGINE-06**: App displays current engine in use (Vosk/Web Speech API indicator)
- [ ] **ENGINE-07**: App provides "Download for offline use" button in settings
- [ ] **ENGINE-08**: App shows model cache size and last updated date
- [ ] **ENGINE-09**: App provides clear error UI when Vosk fails to initialize

### Integration & Compatibility

- [ ] **INTEG-01**: Existing components work unchanged with VoskRecognizer (WordMatcher, PositionTracker, ScrollController)
- [ ] **INTEG-02**: AudioVisualizer works with both Vosk and Web Speech API
- [ ] **INTEG-03**: App falls back to Web Speech API when Vosk unavailable
- [ ] **INTEG-04**: App falls back to Web Speech API when Vosk initialization fails
- [ ] **INTEG-05**: Switching between engines preserves app state (script content, position)
- [ ] **INTEG-06**: App configures COOP/COEP headers for SharedArrayBuffer support
- [ ] **INTEG-07**: App serves over HTTPS in production (required for COOP/COEP)

### Cross-Platform Validation

- [ ] **VALID-01**: Voice mode works on Android Chrome without notification beep (primary goal)
- [ ] **VALID-02**: Voice mode works offline on Android after model download
- [ ] **VALID-03**: Voice mode works on iOS Safari (with appropriate engine)
- [ ] **VALID-04**: Voice mode works on Desktop Chrome/Firefox/Safari
- [ ] **VALID-05**: Recognition accuracy acceptable for teleprompter use (subjective, >80% WER)
- [ ] **VALID-06**: Model download completes on 4G connection within 60 seconds
- [ ] **VALID-07**: App performs well on constrained devices (Pixel 3a, iPhone SE)

## Future Requirements

Deferred to later milestones. Not in current roadmap.

### Enhanced Features

- **VOSK-11**: Support for multiple model sizes (small/medium/large)
- **VOSK-12**: Support for multiple languages (Spanish, French, etc.)
- **VOSK-13**: AudioWorklet migration (replace deprecated ScriptProcessor)
- **MODEL-09**: Model versioning with automatic updates
- **MODEL-10**: Custom vocabulary support for technical terms

### Advanced UI

- **ENGINE-10**: Device-tier detection with automatic model selection
- **ENGINE-11**: Network-aware download (prompt on cellular, auto on WiFi)
- **ENGINE-12**: Background model download via Service Worker

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Cloud STT APIs (Deepgram, AssemblyAI) | Costs money, privacy concerns; defeats offline goal |
| Real-time model updates | Large downloads defeat offline purpose |
| Multiple simultaneous models | Memory explosion, browser crashes |
| Background model download | Service Worker complexity, unclear when ready |
| Auto-download large models | 2.3GB kills mobile data plans |
| Custom model training | High complexity, unclear value for teleprompter |
| Speaker diarization | Single speaker only; not needed for use case |
| Punctuation/formatting | Basic transcription sufficient; fuzzy matching handles it |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MODEL-01 | Phase 9 | Pending |
| MODEL-02 | Phase 9 | Pending |
| MODEL-03 | Phase 9 | Pending |
| MODEL-04 | Phase 9 | Pending |
| MODEL-05 | Phase 9 | Pending |
| MODEL-06 | Phase 9 | Pending |
| MODEL-07 | Phase 9 | Pending |
| MODEL-08 | Phase 9 | Pending |
| VOSK-01 | Phase 10 | Pending |
| VOSK-02 | Phase 10 | Pending |
| VOSK-03 | Phase 10 | Pending |
| VOSK-04 | Phase 10 | Pending |
| VOSK-05 | Phase 10 | Pending |
| VOSK-06 | Phase 10 | Pending |
| VOSK-07 | Phase 10 | Pending |
| VOSK-08 | Phase 10 | Pending |
| VOSK-09 | Phase 10 | Pending |
| VOSK-10 | Phase 10 | Pending |
| ENGINE-01 | Phase 11 | Pending |
| ENGINE-02 | Phase 11 | Pending |
| ENGINE-03 | Phase 11 | Pending |
| ENGINE-04 | Phase 11 | Pending |
| ENGINE-05 | Phase 11 | Pending |
| ENGINE-06 | Phase 11 | Pending |
| ENGINE-07 | Phase 11 | Pending |
| ENGINE-08 | Phase 11 | Pending |
| ENGINE-09 | Phase 11 | Pending |
| INTEG-01 | Phase 10 | Pending |
| INTEG-02 | Phase 10 | Pending |
| INTEG-03 | Phase 11 | Pending |
| INTEG-04 | Phase 11 | Pending |
| INTEG-05 | Phase 11 | Pending |
| INTEG-06 | Phase 9 | Pending |
| INTEG-07 | Phase 9 | Pending |
| VALID-01 | Phase 11 | Pending |
| VALID-02 | Phase 11 | Pending |
| VALID-03 | Phase 11 | Pending |
| VALID-04 | Phase 11 | Pending |
| VALID-05 | Phase 11 | Pending |
| VALID-06 | Phase 11 | Pending |
| VALID-07 | Phase 11 | Pending |

**Coverage:**
- v1.2 requirements: 40 total
- Mapped to phases: 40/40 (100%)
- Unmapped: 0

**Phase breakdown:**
- Phase 9 (Model Loading Infrastructure): 10 requirements
- Phase 10 (VoskRecognizer Adapter): 12 requirements
- Phase 11 (Engine Selection & Polish): 18 requirements

---
*Requirements defined: 2026-02-01*
*Last updated: 2026-02-01 after roadmap creation*
