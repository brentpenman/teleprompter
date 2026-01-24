# Phase 7: ScrollController - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

React to position confirmations from PositionTracker to scroll the teleprompter display. The caret stays at a fixed screen position, content scrolls to it, and scroll speed derives from the user's actual speech pace. Visual highlighting and state feedback for tracking vs holding.

</domain>

<decisions>
## Implementation Decisions

### Caret positioning
- Position at upper third (~33%) of screen — more upcoming text visible below
- User-adjustable via settings slider (persists across sessions)
- Visual indicator: subtle horizontal line across width — minimal, doesn't compete with text
- Caret line always visible — consistent anchor point even when holding

### Scroll animation
- Continuous smooth scrolling derived from speech pace — text glides steadily
- On skip detection (position jump): quick animated jump — fast but visible transition to new position
- Static hold on pause — no animation or visual change, scroll simply stops
- Continuously adaptive speed — adjusts in real-time as user speaks faster/slower

### Claude's Discretion
- Exact easing curves for scroll and jump animations
- Settings slider UI implementation details
- How to calculate speech pace from position confirmations
- Tracking vs holding state machine internals

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

*Phase: 07-scrollcontroller*
*Context gathered: 2026-01-24*
