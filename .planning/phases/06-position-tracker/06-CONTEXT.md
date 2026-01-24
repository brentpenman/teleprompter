# Phase 6: PositionTracker - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Maintain `confirmedPosition` as the single source of truth using a two-position model (floor + ceiling). PositionTracker receives match candidates from WordMatcher and decides when to advance position. It handles skip detection by requiring consecutive-word confirmation before jumping. ScrollController queries this position but PositionTracker does not control scrolling directly.

</domain>

<decisions>
## Implementation Decisions

### Confirmation threshold
- Single high-confidence match advances position (no need for consecutive words in normal tracking)
- Nearby matches need less confidence than distant matches (~10 words = easier threshold)
- Position jumps to match location internally (ScrollController handles smooth display)
- Ignore backward matches entirely — only consider matches at or ahead of current position

### Skip behavior
- Skip confirmation is distance-dependent:
  - Small skip (10-30 words): 4 consecutive matching words required
  - Large skip (50+ words): Claude's discretion (5-6 words, keeping repeated-phrase safety in mind)
- No cooldown between skips — allow rapid consecutive skips if matches confirm
- Be conservative about repeated phrases — distance-weighted scoring from WordMatcher helps, but require more confirmation for larger jumps

### Backward handling
- Hold position when user reads earlier content — no automatic backward movement
- Auto-resume when speech matches near held position again (no manual intervention needed)
- No visual indicator for held state — hold silently

### Claude's Discretion
- Exact confidence threshold values
- Manual scroll handling (pause vs. continue tracking)
- Large skip consecutive word count (5 or 6)
- Two-position model implementation details (floor/ceiling mechanics)

</decisions>

<specifics>
## Specific Ideas

- "The prompter should scroll smoothly, as if someone was operating it like a traditional prompter — it can scroll fast, but it needs to be smooth, not jumpy" (this is ScrollController's job, but PositionTracker can jump internally)
- Concern about accidentally matching repeated phrases — distance weighting helps, but stay conservative

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-position-tracker*
*Context gathered: 2026-01-24*
