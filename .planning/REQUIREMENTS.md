# Requirements: AI Voice-Controlled Teleprompter v1.1

**Defined:** 2026-01-24
**Core Value:** The teleprompter follows YOU, not the other way around.

## v1.1 Requirements

Requirements for the position-tracking rewrite. Each maps to roadmap phases.

### Matching Algorithm

- [ ] **MATCH-01**: App uses distance-weighted scoring where position is intrinsic to match confidence
- [ ] **MATCH-02**: App searches within a constrained radius around current position (not entire script)
- [ ] **MATCH-03**: App requires consecutive word matches before updating confirmed position
- [ ] **MATCH-04**: App handles repeated phrases by preferring matches near current position

### Position Tracking

- [ ] **POS-01**: App maintains confirmed position as single source of truth (never speculative)
- [ ] **POS-02**: App implements two-position model (confirmed floor + candidate ceiling)
- [ ] **POS-03**: App only updates confirmed position on high-confidence matches
- [ ] **POS-04**: Confirmed position only moves forward (monotonic constraint)

### Scroll Behavior

- [ ] **SCROLL-01**: App never scrolls ahead of confirmed position boundary
- [ ] **SCROLL-02**: App keeps next words to speak at fixed cue position (near caret)
- [ ] **SCROLL-03**: App pauses and holds position on silence
- [ ] **SCROLL-04**: App resumes tracking automatically when speech detected (no manual restart)
- [ ] **SCROLL-05**: App derives scroll speed from observed speaking pace (not a separate parameter)

### Skip Detection

- [ ] **SKIP-01**: App requires consecutive word matches at new position before accepting large jumps
- [ ] **SKIP-02**: App has strong forward bias (backward jumps require much stronger evidence or manual action)

### Architecture

- [ ] **ARCH-01**: WordMatcher is stateless (pure function for matching)
- [ ] **ARCH-02**: PositionTracker owns confirmed position as single source of truth
- [ ] **ARCH-03**: ScrollController is purely reactive to PositionTracker events
- [ ] **ARCH-04**: Old components removed (TextMatcher, ScrollSync, ConfidenceLevel)

### Visual Feedback

- [ ] **VIS-01**: App shows visual indication of tracking state (tracking vs. holding)

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
| MATCH-01 | TBD | Pending |
| MATCH-02 | TBD | Pending |
| MATCH-03 | TBD | Pending |
| MATCH-04 | TBD | Pending |
| POS-01 | TBD | Pending |
| POS-02 | TBD | Pending |
| POS-03 | TBD | Pending |
| POS-04 | TBD | Pending |
| SCROLL-01 | TBD | Pending |
| SCROLL-02 | TBD | Pending |
| SCROLL-03 | TBD | Pending |
| SCROLL-04 | TBD | Pending |
| SCROLL-05 | TBD | Pending |
| SKIP-01 | TBD | Pending |
| SKIP-02 | TBD | Pending |
| ARCH-01 | TBD | Pending |
| ARCH-02 | TBD | Pending |
| ARCH-03 | TBD | Pending |
| ARCH-04 | TBD | Pending |
| VIS-01 | TBD | Pending |

**Coverage:**
- v1.1 requirements: 20 total
- Mapped to phases: 0
- Unmapped: 20 (pending roadmap)

---
*Requirements defined: 2026-01-24*
*Last updated: 2026-01-24 after initial definition*
