# Phase 1: Core Display & Manual Control - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a professional manual teleprompter with script input and manual scroll controls. User can paste a script, switch to teleprompter mode, and scroll through it manually with adjustable speed and text size. No voice control yet — that's Phase 2+.

</domain>

<decisions>
## Implementation Decisions

### Script Input Flow
- Same screen layout — editor and teleprompter modes toggle on the same page
- Must switch back to editor mode to make changes (no inline editing in teleprompter view)
- Paste only — simple textarea, no file upload
- Plain text only — no markdown or formatting support

### Display Presentation
- Left-aligned paragraphs — normal reading flow, not centered lines
- Reading marker — fixed indicator (line or arrow) at reading position, text scrolls past it
- Moderate visibility — 6-10 lines of text visible at once
- Reading position in top third — user reads near top, sees upcoming text below

### Controls Placement
- Auto-hide overlay — controls appear on mouse move or tap, fade after inactivity
- Plus/minus buttons for speed adjustment (not slider or presets)
- Essential controls in overlay: Play/Pause, Speed (+/-), Text size (+/-), Exit/Edit button
- Controls positioned at bottom of screen

### Visual Polish
- Pure black (#000) background with white text — maximum contrast, classic broadcast look
- Smooth continuous scrolling — text glides at constant speed, no stepping
- Instant mode transitions — no fade animations between editor and teleprompter
- System sans-serif font — use device default, no custom font loading

### Claude's Discretion
- Exact overlay fade timing
- Specific line height and letter spacing
- Reading marker design (line vs arrow vs highlight)
- Speed range and increment values
- Text size range and increment values

</decisions>

<specifics>
## Specific Ideas

- Broadcast teleprompter aesthetic — the dark background + high contrast text is deliberate for professional look
- Reading position in top third gives lookahead — user sees what's coming

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-core-display-manual-control*
*Context gathered: 2026-01-22*
