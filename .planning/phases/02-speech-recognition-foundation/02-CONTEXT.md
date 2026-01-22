# Phase 2: Speech Recognition Foundation - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate Web Speech API to reliably capture and transcribe user speech with clear visual feedback and graceful error handling. The app becomes voice-aware but does not yet match speech to script position (that's Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Listening Indicator
- Corner overlay position — always visible, even in fullscreen
- Waveform bars style — animated audio bars that react to voice input
- Two states only: listening (animated) and not listening
- Hidden completely when voice mode is disabled

### Permission Flow
- Request mic permission on first voice toggle, not at page load
- If denied: brief error message, voice toggle becomes disabled, stays in manual mode
- No special loading state while waiting for permission dialog — browser dialog is sufficient
- Rely on browser's permission memory, no app-level tracking needed

### Error Handling
- Auto-retry silently when recognition fails mid-session
- Retry indefinitely — never give up automatically
- Indicator turns red/amber during retry attempts to show trouble state
- If browser doesn't support Web Speech API: show disabled toggle with tooltip explaining browser support

### Session Continuity
- Auto-restart recognition immediately when it ends (no delay)
- Voice mode preference persists across page reloads
- Keep listening even when tab is in background
- Use continuous mode (continuous=true) for ongoing recognition

### Claude's Discretion
- Exact waveform animation implementation
- Retry timing/backoff strategy
- Specific error message wording
- Color choices for error state

</decisions>

<specifics>
## Specific Ideas

- Waveform should feel responsive to actual voice input, not just a generic animation
- Error state (red indicator) should be noticeable but not alarming — user is still in control via manual mode

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-speech-recognition-foundation*
*Context gathered: 2026-01-22*
