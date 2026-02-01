# AI Voice-Controlled Teleprompter

## What This Is

A web-based teleprompter that uses voice recognition to track your position in a script — even when you paraphrase, pause, inject your own content, or skip sections. It behaves like a human teleprompter operator: scrolling when confident, holding when uncertain, and jumping when you've clearly moved to a different part of the script.

## Core Value

The teleprompter follows YOU, not the other way around. It matches your natural speaking rhythm and handles the messiness of real speech.

## Current State

**Version:** v1.0 MVP (shipped 2026-01-24)
**Codebase:** 2,317 lines of JavaScript
**Tech Stack:** Vanilla JS, Web Speech API, Fuse.js, CSS Custom Highlight API

## Current Milestone: v1.2 Offline Voice Recognition

**Goal:** Replace Web Speech API with Vosk offline recognition to eliminate Android beep and enable fully offline operation.

**Target features:**
- Vosk WebAssembly integration for beep-free recognition on Android
- VoskRecognizer class (drop-in replacement for SpeechRecognizer)
- Model download and IndexedDB caching system (50MB English model)
- AudioWorklet-based real-time audio processing
- Recognition engine selection (Vosk vs Web Speech API)
- Model download progress UI
- Full offline capability after initial model download
- Cross-platform validation (Android, iOS, Desktop)

**Core principle:** Voice recognition should work silently and offline without relying on cloud services or triggering system notifications.

## Requirements

### Validated

- DISP-01: User can paste/enter script text into the app — v1.0
- DISP-02: User can start/pause manual scrolling — v1.0
- DISP-03: User can adjust scroll speed — v1.0
- DISP-04: User can adjust text size — v1.0
- DISP-05: Display shows dark background with light text (broadcast style) — v1.0
- DISP-06: User can enter fullscreen mode — v1.0
- VOICE-01: App requests microphone access and captures speech — v1.0
- VOICE-02: App shows visual indicator when listening — v1.0
- VOICE-03: App automatically restarts recognition when it stops — v1.0
- VOICE-04: App recovers gracefully from errors with manual fallback — v1.0
- TRACK-01: App matches spoken words to script position — v1.0
- TRACK-02: App scrolls display when confident in position match — v1.0
- TRACK-03: App pauses scrolling when confidence is low — v1.0
- TRACK-04: App detects when user skips sections and jumps to new position — v1.0
- TRACK-05: App shows visual feedback indicating match confidence level — v1.0

### Active

(Defined in REQUIREMENTS.md for this milestone)

### Out of Scope

- User accounts/authentication — proof of concept, keep it simple
- Script saving/persistence — paste fresh each time for now
- Mobile apps — web only
- Paid AI APIs — must use free solutions (Web Speech API)
- Multi-user/sharing features — single user, local only

## Context

Shipped v1.0 with full voice-controlled teleprompter functionality. However, real-world testing revealed the position-tracking logic is fundamentally flawed:
- Too sensitive and not sensitive enough simultaneously
- Scroll speed doesn't match speaking pace
- No awareness of font size affecting scroll distance
- Repeated phrases cause false jumps
- Display can get ahead of where user actually is

The v1.1 milestone will rewrite the entire following-along system from first principles, keeping only the smooth scroll animation mechanics and visual highlighting.

**Design principles for rewrite:**
1. Next words to speak always at caret (fixed position)
2. Scroll is reactive to confirmed speech, not predictive
3. Strong positional bias — prefer nearby matches
4. Conservative forward movement — never ahead of confirmed position
5. Skip detection requires consecutive-word confirmation

## Constraints

- **Cost**: No paid AI APIs — use free browser APIs only
- **Platform**: Web app only (proof of concept)
- **Complexity**: Keep it simple — no auth, no persistence, no backend
- **Preserve**: Keep smooth scroll animation mechanics (they work well)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web app only | Proof of concept, fastest path to usable | Good |
| No authentication | Reduces complexity, not needed for POC | Good |
| Free AI only (Web Speech API) | Cost constraint, validate concept first | Good |
| Broadcast-style display | Industry standard for readability | Good |
| Fuse.js for fuzzy matching | Handles paraphrasing, typos, variations | Good |
| CSS Custom Highlight API | Zero-DOM manipulation, performant | Good |
| State machine scroll control | Human-like behavior, predictable | ⚠️ Revisit — too complex, rewriting |
| 3-word phrase matching | Balances uniqueness vs responsiveness | ⚠️ Revisit — needs positional context |
| Dwell time confirmation | Prevents false jumps from transient matches | ⚠️ Revisit — rethinking approach |
| Rewrite following logic | v1.0 approach fundamentally flawed | — Pending |

---
*Last updated: 2026-02-01 after v1.2 milestone start*
