# Requirements: AI Voice-Controlled Teleprompter v1.1

**Defined:** 2026-01-24
**Core Value:** The teleprompter follows YOU, not the other way around.

## v1.1 Requirements

Requirements for the position-tracking rewrite. Each maps to roadmap phases.

### Matching Algorithm

- [x] **MATCH-01**: App uses distance-weighted scoring where position is intrinsic to match confidence
- [x] **MATCH-02**: App searches within a constrained radius around current position (not entire script)
- [x] **MATCH-03**: App requires consecutive word matches before updating confirmed position
- [x] **MATCH-04**: App handles repeated phrases by preferring matches near current position

### Position Tracking

- [x] **POS-01**: App maintains confirmed position as single source of truth (never speculative)
- [x] **POS-02**: App implements two-position model (confirmed floor + candidate ceiling)
- [x] **POS-03**: App only updates confirmed position on high-confidence matches
- [x] **POS-04**: Confirmed position only moves forward (monotonic constraint)

### Scroll Behavior

- [x] **SCROLL-01**: App never scrolls ahead of confirmed position boundary
- [x] **SCROLL-02**: App keeps next words to speak at fixed cue position (near caret)
- [x] **SCROLL-03**: App pauses and holds position on silence
- [x] **SCROLL-04**: App resumes tracking automatically when speech detected (no manual restart)
- [x] **SCROLL-05**: App derives scroll speed from observed speaking pace (not a separate parameter)

### Skip Detection

- [x] **SKIP-01**: App requires consecutive word matches at new position before accepting large jumps
- [x] **SKIP-02**: App has strong forward bias (backward jumps require much stronger evidence or manual action)

### Architecture

- [x] **ARCH-01**: WordMatcher is stateless (pure function for matching)
- [x] **ARCH-02**: PositionTracker owns confirmed position as single source of truth
- [x] **ARCH-03**: ScrollController is purely reactive to PositionTracker events
- [ ] **ARCH-04**: Old components removed (TextMatcher, ScrollSync, ConfidenceLevel)

### Visual Feedback

- [x] **VIS-01**: App shows visual indication of tracking state (tracking vs. holding)

## Future Requirements

Deferred to later milestones. Not in current roadmap.

### Enhanced Feedback

- **VIS-02**: App shows word-level visual feedback (underline matched words in real-time)
- **VIS-03**: App shows confidence visualization (subtle indicator of match quality)

### Manual Override

- **MANUAL-01**: User can tap/scroll to manually adjust position without breaking tracking
- **MANUAL-02**: User can trigger explicit backward navigation

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Backward automatic jumps | Too error-prone; forward-only with manual override later |
| Multiple confidence levels | v1.0 over-engineering; simple confirmed/unconfirmed is enough |
| Tunable threshold parameters | Derive from observed behavior; avoid parameter explosion |
| State machine transitions | Simpler reactive model; no CONFIDENT/UNCERTAIN/OFF_SCRIPT |
| Predictive scrolling | Confirmation-only; never scroll ahead of user |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MATCH-01 | Phase 5 | Complete |
| MATCH-02 | Phase 5 | Complete |
| MATCH-03 | Phase 5 | Complete |
| MATCH-04 | Phase 5 | Complete |
| POS-01 | Phase 6 | Complete |
| POS-02 | Phase 6 | Complete |
| POS-03 | Phase 6 | Complete |
| POS-04 | Phase 6 | Complete |
| SCROLL-01 | Phase 7 | Complete |
| SCROLL-02 | Phase 7 | Complete |
| SCROLL-03 | Phase 7 | Complete |
| SCROLL-04 | Phase 7 | Complete |
| SCROLL-05 | Phase 7 | Complete |
| SKIP-01 | Phase 6 | Complete |
| SKIP-02 | Phase 6 | Complete |
| ARCH-01 | Phase 5 | Complete |
| ARCH-02 | Phase 6 | Complete |
| ARCH-03 | Phase 7 | Complete |
| ARCH-04 | Phase 8 | Pending |
| VIS-01 | Phase 7 | Complete |

**Coverage:**
- v1.1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-01-24*
*Last updated: 2026-01-24 after roadmap creation*
