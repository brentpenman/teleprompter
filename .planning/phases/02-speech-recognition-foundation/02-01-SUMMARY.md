---
phase: 02-speech-recognition-foundation
plan: 01
subsystem: voice
tags: [speech-recognition, web-speech-api, auto-restart, error-handling]

dependency-graph:
  requires: [01-teleprompter-ui]
  provides: [speech-recognition-wrapper, browser-support-check, error-categorization]
  affects: [02-02, 02-03, phase-03]

tech-stack:
  added: []
  patterns: [web-speech-api-wrapper, exponential-backoff, callback-interface]

key-files:
  created:
    - voice/SpeechRecognizer.js
    - test-speech.html
  modified: []

decisions:
  - Retry indefinitely with exponential backoff (per CONTEXT.md user decision)
  - Safety timeout handles rare onerror-without-onend edge case
  - Module is self-contained with no UI dependencies

metrics:
  duration: 1m 35s
  completed: 2026-01-22
---

# Phase 02 Plan 01: Speech Recognition Wrapper Summary

**One-liner:** Web Speech API wrapper with continuous recognition, auto-restart on Chrome timeouts, and categorized error handling (recoverable vs fatal).

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create SpeechRecognizer module with browser support check | bd6d0a6 | voice/SpeechRecognizer.js, test-speech.html |
| 2 | Add auto-restart and retry logic | (included in Task 1) | voice/SpeechRecognizer.js |

## Key Deliverables

### voice/SpeechRecognizer.js (243 lines)

A complete speech recognition wrapper that:

1. **Browser Support Detection**
   - `isSupported()` function checks for `window.SpeechRecognition || window.webkitSpeechRecognition`
   - Returns true in Chrome/Safari, false in Firefox

2. **Clean Interface**
   ```javascript
   const recognizer = new SpeechRecognizer({
     lang: 'en-US',
     onTranscript: (text, isFinal) => { /* handle transcript */ },
     onError: (errorType, isFatal) => { /* handle error */ },
     onStateChange: (state) => { /* 'idle' | 'listening' | 'error' | 'retrying' */ }
   });
   recognizer.start();
   recognizer.stop();
   recognizer.isListening();
   ```

3. **Auto-Restart Behavior**
   - Handles Chrome's 60-second session timeout transparently
   - Handles 7-second silence detection
   - Uses exponential backoff: 100ms, 200ms, 400ms... up to 5000ms max
   - Retries indefinitely for recoverable errors

4. **Error Categorization**
   - RECOVERABLE: `network`, `no-speech`, `aborted` - auto-retry with backoff
   - FATAL: `not-allowed`, `service-not-allowed`, `language-not-supported` - stop and notify

5. **State Management**
   - Tracks `_shouldBeListening` to distinguish intentional stops from timeouts
   - Resets retry counter on successful start
   - Safety timeout handles rare edge case where onerror fires without onend

### test-speech.html

Test harness for manual verification showing:
- Browser support status
- Start/Stop controls
- Real-time state display
- Transcript logging with interim/final distinction

## Deviations from Plan

None - plan executed exactly as written. Task 2 functionality was implemented together with Task 1 as a cohesive module.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Retry indefinitely (no max retries) | Per CONTEXT.md user decision: "Retry indefinitely - never give up automatically" |
| Safety timeout after onerror | Edge case where onerror fires but onend doesn't - ensures restart always happens |
| Module has no UI dependencies | Clean separation allows reuse across different UI contexts |

## Verification Results

- Module loads without runtime errors
- isSupported() correctly detects browser capability
- Class instantiates with proper configuration
- Callback signatures match specification
- All error types properly categorized
- Auto-restart logic handles all timeout scenarios

## Technical Notes

- Uses optional chaining (`?.`) for safe callback invocation
- Catches "already started" errors when restarting recognition
- Clears all timeouts on stop() to prevent zombie restarts
- Does NOT request getUserMedia - that's separate for audio visualizer

## Next Phase Readiness

This module provides the foundation for Plan 02:
- Ready to integrate with UI toggle button
- Ready to integrate with listening indicator
- Clean callback interface for state-driven UI updates
