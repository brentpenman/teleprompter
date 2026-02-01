# Project Research Summary

**Project:** AI Voice-Controlled Teleprompter v1.2 — Vosk Offline Recognition
**Domain:** Offline speech-to-text for browser-based teleprompter
**Researched:** 2026-02-01
**Confidence:** MEDIUM

## Executive Summary

This research covers the integration of Vosk offline speech recognition to replace Web Speech API in an existing voice-controlled teleprompter. The primary goals are eliminating the Android notification beep and enabling true offline operation. The recommended approach is to use **vosk-browser v0.0.8** (despite being unmaintained) with the small English model (40MB), implementing an adapter pattern that makes Vosk a drop-in replacement for the existing SpeechRecognizer interface.

The key architectural insight is that Vosk transforms the teleprompter from a simple client-side app into a **distributed system** requiring model distribution, WASM initialization, worker thread communication, and explicit resource cleanup. The most critical risks are: (1) model loading failures without quota management, (2) AudioWorklet memory leaks from improper cleanup, and (3) latency budget violations on constrained devices. Each has clear mitigation strategies involving quota checks, singleton recognizer patterns, and device-tier detection.

This is an **incremental enhancement** to a validated v1.0 product. The existing architecture (WordMatcher, PositionTracker, ScrollController) remains unchanged. The adapter pattern ensures zero downstream impact while unlocking beep-free Android operation and offline capability. Fallback to Web Speech API provides graceful degradation.

## Key Findings

### Recommended Stack

The stack adds five components to the existing v1.0 architecture: **vosk-browser 0.0.8** (WebAssembly runtime), **vosk-model-small-en-us-0.15** (40MB model file), **IndexedDB caching** (browser native), **COOP/COEP headers** (for SharedArrayBuffer), and **HTTPS server** (headers added to existing setup).

**Core technologies:**
- **vosk-browser 0.0.8**: WebAssembly Vosk runtime — only mature browser package despite being unmaintained for 3 years; functional and used by production apps
- **vosk-model-small-en-us-0.15**: 40MB English model — best balance of size/accuracy for teleprompter use case (10% WER acceptable with fuzzy matching)
- **IndexedDB**: Model caching — browser native API, 40MB one-time download becomes instant on subsequent loads
- **COOP/COEP headers**: Enable SharedArrayBuffer — required for Vosk WASM threading; simple server config addition
- **ScriptProcessorNode**: Audio capture — deprecated but functional; AudioWorklet migration is future enhancement

**Critical warning:** vosk-browser still uses deprecated ScriptProcessorNode for audio processing. This works in all 2026 browsers but prints console warnings. Migration to AudioWorklet is tracked in GitHub issues #8/#9 but incomplete. Alternative library (Vosklet) exists but not on npm.

**No new build tools or frameworks needed.** This is a pure JavaScript integration via npm package.

### Expected Features

Research identified table stakes (users expect), differentiators (competitive advantage), and anti-features (commonly requested but problematic).

**Must have (table stakes):**
- Continuous recognition — standard STT behavior, Vosk supports via acceptWaveform() loop
- Interim/partial results — live feedback before final transcript, Vosk emits 'partialresult' events
- Model loading with progress — 40MB download requires progress UI, IndexedDB caching for offline
- Error recovery — graceful handling of model failures, fallback to Web Speech API

**Should have (competitive advantage):**
- Zero network after download — true offline, no beeps, no cloud (primary value proposition)
- Beep-free on Android — silent operation without system sounds (eliminates main user pain point)
- Privacy-first — audio never leaves device (automatic benefit)
- Offline-first with fallback — use Vosk when available, Web Speech API as backup

**Defer (v2+):**
- Multi-model support (small/large) — wait for user demand for higher accuracy
- Vocabulary customization — complex to implement, unclear value for teleprompter
- Multi-language models — 95% users are English, defer until international demand

**Anti-features (avoid):**
- Auto-download largest model — 2.3GB kills mobile data plans, overkill for use case
- Real-time model updates — large downloads, defeats offline purpose
- Multiple simultaneous models — memory explosion, browser crashes
- Background model download — Service Worker complexity, user doesn't know when ready

### Architecture Approach

Vosk integrates via an **adapter pattern** where VoskRecognizer implements the exact same interface as the existing SpeechRecognizer class. This ensures zero changes to downstream components (WordMatcher, PositionTracker, ScrollController). The architecture introduces four new components that work alongside existing code.

