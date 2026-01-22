# Phase 3: Basic Text Matching - Context

**Gathered:** 2026-01-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Match spoken words to position in script and scroll accordingly. User speaks words from script and app scrolls to matching position. Handles slight paraphrasing. Highlights current matched position.

Intelligent scroll control (confidence thresholds, pause detection, ad-lib handling) belongs in Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Matching strategy
- Hybrid approach: track words individually but require 2-3 consecutive matches to confirm position
- Very fuzzy matching: handle phonetic similarity and significant paraphrasing
- Search full script, but require higher confidence for distant matches
- Ignore filler words entirely ('um', 'uh', 'like', 'you know')
- Use surrounding context to disambiguate repeated words
- Use punctuation as pause hints for expected speech rhythm
- Case insensitive matching
- Normalize numbers: '15' matches 'fifteen', '2024' matches 'twenty twenty-four'

### Scroll response
- Smooth animation to matched position (~200-500ms)
- Keep matched text at reading marker position (where eyes naturally focus)
- Auto-adjust scroll speed to match speaking pace
- Manual controls coexist with voice control — manual can nudge position

### Visual highlighting
- Highlight current phrase (2-5 words), not just single word
- Text color change for highlight (brighter or different hue)
- Previously matched text becomes dimmer (fade effect)
- Smooth transition between highlighted positions
- Highlighting is toggleable — on by default, user can disable
- Preference should persist

### Match failures
- Keep scrolling at current speed when no match found
- Subtle visual indicator when matching is lost (e.g., highlight fades)
- Use context to choose best match when multiple positions could match
- Stay course after extended no-match — don't widen search aggressively

### Claude's Discretion
- Exact fuzzy matching algorithm
- Animation easing curves
- Highlight color choice
- Subtle indicator implementation details

</decisions>

<specifics>
## Specific Ideas

- The teleprompter follows the speaker — not the other way around
- Matching should feel natural, like a human operator anticipating where you are

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-basic-text-matching*
*Context gathered: 2026-01-22*
