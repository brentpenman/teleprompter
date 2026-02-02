# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-01)

**Core value:** The teleprompter follows YOU, not the other way around. It matches your natural speaking rhythm and handles the messiness of real speech.
**Current focus:** Phase 11 - Engine Selection & Polish

## Current Position

Phase: 11 of 11 (Engine Selection & Polish)
Plan: 2 of 3
Status: In progress
Last activity: 2026-02-01 - Completed quick-002 (Expand Lookahead Search Area)

Progress: [█████████░] 100% (23/23 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 16 (across v1.0 and v1.1)
- Average duration: Not tracked in previous milestones
- Total execution time: v1.0 + v1.1 completed in ~3 days total

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| v1.0 (1-4) | 13 | - | - |
| v1.1 (5-8) | 8 | - | - |
| v1.2 (9-11) | 6 of ~12 | ~20min | ~3.3min/plan |

**Recent Trend:**
- v1.0 and v1.1 shipped same day (2026-01-24)
- v1.2 started 2026-02-01 (7 days later)
- Trend: Fresh start on new milestone

*Updated after roadmap creation*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting v1.2 work:

- v1.0: CSS Custom Highlight API chosen for zero-DOM manipulation highlighting
- v1.0: Web Speech API used but flagged for potential issues
- v1.1: Complete rewrite of following logic with goal-backward principles
- v1.2: Vosk offline recognition to eliminate Android beep and enable offline operation
- 09-01: Use require-corp instead of credentialless for COEP header (Safari compatibility)
- 09-01: Apply COOP/COEP headers to ALL responses including 404 errors
- 09-01: Verify SharedArrayBuffer via try-catch instantiation, not just property check
- 09-02: Native IndexedDB without wrapper library (sufficient for binary storage use case)
- 09-02: Do NOT index binary data field (40MB) to avoid performance degradation
- 09-02: 10% safety buffer for storage quota checks (compression imprecision)
- 09-02: Optimistic fallback for browsers without StorageManager API
- 09-03: Use fetch ReadableStream for download progress tracking (native API)
- 09-03: Cap progress percentage at 100% (handles Content-Encoding compression)
- 09-03: Web Crypto API for SHA-256 validation (no streaming, 40MB in memory acceptable)
- 09-03: Array.from() hex conversion (Uint8Array.toHex() not yet available)
- 10-01: vosk-browser despite unmaintained status (only browser-ready Vosk package)
- 10-01: Accept ScriptProcessorNode deprecation (AudioWorklet migration deferred to v2)
- 10-01: 16kHz sample rate required for Vosk model compatibility
- 10-01: Import jest from @jest/globals for ES module compatibility
- 10-02: 4096 buffer size for ScriptProcessor balances latency with stability
- 10-02: Model singleton pattern - recognizer.remove() called but model NOT terminated (reuse across sessions)
- 10-02: pause/resume disconnect/reconnect audio graph (more efficient than Web Speech API stop/start)
- 10-03: getAudioContext() and getMediaStreamSource() expose audio pipeline for visualization
- 10-03: VoskRecognizer achieves full API parity with SpeechRecognizer (all 10 VOSK requirements met)
- 11-01: localStorage for settings (not IndexedDB) - simple key-value, 5MB quota sufficient
- 11-01: Try-catch wrapper on ALL localStorage access (private browsing throws SecurityError)
- 11-01: iOS always gets webspeech (SharedArrayBuffer blocked even with COOP/COEP)
- 11-01: Android + Vosk prioritized to eliminate notification beep (PRIMARY v1.2 goal)
- 11-01: Factory automatic fallback Vosk→WebSpeech (graceful degradation maximizes availability)
- 11-02: LoadingStates as static methods (no state management needed)
- 11-02: SettingsPanel creates fresh instance on each open (no stale state)
- 11-02: Settings load on DOMContentLoaded for ENGINE-02 persistence requirement
- 11-02: RecognizerFactory progress callback renders in listening indicator
- 11-02: Vosk initialization errors show clear message then auto-clear after 3s

### Pending Todos

None yet.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 001 | Engine label inline and model loading indicator | 2026-02-01 | 3114770 | [001-engine-label-inline-and-model-loading-in](./quick/001-engine-label-inline-and-model-loading-in/) |
| 002 | Expand lookahead search area for scroll recovery | 2026-02-01 | 6f96c06 | [002-expand-lookahead-search-area-for-scroll-](./quick/002-expand-lookahead-search-area-for-scroll-/) |

### Blockers/Concerns

**For Phase 9:**
- vosk-browser package unmaintained for 3 years (still functional, monitored)
- ScriptProcessor deprecated (but no removal timeline, AudioWorklet migration deferred to v2)
- CORS configuration needed for model CDN (test across all browsers)
- IndexedDB quota varies by browser, especially Safari iOS (needs device testing)

**For Phase 10:**
- Latency target <500ms needs real device validation (Pixel 3a, iPhone SE)
- Memory leak prevention critical (WASM .free() calls, singleton pattern)

**For Phase 11:**
- Android beep elimination is primary success criterion (must verify)
- Cross-platform validation requires access to test devices

## Session Continuity

Last session: 2026-02-01 20:10 UTC
Stopped at: Completed quick-001 (Engine Label Inline and Model Loading Progress Bar)
Resume file: None

---
*Updated: 2026-02-01 after quick-001 completion*