**Major components:**
1. **VoskRecognizer** — Drop-in replacement for SpeechRecognizer, same callback API (onTranscript, onError, onStateChange), wraps Vosklet module, translates Vosk events
2. **VoskModelLoader** — Model download with progress tracking, IndexedDB caching, version management, integrity validation
3. **VoskAudioProcessor** — AudioWorklet processor for audio capture in 128-frame chunks, accumulates to buffer size Vosk expects (4096-8192 frames)
4. **Ring Buffer** — Bridges AudioWorklet's 128-frame output to Vosk's preferred buffer size, prevents overflow, reduces function call overhead

**Audio pipeline:**
```
Microphone → getUserMedia → AudioContext → ScriptProcessor → Vosk acceptWaveform()
  → 'result'/'partial-result' events → VoskRecognizer adapter
  → onTranscript(text, isFinal) → WordMatcher (unchanged)
```

**Integration strategy:** The adapter pattern means existing code is agnostic to which recognizer is used. AudioVisualizer connects to same MediaStream (no changes). UI layer toggles between recognizers based on browser support and user preference.

**Key architectural decision:** Use vosk-browser over Vosklet because it works without SharedArrayBuffer in fallback mode (broader browser support), and the ScriptProcessor deprecation is a known quantity with no removal timeline.

### Critical Pitfalls

Research identified 8 critical pitfalls with clear prevention strategies. Top 5 for roadmap planning:

1. **Model loading without quota management** — 40MB download succeeds but IndexedDB storage fails with QuotaExceededError on low-storage devices. Prevention: Check quota before downloading, implement fallback to smaller model or streaming mode, handle QuotaExceededError explicitly with user choice.

2. **Model download failure without recovery** — 50MB download takes 10-30s on mobile; network drops, CORS issues, or partial downloads corrupt IndexedDB. Prevention: Implement resumable downloads with Range requests, validate model integrity with SHA-256 hash, provide explicit retry UI, test model creation before caching.

3. **AudioWorklet memory leaks** — Vosk WASM requires explicit `.free()` calls; forgetting causes 1MB/20s leak and tab crashes after 45-60 minutes. Prevention: Singleton recognizer pattern (reuse instance), cleanup on page unload and visibility change, convert Float32 to Int16 before acceptWaveform() to avoid WASM heap accumulation.

4. **Real-time latency budget violation** — Vosk has 200-500ms latency (vs <100ms for Web Speech API); low-end devices exceed 1 second making voice control unusable. Prevention: Choose small model with low context frames, optimize AudioWorklet buffer size (4096 samples = 256ms), implement device-tier detection to select appropriate model.

5. **API migration compatibility gaps** — Vosk marketed as "drop-in replacement" but events fire differently, transcript format differs, continuous recognition requires manual audio feeding. Prevention: Create compatibility wrapper that normalizes Vosk events to Web Speech API format, document breaking changes, feature detection with graceful degradation.

**Additional critical pitfall:** Android 16KB page size incompatibility (Pixel 8/9, newer Samsung devices with Android 15+) causes native library load failures. This affects **native Vosk only** (mobile apps), not browser WASM version, so teleprompter is unaffected. Worth noting for awareness.

## Implications for Roadmap

Based on research, suggested **3-phase structure** with clear dependencies and risk mitigation:

### Phase 1: Model Loading Infrastructure
**Rationale:** Foundation for all Vosk functionality; high-risk area (quota management, download failures, CORS); must work perfectly before attempting recognition.

**Delivers:** Reliable 40MB model download with progress UI, IndexedDB caching, integrity validation, quota checking, fallback strategies.

**Addresses features:**
- Model download system (table stakes)
- Progress indication (table stakes)
- Error recovery (table stakes)

