# AI Voice-Controlled Teleprompter

## What This Is

A web-based teleprompter that uses voice recognition to track your position in a script — even when you paraphrase, pause, inject your own content, or skip sections. It behaves like a human teleprompter operator: scrolling when confident, holding when uncertain, and jumping when you've clearly moved to a different part of the script.

## Core Value

The teleprompter follows YOU, not the other way around. It matches your natural speaking rhythm and handles the messiness of real speech.

## Current State

**Version:** v1.0 MVP (shipped 2026-01-24)
**Codebase:** 2,317 lines of JavaScript
**Tech Stack:** Vanilla JS, Web Speech API, Fuse.js, CSS Custom Highlight API

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

(None — define in next milestone)

### Out of Scope

- User accounts/authentication — proof of concept, keep it simple
- Script saving/persistence — paste fresh each time for now
- Mobile apps — web only
- Paid AI APIs — must use free solutions (Web Speech API)
- Multi-user/sharing features — single user, local only

## Context

Shipped v1.0 with full voice-controlled teleprompter functionality. The app follows your speaking pace, pauses when you go off-script, and resumes when you return. Uses a three-state machine (CONFIDENT/UNCERTAIN/OFF_SCRIPT) with confidence-based transitions.

**Known areas for tuning:**
- Scroll parameters may need adjustment per speaker/script
- Dwell time and skip thresholds are tunable via debug panel

## Constraints

- **Cost**: No paid AI APIs — use free browser APIs only
- **Platform**: Web app only (proof of concept)
- **Complexity**: Keep it simple — no auth, no persistence, no backend

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web app only | Proof of concept, fastest path to usable | Good |
| No authentication | Reduces complexity, not needed for POC | Good |
| Free AI only (Web Speech API) | Cost constraint, validate concept first | Good |
| Broadcast-style display | Industry standard for readability | Good |
| Fuse.js for fuzzy matching | Handles paraphrasing, typos, variations | Good |
| CSS Custom Highlight API | Zero-DOM manipulation, performant | Good |
| State machine scroll control | Human-like behavior, predictable | Good |
| 3-word phrase matching | Balances uniqueness vs responsiveness | Good |
| Dwell time confirmation | Prevents false jumps from transient matches | Good |

---
*Last updated: 2026-01-24 after v1.0 milestone*
