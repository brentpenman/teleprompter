# Roadmap: AI Voice-Controlled Teleprompter

## Milestones

- v1.0 MVP - Phases 1-4 (shipped 2026-01-24)
- **v1.1 Following-Along Rewrite** - Phases 5-8 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-4) - SHIPPED 2026-01-24</summary>

### Phase 1: Foundation
**Goal**: Project scaffolding and basic teleprompter display
**Plans**: 3 plans

Plans:
- [x] 01-01: Project scaffolding
- [x] 01-02: Basic teleprompter display
- [x] 01-03: Manual scroll and controls

### Phase 2: Speech Recognition
**Goal**: Capture and process user speech
**Plans**: 4 plans

Plans:
- [x] 02-01: Microphone access and Web Speech API
- [x] 02-02: Audio visualizer
- [x] 02-03: Auto-restart and error recovery
- [x] 02-04: Visual feedback indicators

### Phase 3: Text Matching
**Goal**: Match spoken words to script position
**Plans**: 3 plans

Plans:
- [x] 03-01: Fuzzy text matching with Fuse.js
- [x] 03-02: Confidence scoring
- [x] 03-03: Visual highlighting

### Phase 4: Scroll Control
**Goal**: Intelligent scroll behavior based on match confidence
**Plans**: 3 plans

Plans:
- [x] 04-01: Confidence-based state machine
- [x] 04-02: Skip detection
- [x] 04-03: Smooth scroll animation
- [x] 04-04: Parameter tuning

</details>

### v1.1 Following-Along Rewrite (In Progress)

**Milestone Goal:** Completely rewrite position-tracking and scroll logic to follow the user naturally. The teleprompter should confirm where you ARE, not predict where you'll BE.

**Core Principles:**
1. Next words to speak always at caret (fixed position)
2. Scroll is reactive to confirmed speech, not predictive
3. Strong positional bias - prefer nearby matches
4. Never scroll ahead of confirmed position
5. Skip detection requires consecutive-word confirmation

- [ ] **Phase 5: WordMatcher** - Pure matching foundation with distance-weighted scoring
- [ ] **Phase 6: PositionTracker** - Confirmation logic with two-position model
- [ ] **Phase 7: ScrollController** - Reactive display with pace-derived scrolling
- [ ] **Phase 8: Integration** - Wire pipeline, remove old components

## Phase Details

### Phase 5: WordMatcher
**Goal**: Create a stateless matching component that scores candidates by both fuzzy match quality and positional proximity
**Depends on**: Phase 4 (v1.0 complete)
**Requirements**: MATCH-01, MATCH-02, MATCH-03, MATCH-04, ARCH-01
**Plans**: 2 plans

Plans:
- [ ] 05-01-PLAN.md — TDD: Core WordMatcher implementation with distance-weighted scoring
- [ ] 05-02-PLAN.md — Edge cases, character offsets, and JSDoc types

**Success Criteria** (what must be TRUE):
  1. User speaks "four score and seven" near script start - app finds match within 50-word radius of current position
  2. User speaks phrase that appears twice in script - app ranks the closer occurrence higher
  3. User speaks partial/paraphrased phrase - app finds fuzzy match with score reflecting both text similarity and distance
  4. User speaks 2+ consecutive matching words - app reports them as high-confidence candidates

### Phase 6: PositionTracker
**Goal**: Maintain confirmed position as single source of truth using two-position model (floor + ceiling)
**Depends on**: Phase 5
**Requirements**: POS-01, POS-02, POS-03, POS-04, SKIP-01, SKIP-02, ARCH-02
**Success Criteria** (what must be TRUE):
  1. App exposes confirmedPosition that only moves forward (never backward automatically)
  2. User speaks matching words - confirmedPosition advances only after high-confidence match
  3. User skips 20 words ahead and speaks 2+ consecutive matches - position jumps to new location
  4. User skips backward - app holds position (no automatic backward jump)
  5. App provides scroll boundary that external code can query (confirmedPosition + buffer)
**Plans**: TBD

Plans:
- [ ] 06-01: TBD (planned during phase planning)
- [ ] 06-02: TBD

### Phase 7: ScrollController
**Goal**: React to position confirmations to scroll display, keeping next words at caret and deriving speed from speech pace
**Depends on**: Phase 6
**Requirements**: SCROLL-01, SCROLL-02, SCROLL-03, SCROLL-04, SCROLL-05, VIS-01, ARCH-03
**Success Criteria** (what must be TRUE):
  1. Display never scrolls past confirmed position - next words to speak always visible at caret
  2. User speaks at 150 wpm - scroll speed matches, words arrive at caret just as user reaches them
  3. User pauses for 5+ seconds - scroll holds position, next words remain at caret
  4. User resumes speaking after pause - tracking continues automatically (no manual restart)
  5. UI shows clear visual indication of tracking state (tracking vs. holding)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD (planned during phase planning)
- [ ] 07-02: TBD

### Phase 8: Integration
**Goal**: Wire new components into pipeline, remove old components, verify clean architecture
**Depends on**: Phase 7
**Requirements**: ARCH-04
**Success Criteria** (what must be TRUE):
  1. Old components removed (TextMatcher.js, ScrollSync.js, ConfidenceLevel.js no longer exist)
  2. New pipeline wired: SpeechRecognizer -> WordMatcher -> PositionTracker -> ScrollController
  3. User can read entire script naturally with new system (end-to-end verification)
**Plans**: TBD

Plans:
- [ ] 08-01: TBD (planned during phase planning)

## Progress

**Execution Order:**
Phases execute in numeric order: 5 -> 6 -> 7 -> 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-01-21 |
| 2. Speech Recognition | v1.0 | 4/4 | Complete | 2026-01-22 |
| 3. Text Matching | v1.0 | 3/3 | Complete | 2026-01-23 |
| 4. Scroll Control | v1.0 | 4/4 | Complete | 2026-01-24 |
| 5. WordMatcher | v1.1 | 0/2 | Planned | - |
| 6. PositionTracker | v1.1 | 0/TBD | Not started | - |
| 7. ScrollController | v1.1 | 0/TBD | Not started | - |
| 8. Integration | v1.1 | 0/TBD | Not started | - |

---
*Created: 2026-01-24 for v1.1 Following-Along Rewrite*
