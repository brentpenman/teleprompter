# Project Research Summary

**Project:** AI Voice-Controlled Teleprompter Web Application
**Domain:** Real-time speech recognition with semantic text matching
**Researched:** 2026-01-22
**Confidence:** HIGH

## Executive Summary

Voice-controlled teleprompters coordinate multiple real-time systems (speech recognition, text matching, scroll control) while handling the inherent uncertainty of speech input. The key architectural insight is to separate concerns cleanly: audio capture produces uncertain data, matching resolves uncertainty, and UI reacts only to high-confidence positions. The recommended approach uses Web Speech API for free, real-time transcription, semantic matching (dice-coefficient or fuse.js) to handle paraphrasing, and confidence-based scroll control to prevent jittery behavior.

The critical differentiator is semantic matching over exact word matching. Competitors like PromptSmart use exact matching that breaks when users paraphrase; semantic matching with positional validation handles natural speech variations while avoiding false jumps. The tech stack is straightforward: Vite 8 + React 19 + TypeScript for structure, Web Speech API for transcription (88% browser coverage), dice-coefficient for lightweight fuzzy matching. No backend needed—everything runs client-side.

Key risks center on Web Speech API reliability and matching algorithm tuning. The API stops unexpectedly despite continuous mode, requiring automatic restart logic. Interim results create false matches and must be filtered. Semantic matching without positional context causes jumps to wrong sections. Error handling is critical—permission denial, network issues, and browser incompatibility affect 10-20% of users. The roadmap must address these systematically through phased implementation starting with rock-solid basics before adding intelligence.

## Key Findings

### Recommended Stack

