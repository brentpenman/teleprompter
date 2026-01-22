# Roadmap: AI Voice-Controlled Teleprompter

## Overview

This roadmap builds a voice-controlled teleprompter in four phases. Phase 1 establishes a solid manual teleprompter foundation. Phase 2 adds reliable speech recognition with comprehensive error handling. Phase 3 implements basic text matching to prove the concept. Phase 4 adds intelligence through confidence-based scroll control, completing the "teleprompter that follows you" experience.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Display & Manual Control** - Broadcast-style teleprompter with manual scroll
- [ ] **Phase 2: Speech Recognition Foundation** - Reliable speech capture with error handling
- [ ] **Phase 3: Basic Text Matching** - Match spoken words to script position
- [ ] **Phase 4: Intelligent Scroll Control** - Confidence-based auto-scroll with pause detection

## Phase Details

### Phase 1: Core Display & Manual Control
**Goal**: User can operate the app as a professional manual teleprompter
**Depends on**: Nothing (first phase)
**Requirements**: DISP-01, DISP-02, DISP-03, DISP-04, DISP-05, DISP-06
**Success Criteria** (what must be TRUE):
  1. User can paste script text and see it displayed in broadcast style (dark background, large light text)
  2. User can manually scroll through script at adjustable speeds
  3. User can pause and resume scrolling from any point
  4. User can adjust text size to match reading distance
  5. User can enter fullscreen mode for distraction-free reading
**Plans**: TBD

Plans:
- [ ] TBD (to be created during `/gsd:plan-phase 1`)

### Phase 2: Speech Recognition Foundation
**Goal**: App reliably captures and transcribes user speech with graceful error handling
**Depends on**: Phase 1
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04
**Success Criteria** (what must be TRUE):
  1. User grants microphone permission and app begins listening
  2. User can see visual indicator showing when app is actively listening
  3. App continues listening through pauses without manual restart
  4. When speech recognition fails, app shows clear error and falls back to manual mode
**Plans**: TBD

Plans:
- [ ] TBD (to be created during `/gsd:plan-phase 2`)

### Phase 3: Basic Text Matching
**Goal**: App matches spoken words to position in script and scrolls accordingly
**Depends on**: Phase 2
**Requirements**: TRACK-01
**Success Criteria** (what must be TRUE):
  1. User speaks words from script and app scrolls to matching position
  2. User can paraphrase slightly and app still finds approximate match
  3. App highlights current matched position in the script
**Plans**: TBD

Plans:
- [ ] TBD (to be created during `/gsd:plan-phase 3`)

### Phase 4: Intelligent Scroll Control
**Goal**: App behaves like human operator - scrolling when confident, pausing when uncertain
**Depends on**: Phase 3
**Requirements**: TRACK-02, TRACK-03, TRACK-04, TRACK-05
**Success Criteria** (what must be TRUE):
  1. User goes off-script (ad-lib, interjection) and scrolling pauses automatically
  2. User returns to script and scrolling resumes smoothly
  3. User skips ahead in script and app jumps to new position
  4. User can see visual confidence indicator showing how certain the match is
  5. Scrolling is smooth and natural, not jumpy or erratic
**Plans**: TBD

Plans:
- [ ] TBD (to be created during `/gsd:plan-phase 4`)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Display & Manual Control | 0/TBD | Not started | - |
| 2. Speech Recognition Foundation | 0/TBD | Not started | - |
| 3. Basic Text Matching | 0/TBD | Not started | - |
| 4. Intelligent Scroll Control | 0/TBD | Not started | - |
