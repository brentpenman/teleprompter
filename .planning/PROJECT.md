# AI Voice-Controlled Teleprompter

## What This Is

A web-based teleprompter that uses voice recognition to track your position in a script — even when you paraphrase, pause, inject your own content, or skip sections. It behaves like a human teleprompter operator: scrolling when confident, holding when uncertain, and jumping when you've clearly moved to a different part of the script.

## Core Value

The teleprompter follows YOU, not the other way around. It matches your natural speaking rhythm and handles the messiness of real speech.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can paste/enter a script into the app
- [ ] App listens to user's speech via microphone
- [ ] App matches spoken words to position in script (semantic matching, not just literal)
- [ ] Display scrolls to follow detected position
- [ ] Scrolling pauses when confidence is low (off-script, interjections)
- [ ] Scrolling resumes when back on track
- [ ] App handles skipped sections by jumping to new position
- [ ] Broadcast-style display: dark background, large text, few lines visible
- [ ] User can adjust font size
- [ ] Smooth scrolling animation

### Out of Scope

- User accounts/authentication — proof of concept, keep it simple
- Script saving/persistence — paste fresh each time for now
- Mobile apps — web only
- Paid AI APIs — must use free solutions (Web Speech API, local models, or clever heuristics)
- Multi-user/sharing features — single user, local only

## Context

Traditional teleprompters are "dumb scrollers" — they move at a fixed pace and you have to match them. Professional setups have human operators who watch and adjust, but that's expensive and not available for solo creators.

The opportunity is using AI to replicate that human operator behavior: listen, match, and react intelligently to the speaker's actual pace and content.

**Technical landscape:**
- Web Speech API provides free browser-based speech recognition
- Semantic matching (for paraphrasing) could use: browser-based ML models (transformers.js), fuzzy string matching, or hybrid approaches
- No backend required for proof of concept — can run entirely client-side

## Constraints

- **Cost**: No paid AI APIs — use free browser APIs and local/free models only
- **Platform**: Web app only (proof of concept)
- **Complexity**: Keep it simple — no auth, no persistence, no backend if avoidable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Web app only | Proof of concept, fastest path to usable | — Pending |
| No authentication | Reduces complexity, not needed for POC | — Pending |
| Free AI only | Cost constraint, validate concept before investing | — Pending |
| Broadcast-style display | Industry standard for readability | — Pending |

---
*Last updated: 2026-01-22 after initialization*
