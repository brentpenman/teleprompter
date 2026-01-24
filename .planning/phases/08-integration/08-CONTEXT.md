# Phase 8: Integration - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire new pipeline (SpeechRecognizer → WordMatcher → PositionTracker → ScrollController), remove old components (TextMatcher.js, ScrollSync.js, ConfidenceLevel.js), and verify end-to-end functionality. Components already exist from Phases 5-7; this phase connects them and cleans up.

</domain>

<decisions>
## Implementation Decisions

### Transition approach
- Swap all at once — no parallel pipelines or feature flags
- Delete old files immediately, then fix import errors (forces clean break)
- Clean sweep of old wiring in main.js/app.js — remove and replace, don't trace incrementally
- Recovery via git revert if something breaks (atomic commits)

### Debugging/observability
- Debug overlay (caret slider, tracking indicator) stays in production
- Access via keyboard shortcut (not settings panel)
- Console logging silent in production — no info/debug logs unless debug mode enabled
- Export state button in debug overlay — copies current state as JSON for issue reporting

### Claude's Discretion
- Specific keyboard shortcut for debug overlay
- JSON structure for state export
- Order of operations during wiring

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-integration*
*Context gathered: 2026-01-24*
