# Roadmap: AI Voice-Controlled Teleprompter

## Milestones

- v1.0 MVP - Phases 1-4 (shipped 2026-01-24)
- v1.1 Following-Along Rewrite - Phases 5-8 (shipped 2026-01-24)
- **v1.2 Offline Voice Recognition** - Phases 9-11 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-4) - SHIPPED 2026-01-24</summary>

### Phase 1: Foundation
**Goal**: Project scaffolding and basic teleprompter display
**Plans**: 3 plans

Plans:
- [x] 01-01: Project scaffolding
- [x] 01-02: Basic teleprompter display
- [x] 01-03: Manual scroll and controls

### Phase 2: Speech Recognition
**Goal**: Capture and process user speech
**Plans**: 4 plans

Plans:
- [x] 02-01: Microphone access and Web Speech API
- [x] 02-02: Audio visualizer
- [x] 02-03: Auto-restart and error recovery
- [x] 02-04: Visual feedback indicators

### Phase 3: Text Matching
**Goal**: Match spoken words to script position
**Plans**: 3 plans

Plans:
- [x] 03-01: Fuzzy text matching with Fuse.js
- [x] 03-02: Confidence scoring
- [x] 03-03: Visual highlighting

### Phase 4: Scroll Control
**Goal**: Intelligent scroll behavior based on match confidence
**Plans**: 3 plans

Plans:
- [x] 04-01: Confidence-based state machine
- [x] 04-02: Skip detection
- [x] 04-03: Smooth scroll animation
- [x] 04-04: Parameter tuning

</details>

<details>
<summary>v1.1 Following-Along Rewrite (Phases 5-8) - SHIPPED 2026-01-24</summary>

### Phase 5: WordMatcher
**Goal**: Create a stateless matching component that scores candidates by both fuzzy match quality and positional proximity
**Plans**: 2 plans

Plans:
- [x] 05-01: TDD: Core WordMatcher implementation with distance-weighted scoring
- [x] 05-02: Edge cases, character offsets, and JSDoc types

### Phase 6: PositionTracker
**Goal**: Maintain confirmed position as single source of truth using two-position model (floor + ceiling)
**Plans**: 2 plans

Plans:
- [x] 06-01: TDD: Core PositionTracker with two-position model and monotonic constraint
- [x] 06-02: TDD: Skip detection with distance-dependent consecutive matching

### Phase 7: ScrollController
**Goal**: React to position confirmations to scroll display, keeping next words at caret and deriving speed from speech pace
**Plans**: 2 plans

Plans:
- [x] 07-01: TDD: Core ScrollController with pace-derived scrolling and exponential smoothing
- [x] 07-02: Visual feedback: caret line, tracking indicator, settings slider

### Phase 8: Integration
**Goal**: Wire new components into pipeline, remove old components, verify clean architecture
**Plans**: 2 plans

Plans:
- [x] 08-01: Delete old components, wire v1.1 pipeline in script.js
- [x] 08-02: Debug overlay features, end-to-end verification

</details>

### v1.2 Offline Voice Recognition (In Progress)

**Milestone Goal:** Replace Web Speech API with Vosk offline recognition to eliminate Android beep and enable fully offline operation.

- [ ] **Phase 9: Model Loading Infrastructure** - Foundation for offline recognition
- [ ] **Phase 10: VoskRecognizer Adapter** - Drop-in replacement for SpeechRecognizer
- [ ] **Phase 11: Engine Selection & Polish** - User control and cross-platform validation

## Phase Details

### Phase 9: Model Loading Infrastructure
**Goal**: Reliable model download, caching, and initialization that handles quota limits and network failures gracefully
**Depends on**: Phase 8 (v1.1 complete)
**Requirements**: MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, MODEL-06, MODEL-07, MODEL-08, INTEG-06, INTEG-07
**Success Criteria** (what must be TRUE):
  1. App downloads 40MB Vosk model with visible progress indicator (percentage and MB downloaded)
  2. App caches downloaded model in IndexedDB and loads instantly (<2s) on subsequent visits
  3. App validates model integrity using SHA-256 hash before caching (prevents corrupted models)
  4. App checks storage quota before downloading and shows clear error when quota exceeded
  5. App serves with COOP/COEP headers over HTTPS (enables SharedArrayBuffer for Vosk WASM)
**Plans**: 4 plans

