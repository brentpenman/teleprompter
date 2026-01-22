# Requirements: AI Voice-Controlled Teleprompter

**Defined:** 2026-01-22
**Core Value:** The teleprompter follows YOU, not the other way around — matching natural speaking rhythm and handling the messiness of real speech.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Display

- [ ] **DISP-01**: User can paste/enter script text into the app
- [ ] **DISP-02**: User can start/pause manual scrolling
- [ ] **DISP-03**: User can adjust scroll speed
- [ ] **DISP-04**: User can adjust text size
- [ ] **DISP-05**: Display shows dark background with light text (broadcast style)
- [ ] **DISP-06**: User can enter fullscreen mode

### Voice Recognition

- [ ] **VOICE-01**: App requests microphone access and captures speech
- [ ] **VOICE-02**: App shows visual indicator when listening
- [ ] **VOICE-03**: App automatically restarts recognition when it stops
- [ ] **VOICE-04**: App recovers gracefully from errors with manual fallback

### Intelligent Tracking

- [ ] **TRACK-01**: App matches spoken words to script position (semantic matching, handles paraphrasing)
- [ ] **TRACK-02**: App scrolls display when confident in position match
- [ ] **TRACK-03**: App pauses scrolling when confidence is low (off-script, interjections)
- [ ] **TRACK-04**: App detects when user skips sections and jumps to new position
- [ ] **TRACK-05**: App shows visual feedback indicating match confidence level

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Persistence

- **PERS-01**: Script persists in localStorage across page refreshes
- **PERS-02**: User can save multiple scripts

### Display Enhancements

- **DISP-07**: User can mirror/flip text horizontally (for hardware setups)
- **DISP-08**: User can customize text and background colors

### Voice Enhancements

- **VOICE-05**: Permission flow with user-friendly explanation before browser prompt
- **VOICE-06**: Multi-language support

### Usability

- **USE-01**: Keyboard shortcuts for common actions
- **USE-02**: Reading statistics (WPM, time remaining)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| User accounts / authentication | Proof of concept, adds unnecessary complexity |
| Cloud sync / script storage | Requires backend infrastructure, violates "no backend" constraint |
| Video recording integration | Scope creep, many better dedicated tools exist |
| Offline speech recognition | Browser APIs require internet, local models too large (~50MB+) |
| Multi-user collaboration | Requires backend, auth, real-time sync infrastructure |
| Hardware teleprompter integration | Niche use case, validate software-only first |
| Perfect word-for-word tracking | Forces robotic delivery, breaks on natural speech variation |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISP-01 | Phase 1 | Pending |
| DISP-02 | Phase 1 | Pending |
| DISP-03 | Phase 1 | Pending |
| DISP-04 | Phase 1 | Pending |
| DISP-05 | Phase 1 | Pending |
| DISP-06 | Phase 1 | Pending |
| VOICE-01 | Phase 2 | Pending |
| VOICE-02 | Phase 2 | Pending |
| VOICE-03 | Phase 2 | Pending |
| VOICE-04 | Phase 2 | Pending |
| TRACK-01 | Phase 3 | Pending |
| TRACK-02 | Phase 4 | Pending |
| TRACK-03 | Phase 4 | Pending |
| TRACK-04 | Phase 4 | Pending |
| TRACK-05 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-22*
*Last updated: 2026-01-22 after roadmap creation*