The stack prioritizes speed to working prototype with proven technologies. Vite 8 provides 40% faster builds with Rolldown bundler. React 19.2 offers mature ecosystem but vanilla JS is viable for this scope. Web Speech API is the obvious choice for free, real-time STT (Chrome/Edge use Google's servers, Safari uses on-device). Transformers.js is optional fallback for Firefox/offline mode but adds 50-200MB model size.

**Core technologies:**
- **Vite 8**: Build tool with Rolldown-powered builds, fastest dev server, minimal config
- **React 19.2**: UI framework with mature ecosystem, though vanilla JS acceptable for simple teleprompter UI
- **TypeScript**: Type safety prevents bugs as complexity grows, especially for speech recognition callbacks
- **Web Speech API**: Browser-native STT, free, zero-latency interim results, 88% coverage (Chrome/Edge/Safari)
- **dice-coefficient**: Semantic text matching for paraphrasing, 700 bytes, pure algorithm (vs. fuse.js 3KB for more features)

**Critical constraint satisfaction:**
- Free AI: Web Speech API completely free (browser's built-in STT)
- Web-only: All browser-native APIs, no desktop packaging needed
- No backend: 100% client-side (STT in browser, localStorage for scripts, static hosting only)

**Version requirements:**
- Vite 8 with Rolldown (breaking changes from v5, check migration)
- React 19+ for Actions API (optional)
- Web Speech API requires Chrome 25+, Edge, Safari 14.1+ (webkit prefix), Firefox NOT supported

### Expected Features

**Must have (table stakes):**
- Script input (paste/import) — can't be a prompter without content
- Adjustable scroll speed — manual control baseline expectation
- Text size/color control — reading distance varies by setup
- Dark background — professional broadcast standard
- Pause/resume control — users need to stop and restart
- Script persistence — localStorage minimum, don't lose work
- Fullscreen mode — maximize screen real estate
- Mirror/flip text — hardware prompter compatibility

**Should have (competitive advantage):**
- **Semantic speech matching** — CORE DIFFERENTIATOR, handles paraphrasing not just exact words
- Intelligent pause detection — knows off-script vs. just pausing (confidence-based)
- Skip-ahead detection — auto-jumps when user skips sections (semantic matching enables)
- Visual confidence feedback — shows when AI is confident vs. uncertain
- Zero configuration — works immediately without calibration (beats PromptSmart's optimization requirements)
- Graceful degradation — smooth behavior when recognition uncertain (no erratic jumping)

**Defer (v2+):**
- Multi-language support — complex to test, validate English-first
- Speech model selection — premature optimization, start with one good model
- Keyboard shortcuts — power user feature, validate with basic controls first
- Script templates — need to understand user patterns first
- Reading stats (WPM, time remaining) — nice-to-have, not core value
- Teleprompter hardware mode — niche use case, validate software-only first

**Anti-features (commonly requested, problematic):**
- Perfect word-for-word tracking — forces robotic delivery, breaks on deviation
- Cloud script sync — adds auth/backend/costs, against free constraint
- Video recording integration — scope creep, many better dedicated tools exist
- Multi-user collaboration — requires backend, auth, real-time sync infrastructure
- Offline speech recognition — browser APIs require internet, local models too large for web

### Architecture Approach

The architecture separates audio capture, text matching, and UI control into independent services connected through centralized state management. Speech recognition produces uncertain data via event handlers. Text matcher resolves uncertainty using sliding window search (200 words before/after current position for performance). Scroll controller implements confidence-based state machine (scroll/pause/jump decisions based on confidence thresholds). React hooks provide clean facade between services and components.

**Major components:**
1. **Speech Recognition Service** — Web Speech API wrapper, handles continuous recognition with auto-restart on speechend
2. **Text Matcher Service** — Sliding window search with Levenshtein/dice-coefficient, returns position + confidence score
3. **Scroll Controller Service** — State machine for scroll decisions, smooths over confidence history to prevent jitter
4. **Application State (Zustand)** — Single source of truth: script content, position, recognition status, scroll state
5. **Teleprompter Display** — Pure presentation component with GPU-accelerated smooth scrolling
6. **Script Editor** — Input/edit interface with localStorage persistence

**Critical patterns:**
- Event-driven speech recognition (API is inherently event-based)
- Sliding window text matching (fast for long scripts, prevents false positives from distant matches)
- Confidence-based state machine (prevents jumpy scroll from interim results)
- React hook facade (keeps services framework-agnostic and testable)

**Data flow:** User speaks → Web Speech API → Recognition Service emits event → Text Matcher performs sliding window search → Scroll Controller decides (scroll/pause/jump) based on confidence → State updates → Display re-renders with smooth scroll

### Critical Pitfalls

1. **Web Speech API stops unexpectedly** — Even with continuous=true, API stops on speechend. Implement auto-restart on speechend and end events with state tracking (user intentional stop vs. engine timeout). Test continuous operation for 10+ minutes.

2. **Interim results create false matches** — Constantly changing interim transcripts cause erratic scrolling. Use interimResults=false OR only match on isFinal results. Show interim results in "listening..." indicator only, never for position matching.

3. **Semantic matching without validation** — Pure semantic matching finds similar content anywhere in script, causes false jumps. Combine with positional bias (weight near matches higher), sequence validation (require multiple consecutive matches), confidence thresholds (reject low confidence), direction constraints (prevent backward jumps unless explicit).

4. **Latency accumulation** — Multiple processing steps accumulate: transcription (300ms) + semantic matching (200ms) + confidence scoring (100ms) + scroll animation (200ms) = 800ms breaks real-time feel. Optimize critical path: exact string matching first (1-5ms), debounce semantic matching to final results only, precompute script embeddings, use Web Workers for heavy computation, CSS smooth-scroll instead of JS animation.

5. **No error recovery strategy** — When speech recognition fails (network, permission denied, language pack missing), app becomes unusable. Implement graceful degradation for every error type: network (retry with backoff), not-allowed (show manual mode + help), no-speech (auto-restart), audio-capture (show error + manual mode), language-not-supported (install language pack).

6. **Microphone permission UX disaster** — Immediate permission prompt on page load without context = high denial rate. Progressive permission request: show onboarding first, request on user action (click "Start Voice Control"), explain why mic needed, provide manual mode for denial.

7. **Testing only with clean audio** — Works in quiet office with good mic and perfect scripts, fails in production with background noise, poor mics, accents, typos. Test systematically with: noisy environments, cheap microphones, varied speakers, real scripts (copied from Word with formatting issues), edge cases (pauses, filler words, repeated words).

## Implications for Roadmap

Based on research, suggested phase structure follows dependency order from architecture:

### Phase 1: Core Display & Manual Control
**Rationale:** Establish UI foundation before adding complex speech recognition. Must work perfectly as manual teleprompter first.

**Delivers:**
- Script editor with paste/import
- Teleprompter display with manual scroll
- Text size/color/speed controls
- Dark theme
- Fullscreen mode
- localStorage persistence

**Addresses features:** Script input, adjustable scroll speed, text size control, dark background, pause/resume, script persistence, fullscreen

**Avoids pitfalls:** Testing with varied scripts (use real-world examples with formatting issues)

**Research needed:** NO — standard web UI patterns, well-documented

### Phase 2: Speech Recognition Foundation
**Rationale:** Get speech recognition working in isolation before adding matching complexity. Validate Web Speech API reliability and error handling.

**Delivers:**
- Web Speech API wrapper with event handling
- Microphone permission flow (progressive request with explanation)
- Auto-restart on speechend/end events
- Error recovery for all error types
- Manual mode fallback
- Visual listening state indicator
- Raw transcript display (debugging)

**Addresses features:** Zero configuration (auto-restart), graceful degradation (error handling)

**Avoids pitfalls:**
- Web Speech API stops unexpectedly (auto-restart)
- No error recovery (comprehensive error handler)
- Permission UX disaster (progressive request)
- Testing only with clean audio (test with background noise)

**Research needed:** NO — Web Speech API is well-documented, error types are known

### Phase 3: Basic Text Matching
**Rationale:** Prove matching concept with simplest algorithm first (exact string matching or Levenshtein). Establish performance baseline before adding semantic layer.

**Delivers:**
- Text matcher service with Levenshtein/dice-coefficient
- Exact substring match as fast path
- Sliding window search (200-word window around current position)
- Match confidence scoring
- Simple "scroll to best match" logic (no intelligence yet)

**Addresses features:** Semantic speech matching (basic version)

**Avoids pitfalls:**
- Interim results create false matches (only match on isFinal)
- Performance with long scripts (sliding window)
- Latency accumulation (exact match fast path)

**Research needed:** MAYBE — Sliding window implementation and confidence scoring tuning may need experimentation

### Phase 4: Intelligent Scroll Control
**Rationale:** Add intelligence after basic matching works. Polish UX with confidence-based decisions and smooth scrolling.

**Delivers:**
- Scroll controller state machine (idle/scrolling/paused/jumping)
- Confidence-based decisions with thresholds
- Confidence history smoothing (average last 5 results)
- Distance-based behavior (smooth scroll nearby, instant jump far)
- Speed calculation based on confidence + distance
- Visual confidence feedback (highlight matched text, dim on low confidence)

**Addresses features:** Intelligent pause detection, visual confidence feedback, graceful degradation

**Avoids pitfalls:**
- Interim results create false matches (state machine filters low confidence)
- Hijacking scroll control (pause auto-scroll when user manually scrolls)

**Research needed:** YES — Confidence threshold tuning requires real-world testing with varied speakers and conditions

### Phase 5: Advanced Matching & Validation
**Rationale:** Add semantic intelligence after basic system is solid. Only needed if exact matching proves insufficient.

**Delivers:**
- Positional bias (weight nearby matches higher)
- Sequence validation (require N consecutive matches before large jump)
- Skip-ahead detection (detect when user jumps sections)
- Direction constraints (prevent backward jumps unless explicit)
- Fallback to full-script search when sliding window fails

**Addresses features:** Skip-ahead detection, semantic speech matching (advanced)

**Avoids pitfalls:**
- Semantic matching without validation (positional context + confidence thresholds)
- Testing only with clean audio (requires extensive real-world testing)

**Research needed:** YES — Semantic matching validation strategies need research and testing

### Phase 6: Polish & Optimization
**Rationale:** Performance optimization and edge case handling after core functionality proven.

**Delivers:**
- Web Workers for text matching (if needed for long scripts)
- Virtualized scrolling with react-window (if needed for very long scripts)
- Browser compatibility polish (Safari webkit prefix, Firefox fallback message)
- Performance optimization (precompute embeddings, cache results)
- Edge case handling (filler words, stage directions, typos)

**Addresses features:** Browser compatibility, performance with long scripts

**Avoids pitfalls:**
- Blocking main thread with text matching (Web Workers)
- Naive full-script search (indexing for performance)
- Browser compatibility gaps (test all browsers)

**Research needed:** NO — Standard web performance optimization patterns

### Phase Ordering Rationale

- **UI first, voice second:** Must work as manual teleprompter before adding voice control. Reduces complexity, enables testing with real scripts early.
- **Basic before smart:** Exact matching before semantic matching. Prove simple algorithm first, measure where it fails, then add intelligence targeted at real problems.
- **Error handling from start:** Not deferred to polish phase. Web Speech API errors are common (10-20% of users), must be handled in Phase 2 when introducing speech recognition.
- **Confidence system central:** Phase 4's state machine is architectural fulcrum. Separates uncertain recognition from confident UI behavior.
- **Performance last:** Optimize only after validating that basic approach works and identifying actual bottlenecks through testing.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 4: Intelligent Scroll Control** — Confidence threshold tuning requires experimentation. No standard values, depends on Web Speech API behavior in 2026 and dice-coefficient scoring. Plan for iterative tuning with test users.
- **Phase 5: Advanced Matching & Validation** — Semantic matching strategies vary widely. Need to research positioning bias algorithms and sequence validation approaches. May require testing multiple algorithms.

Phases with standard patterns (skip research-phase):

- **Phase 1: Core Display & Manual Control** — Standard React UI patterns, well-documented
- **Phase 2: Speech Recognition Foundation** — Web Speech API thoroughly documented, error types known
- **Phase 3: Basic Text Matching** — Levenshtein algorithms well-established, implementations available
- **Phase 6: Polish & Optimization** — Standard web performance patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified via official docs (MDN, React.dev, Vite.dev). Web Speech API coverage 88% confirmed via caniuse.com. |
| Features | MEDIUM-HIGH | Feature expectations verified with competitor analysis (PromptSmart, Speakflow). User pain points from community sources. Anti-features inferred from common requests. |
| Architecture | MEDIUM-HIGH | Patterns verified with working examples (GitHub voice-activated teleprompter). State machine and sliding window standard algorithms. React patterns well-documented. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls verified via MDN official docs and 2026 technical resources. UX pitfalls inferred from scrolljacking research and competitor reviews. |

**Overall confidence:** HIGH for Phase 1-3 (basic functionality), MEDIUM for Phase 4-5 (tuning and intelligence)

### Gaps to Address

- **Confidence threshold values:** Research doesn't specify exact thresholds for scroll/pause/jump decisions. Must be determined experimentally in Phase 4 with real users and varied conditions.

- **Semantic matching algorithm choice:** Research presents dice-coefficient and fuse.js as options but doesn't conclusively recommend one. Phase 3 should test both with realistic scripts to measure accuracy vs. performance trade-offs.

- **Browser-specific behavior:** Web Speech API behavior may vary between Chrome/Edge (Google servers) and Safari (on-device). Need browser-specific testing in Phase 2 to identify quirks.

- **Performance targets:** Research mentions sliding window for scripts > 5000 words but doesn't specify performance targets. Phase 3 should establish baseline (e.g., "< 100ms match time for real-time feel") based on actual implementation.

- **Interim results strategy:** Research says "don't use for matching" but doesn't specify if they should be shown to users for feedback. Phase 2 should test whether showing interim results improves perceived responsiveness without causing confusion.

## Sources

### Primary (HIGH confidence)
- [Web Speech API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) — API specification and usage patterns
- [Speech Recognition Browser Support - Can I Use](https://caniuse.com/speech-recognition) — 88% browser coverage verification
- [Transformers.js v3 Documentation](https://huggingface.co/docs/transformers.js/) — Optional semantic matching fallback
- [React 19.2 Release Notes](https://react.dev/blog/2025/10/01/react-19-2) — Latest React features
- [Vite 8 Beta Announcement](https://vite.dev/blog/announcing-vite8-beta) — Rolldown bundler details
- [dice-coefficient on npm](https://www.npmjs.com/package/dice-coefficient) — Lightweight matching algorithm
- [fuse.js on npm](https://www.npmjs.com/package/fuse.js) — Alternative fuzzy matching
- [fastest-levenshtein npm](https://www.npmjs.com/package/fastest-levenshtein) — Performance-optimized distance calculation

### Secondary (MEDIUM confidence)
- [PromptSmart](https://promptsmart.com/) — Leading competitor analysis (VoiceTrack exact matching approach)
- [Speakflow](https://www.speakflow.com/) — Competitor feature comparison
- [Voice-Activated Teleprompter GitHub](https://github.com/jlecomte/voice-activated-teleprompter) — Real implementation example
- [Top APIs for real-time STT 2026 - AssemblyAI](https://www.assemblyai.com/blog/best-api-models-for-real-time-speech-recognition-and-transcription) — Ecosystem survey
- [State Management in 2026 - Nucamp](https://www.nucamp.co/blog/state-management-in-2026-redux-context-api-and-modern-patterns) — React state patterns
- [Top 7 Speech Recognition Challenges 2026 - AIMultiple](https://research.aimultiple.com/speech-recognition-challenges/) — Domain pitfalls
- [Fuzzy Matching 101 - MatchDataPro](https://matchdatapro.com/fuzzy-matching-101-a-complete-guide-for-2026/) — Matching techniques

### Tertiary (LOW confidence - needs validation)
- [Voice Scroll Feature - Teleprompter.com](https://www.teleprompter.com/blog/voice-scroll-teleprompter-app-new-feature) — Marketing content describing smooth scrolling
- [Best Teleprompter Apps 2026 - Setapp](https://setapp.com/app-reviews/best-teleprompter-apps) — User feature expectations
- [Common Teleprompter Issues - Foxcue](https://foxcue.com/blog/common-teleprompter-issues-and-quick-resolutions/) — User pain points

---
*Research completed: 2026-01-22*
*Ready for roadmap: yes*
