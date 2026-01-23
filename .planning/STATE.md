# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-22)

**Core value:** The teleprompter follows YOU, not the other way around. It matches your natural speaking rhythm and handles the messiness of real speech.
**Current focus:** Phase 4 - Intelligent Scroll Control

## Current Position

Phase: 4 of 4 (Intelligent Scroll Control)
Plan: 3 of 4 in current phase
Status: In progress
Last activity: 2026-01-23 — Completed 04-03-PLAN.md (intelligent scroll control)

Progress: [█████████░] 89%

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 2.4 minutes
- Total execution time: 0.47 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | 5m | 1.6m |
| 02 | 3 | 5.5m | 1.8m |
| 03 | 3 | 19m | 6.3m |
| 04 | 3 | 4.5m | 1.5m |

**Recent Trend:**
- Last 5 plans: 03-02 (2.1m), 03-03 (15m with tuning), 04-02 (1m), 04-01 (1.5m), 04-03 (2m)
- Trend: Phase 4 plans executing quickly (~1.5 min average)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Web app only for proof of concept (fastest path to usable)
- No authentication to reduce complexity
- Free AI only (Web Speech API, no paid APIs)
- Broadcast-style display (industry standard for readability)
- Use Proxy pattern for state management (01-01, enables reactive updates)
- System font stack instead of custom fonts (01-01, zero latency)
- Left-aligned text not centered (01-01, broadcast standard)
- Reading marker as left-facing carat (01-03, user preference)
- Speed range 10-200 pixels/second (01-02, balances precision and speed)
- Font size range 24-96px (01-02, readable on all screens)
- Auto-hide controls after 3 seconds (01-02, distraction-free reading)
- Keyboard shortcuts follow conventions (01-02, Space/F/Escape/arrows)
- 10 frequency bars with 2px gaps for waveform (02-02, clean visual)
- Green normal, amber error state for indicator (02-02, clear feedback)
- Retry indefinitely with exponential backoff (02-01, never give up automatically)
- Fuzzy threshold 0.3 for Fuse.js (03-01, balance strictness and error handling)
- 3-word window with 2+ consecutive matches (03-01, disambiguate while staying responsive)
- Forward search first (03-01, performance + handles repeated phrases)
- Stopword + custom filler filtering (03-01, ignore speech artifacts)
- CSS Custom Highlight API for highlighting (03-02, zero-DOM-manipulation performance)
- Phrase-level highlighting (3 words) not single word (03-02, better reading context)
- ~~Dim previous text to 50% opacity (03-02, visual feedback of progress)~~ REMOVED in 04-02 (user found annoying)
- No dimming of previously read text (04-02, cleaner visual experience per user feedback)
- Pace-based scrolling not position-jumping (03-03, smooth teleprompter feel)
- Process interim results not just final (03-03, responsive feedback)
- Position-based stopping (03-03, never scroll past matched phrase)
- Three confidence levels high/medium/low (04-01, visual clarity)
- Opacity modulation: high=1.0, medium=0.6, low=0.3 (04-01, brightness feedback)
- Smooth opacity transitions with 0.1 blend factor (04-01, gradual visual change)
- State machine: CONFIDENT/UNCERTAIN/OFF_SCRIPT (04-03, human-like scroll behavior)
- Forward skip confidence: 0.85, backward skip: 0.92 (04-03, prevent false jumps)
- Patient threshold: 4s before off-script (04-03, allow speaker recovery)
- Exponential easing: accel=1500ms, decel=500ms (04-03, smooth speed transitions)
- Never scroll past lastMatchedPosition (04-03, keep spoken text visible)

### Pending Todos

None yet.

### Blockers/Concerns

**From 03-01:**
- Fuzzy threshold (0.3) may need tuning after real voice testing
- Window size (3 words) and consecutive match requirement (2+) are estimates - may need adjustment
- Number normalization only covers 0-1000 - may need expansion for larger numbers
- No character-level position tracking yet (only word-level) - will need this for exact highlighting

**From 03-02:**
- CSS Custom Highlight API requires modern browser (Chrome 105+, Safari 17.2+) - graceful degradation included but highlighting won't work in older browsers

## Session Continuity

Last session: 2026-01-23
Stopped at: Completed 04-03-PLAN.md (intelligent scroll control with state machine)
Resume file: None

### Tuning Notes for Future Sessions

ScrollSync parameters that may need adjustment:
- `baseSpeed`: 60 px/s (default scroll speed)
- `patientThreshold`: 4000ms (time before transitioning to OFF_SCRIPT)
- `accelerationTimeConstant`: 1500ms (ramp up smoothness)
- `decelerationTimeConstant`: 500ms (slow down speed)
- `forwardSkipConfidence`: 0.85 (threshold for forward skips)
- `backwardSkipConfidence`: 0.92 (threshold for backward skips)
- `shortSkipThreshold`: 20 words (smooth scroll vs instant jump cutoff)
- `longSkipThreshold`: 100 words (instant jump cutoff)