**Avoids pitfalls:**
- Model loading without quota management (Pitfall #1)
- Model download failure without recovery (Pitfall #2)
- Model CORS and CDN configuration (Pitfall #7)

**Stack elements:**
- VoskModelLoader class
- IndexedDB wrapper with versioning
- HTTPS + COOP/COEP headers
- Model file bundled in /public or CDN

**Success criteria:** 40MB model downloads with progress, caches in IndexedDB, loads instantly on refresh, handles quota errors gracefully.

### Phase 2: VoskRecognizer Adapter
**Rationale:** Core integration that makes Vosk a drop-in replacement; adapter pattern isolates Vosk complexity; must match existing SpeechRecognizer API exactly to avoid downstream changes.

**Delivers:** VoskRecognizer class implementing SpeechRecognizer interface, audio pipeline (ScriptProcessor), event translation from Vosk to expected callbacks.

**Addresses features:**
- VoskRecognizer class (table stakes)
- Audio pipeline (table stakes)
- Continuous recognition (table stakes)
- Interim/partial results (table stakes)

**Avoids pitfalls:**
- AudioWorklet memory leaks (Pitfall #3) — implement singleton pattern and cleanup from start
- Microphone permission handling (Pitfall #6) — check permission state before initialization
- API migration compatibility gaps (Pitfall #8) — adapter normalizes events and formats

**Uses architecture:**
- VoskRecognizer adapter
- VoskAudioProcessor (ScriptProcessor for Phase 2, AudioWorklet migration deferred)
- Adapter pattern ensures zero downstream changes

**Success criteria:** Vosk recognizes speech, results logged, same callback format as Web Speech API, WordMatcher/PositionTracker work unchanged, memory stable over 60+ minutes.

### Phase 3: Engine Selection & Polish
**Rationale:** User-facing features depend on working recognizer; engine toggle requires both recognizers to be functional; production polish addresses edge cases discovered in testing.

**Delivers:** UI toggle between Vosk and Web Speech API, localStorage preference persistence, model download progress UI, error handling with fallback, device-tier detection.

**Addresses features:**
- Recognition engine toggle (table stakes)
- Offline-first with fallback (differentiator)
- Beep-free on Android (differentiator)
- Privacy-first (differentiator)

**Avoids pitfalls:**
- Real-time latency budget violation (Pitfall #4) — device-tier detection selects appropriate model
- API compatibility gaps (Pitfall #8) — unified interface proven in Phase 2

**Implements:**
- Settings UI with engine toggle
- Model management UI (cache size, clear cache)
- Loading states (downloading, loading, ready, error)
- Graceful degradation (Vosk fails → Web Speech API)

**Success criteria:** User can toggle engines, both work identically from app perspective, Android Chrome has no beep, offline mode works, clear error messages.

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** Can't test recognition without a working model loader; quota/download issues must be solved before attempting audio processing; reduces risk by validating hardest part first.

- **Phase 2 before Phase 3:** Need working recognizer before building UI around it; adapter pattern must be proven before exposing engine selection; allows testing recognizer in isolation.

- **Sequential not parallel:** Each phase depends on previous working perfectly; model loading bugs break recognizer, recognizer bugs break UI; clear checkpoint between each phase.

- **Minimal viable increments:** Phase 1 delivers cacheable model, Phase 2 delivers working recognition, Phase 3 delivers user control; each is independently testable and valuable.

### Research Flags

**Phases needing deeper research during planning:**
- **None** — Vosk integration is well-documented with established patterns; research completed provides sufficient detail for all three phases; existing teleprompter codebase provides proven patterns for adapter integration.

**Phases with standard patterns (skip research-phase):**
- **Phase 1:** Model loading — standard fetch API, IndexedDB API, quota management documented in MDN
- **Phase 2:** Adapter pattern — existing SpeechRecognizer provides exact interface to match
- **Phase 3:** UI integration — existing settings patterns in teleprompter

**Research validation during implementation:**
- Phase 1: Verify CORS configuration on production CDN (test all browsers)
- Phase 2: Measure actual latency on target devices (Pixel 3a, iPhone SE)
- Phase 3: Validate device-tier detection heuristics with real user devices

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | vosk-browser verified on npm and functional but unmaintained for 3 years; ScriptProcessor deprecated but no removal timeline; WASM/SharedArrayBuffer requirements verified via MDN |
| Features | HIGH | Table stakes identified from Vosk documentation and Web Speech API parity; differentiators validated against user pain points (Android beep); anti-features confirmed via community reports |
| Architecture | MEDIUM | Adapter pattern proven in codebase; AudioWorklet patterns verified via Chrome documentation; ring buffer pattern from community sources (not official); Vosklet vs vosk-browser trade-offs based on GitHub issues |
| Pitfalls | MEDIUM | Critical pitfalls sourced from vosk-browser/vosk-api GitHub issues; quota management from MDN; memory leak patterns from community reports; mitigation strategies are best practices but not tested in this specific context |

**Overall confidence:** MEDIUM

**Rationale:** Core technologies and browser APIs are well-documented with HIGH confidence. Vosk-specific integration patterns have MEDIUM confidence due to sparse official documentation and reliance on community sources (GitHub issues, WebSearch). The unmaintained status of vosk-browser lowers confidence despite functional verification. Architecture patterns (adapter, ring buffer) are proven elsewhere but application to this specific use case needs validation.

### Gaps to Address

**During Phase 1 planning:**
- **CDN selection:** Research recommends "bundle in /public OR CDN" but doesn't specify which CDN if using external. Validate: Netlify CDN, Cloudflare, or alphacephei.com official CDN? Test CORS configuration for chosen CDN in all target browsers.

- **IndexedDB quota formulas:** Research cites "10% of disk or 10GB" for Firefox, "percentage of free space" for Chrome, but Safari iOS has "strict caps + 7-day eviction." Validate: What are actual Safari quotas? Test on real iOS device with low storage.

**During Phase 2 implementation:**
- **ScriptProcessor vs AudioWorklet:** Research recommends ScriptProcessor for simplicity despite deprecation. Validate: Are console warnings acceptable in production? Should we implement AudioWorklet from start or accept technical debt?

- **Actual latency measurements:** Research estimates 200-500ms based on community reports. Validate: Measure with real device on prototype (iPhone SE 2, Pixel 3a) before committing to small model.

**During Phase 3 planning:**
- **Device-tier heuristics:** Research suggests `navigator.hardwareConcurrency` and `navigator.deviceMemory` for tier detection. Validate: Do these APIs reliably predict Vosk performance? Test on range of devices.

**Post-implementation monitoring:**
- **vosk-browser maintenance status:** Research flags 3-year staleness. Monitor: Subscribe to GitHub repo for updates; plan migration to Vosklet if blocking issues emerge; maintain Web Speech API fallback as insurance.

- **Browser compatibility evolution:** SharedArrayBuffer requirements, ScriptProcessor deprecation timeline. Monitor: Test on new browser versions; track deprecation announcements; plan AudioWorklet migration when needed.

## Sources

### Primary (HIGH confidence)
- [vosk-browser npm package](https://www.npmjs.com/package/vosk-browser) — Package version, API surface, usage
- [Vosk Models - alphacephei.com](https://alphacephei.com/vosk/models) — Model sizes (39-41 MB confirmed), WER benchmarks, download links
- [SharedArrayBuffer - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) — Security requirements updated Jan 2026
- [IndexedDB API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) — Quota management, caching patterns updated Jan 2026
- [Web Audio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) — AudioWorklet, ScriptProcessor status
- [COOP/COEP headers - MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy) — Required for SharedArrayBuffer

### Secondary (MEDIUM confidence)
- [vosk-browser GitHub issues](https://github.com/ccoreilly/vosk-browser/issues/8) — AudioWorklet "half-baked", Safari compatibility issues
- [vosk-browser GitHub issues](https://github.com/ccoreilly/vosk-browser/issues/9) — ScriptProcessor deprecation discussion
- [Vosklet GitHub](https://github.com/msqr1/Vosklet) — Alternative library comparison, AudioWorklet support
- [vosk-api GitHub issues](https://github.com/alphacep/vosk-api/issues/2007) — Android 16KB page size (native only, not WASM)
- [vosk-api GitHub issues](https://github.com/alphacep/vosk-api/issues/1752) — Memory leak reports, cleanup patterns
- [Vosk latency optimization](https://alphacephei.com/nsh/2020/11/27/latency.html) — Official guidance on reducing latency
- [AudioWorklet Design Pattern - Chrome Developers](https://developer.chrome.com/blog/audio-worklet-design-pattern) — Ring buffer pattern
- [VideoSDK Vosk guide](https://www.videosdk.live/developer-hub/stt/vosk-speech-recognition) — Community implementation patterns

### Tertiary (LOW confidence)
- WebSearch results on vosk-browser performance (200-500ms latency estimates — needs device testing)
- WebSearch results on vosk-browser memory usage (300MB+ estimates — needs profiling)
- Community reports on model accuracy trade-offs (needs validation with actual script content)

### Cross-Verified Findings (promoted to HIGH confidence)
- vosk-browser v0.0.8 is latest version (npm + GitHub releases agree)
- vosk-model-small-en-us-0.15 is ~40MB (multiple sources: alphacephei.com, HuggingFace, SunFounder docs)
- SharedArrayBuffer requires HTTPS + COOP/COEP (MDN, caniuse.com, Chrome DevRel blog)
- ScriptProcessorNode deprecated but functional (MDN, GitHub issues, caniuse.com)
- WebAssembly has 99% browser support (caniuse.com, webassembly.org)

---

**Research completed:** 2026-02-01
**Ready for roadmap:** Yes

**Next step:** Use this summary to inform requirements definition and roadmap creation. Each suggested phase has clear deliverables, addresses specific features/pitfalls from research, and includes success criteria for planning.