Plans:
- [ ] 09-01-PLAN.md — Server cross-origin isolation (COOP/COEP headers + verification utility)
- [ ] 09-02-PLAN.md — Storage infrastructure (IndexedDB cache + quota management)
- [ ] 09-03-PLAN.md — Download infrastructure (progress tracking + SHA-256 validation + config)
- [ ] 09-04-PLAN.md — Model loading orchestration (ModelLoader + end-to-end verification)

### Phase 10: VoskRecognizer Adapter
**Goal**: VoskRecognizer class that implements exact same interface as SpeechRecognizer, enabling zero changes to downstream components
**Depends on**: Phase 9
**Requirements**: VOSK-01, VOSK-02, VOSK-03, VOSK-04, VOSK-05, VOSK-06, VOSK-07, VOSK-08, VOSK-09, VOSK-10, INTEG-01, INTEG-02
**Success Criteria** (what must be TRUE):
  1. VoskRecognizer provides same methods (start, stop, pause, resume) and events (onTranscript, onError, onStateChange) as SpeechRecognizer
  2. VoskRecognizer emits interim results during speech (isFinal: false) and final results when utterance complete (isFinal: true)
  3. VoskRecognizer achieves <500ms latency from speech to transcript on target devices (Pixel 3a, iPhone SE)
  4. Existing components (WordMatcher, PositionTracker, ScrollController, AudioVisualizer) work unchanged with VoskRecognizer
  5. VoskRecognizer maintains stable memory usage over 60+ minute sessions (no leaks from WASM resources)
**Plans**: 3 plans

Plans:
- [ ] 10-01-PLAN.md — TDD: VoskRecognizer interface compatibility (class structure, static methods, lifecycle)
- [ ] 10-02-PLAN.md — Audio pipeline (getUserMedia, AudioContext, ScriptProcessor, WASM cleanup)
- [ ] 10-03-PLAN.md — Event mapping and integration (Vosk events -> callbacks, AudioVisualizer support)

### Phase 11: Engine Selection & Polish
**Goal**: User can choose recognition engine with intelligent fallback, and voice mode works silently across all target platforms
**Depends on**: Phase 10
**Requirements**: ENGINE-01, ENGINE-02, ENGINE-03, ENGINE-04, ENGINE-05, ENGINE-06, ENGINE-07, ENGINE-08, ENGINE-09, INTEG-03, INTEG-04, INTEG-05, VALID-01, VALID-02, VALID-03, VALID-04, VALID-05, VALID-06, VALID-07
**Success Criteria** (what must be TRUE):
  1. User can select recognition engine (Vosk or Web Speech API) from settings UI with preference persisted in localStorage
  2. App displays current engine in use, model download progress, cache size, and clear loading states (downloading, loading, ready, error)
  3. App falls back to Web Speech API automatically when Vosk unavailable or initialization fails
  4. Voice mode works on Android Chrome without notification beep (primary goal achieved)
  5. Voice mode works offline on Android after model download (no network required)
  6. Voice mode works on iOS Safari and Desktop Chrome/Firefox/Safari with appropriate engine
  7. Recognition accuracy is acceptable for teleprompter use (subjective evaluation, >80% word error rate target)
**Plans**: TBD

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 9 -> 10 -> 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-01-21 |
| 2. Speech Recognition | v1.0 | 4/4 | Complete | 2026-01-22 |
| 3. Text Matching | v1.0 | 3/3 | Complete | 2026-01-23 |
| 4. Scroll Control | v1.0 | 4/4 | Complete | 2026-01-24 |
| 5. WordMatcher | v1.1 | 2/2 | Complete | 2026-01-24 |
| 6. PositionTracker | v1.1 | 2/2 | Complete | 2026-01-24 |
| 7. ScrollController | v1.1 | 2/2 | Complete | 2026-01-24 |
| 8. Integration | v1.1 | 2/2 | Complete | 2026-01-24 |
| 9. Model Loading | v1.2 | 4/4 | Complete | 2026-02-01 |
| 10. VoskRecognizer | v1.2 | 0/3 | Not started | - |
| 11. Engine Selection | v1.2 | 0/TBD | Not started | - |

---
*Created: 2026-01-24 for v1.1 Following-Along Rewrite*
*Updated: 2026-02-01 for v1.2 Offline Voice Recognition*
