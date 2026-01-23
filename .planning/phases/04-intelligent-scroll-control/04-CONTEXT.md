# Phase 4: Intelligent Scroll Control - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the teleprompter behave like a human operator — scrolling when confident in the match, pausing when uncertain, and handling off-script moments gracefully. This includes off-script detection, confidence visualization, skip-ahead handling, and smooth scroll dynamics.

</domain>

<decisions>
## Implementation Decisions

### Off-script detection
- Patient threshold: 3-5 seconds of mismatch before considering off-script
- When off-script: Keep scrolling at current pace, but stop before the last spoken line scrolls out of view
- Treat all mismatches uniformly — no special handling for filler words beyond Phase 3's existing filtering
- When returning to script: Resume from where the user IS now (find current position), not where they left off

### Confidence indicator
- Location: Integrated with the existing audio waveform visualizer
- Visualization: Opacity/brightness — bright when confident, dim when uncertain
- Three confidence levels: high / medium / low (not binary, not continuous)
- Visual only — no text labels

### Skip-ahead behavior
- Animation depends on distance: short skips scroll smoothly, long skips jump instantly
- Forward skips: require very high confidence to avoid false jumps
- Backward skips: require even higher confidence than forward (less common, more likely a mistake)
- **Remove dimming entirely** — no more dimmed/read text (user found it annoying)

### Scrolling feel
- Catch-up: Gradual acceleration over 1-2 seconds when behind (not instant snap)
- Pause: Brief coast (~0.5s deceleration), but NEVER let last spoken text scroll off screen
- Resume: Ramp up smoothly over ~1 second, don't snap to full speed
- No maximum speed cap — always match user's speaking pace

### Claude's Discretion
- Exact timing values for thresholds (within the ranges specified)
- Specific easing curves for scroll animations
- How to calculate "distance" for short vs long skip threshold
- Internal confidence calculation algorithm

</decisions>

<specifics>
## Specific Ideas

- "The teleprompter follows YOU, not the other way around" — this is the core value
- Never let the last spoken line scroll off screen — this is a hard constraint on all pause/stop behavior
- The scroll should feel like a human operator is controlling it — smooth, responsive, but not robotic

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-intelligent-scroll-control*
*Context gathered: 2026-01-23*
