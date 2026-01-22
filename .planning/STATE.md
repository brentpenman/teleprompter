# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-22)

**Core value:** The teleprompter follows YOU, not the other way around. It matches your natural speaking rhythm and handles the messiness of real speech.
**Current focus:** Phase 3 - Basic Text Matching

## Current Position

Phase: 3 of 4 (Basic Text Matching)
Plan: 2 of TBD in current phase
Status: In progress
Last activity: 2026-01-22 — Completed 03-02-PLAN.md

Progress: [██████░░░░] 60%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 1.7 minutes
- Total execution time: 0.21 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3 | 5m | 1.6m |
| 02 | 3 | 5.5m | 1.8m |
| 03 | 2 | 4.1m | 2.0m |

**Recent Trend:**
- Last 5 plans: 02-02 (1m), 02-03 (3m), 03-01 (2m), 03-02 (2.1m)
- Trend: Consistent velocity

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
- Dim previous text to 50% opacity (03-02, visual feedback of progress)

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

Last session: 2026-01-22
Stopped at: Completed 03-02-PLAN.md (Text Highlighting)
Resume file: None
