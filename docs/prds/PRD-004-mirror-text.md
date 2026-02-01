# PRD-004: Mirror Text Option

**GitHub Issue**: [#4 — Add option to mirror text](https://github.com/promptsmart/teleprompter/issues/4)
**Status**: Draft
**Priority**: Medium

---

## Problem Statement

Professional teleprompter setups use a beam-splitter mirror mounted in front of the camera lens. The presenter reads reflected text off the mirror while the camera shoots through it, creating the appearance of direct eye contact. For this to work, the teleprompter software must display text **horizontally flipped** (mirrored) so it reads correctly in the reflection.

The app currently has no mirror/flip option, making it unusable for beam-splitter setups.

## Background

A beam-splitter teleprompter works as follows:

1. A monitor (or tablet/phone) displays scrolling text, facing upward
2. A half-silvered mirror sits at 45° in front of the camera lens
3. The text reflects off the mirror toward the presenter
4. The camera shoots through the mirror, seeing the subject but not the text

Because the mirror reflects the image horizontally, the text on screen must be **pre-flipped** — rendered as a mirror image so the reflection reads left-to-right.

### Current Architecture

The teleprompter text is rendered in `#teleprompter-text` (`index.html:33`), a `<div>` inside `#teleprompter-container`. The container handles scrolling (`overflow-y: auto`) while the text div holds the content with `white-space: pre-wrap` and a configurable `font-size`.

The controls overlay (`index.html:40-62`) provides buttons for speed, font size, play/pause, fullscreen, voice, and highlight. Settings are persisted to `localStorage` via `saveSettings()` (`script.js:713-721`) and restored via `loadSettings()` (`script.js:723-737`).

The current state object (`script.js:22-30`) tracks:

```javascript
{
  mode: 'editor',
  fontSize: 48,
  scrollSpeed: 50,
  isScrolling: false,
  voiceEnabled: false,
  voiceState: 'idle',
  highlightEnabled: true
}
```

## Proposed Solution

Add a mirror mode toggle that applies a CSS horizontal flip (`scaleX(-1)`) to the teleprompter text container. The setting should be accessible via a UI button and a keyboard shortcut, and should persist across sessions.

### Implementation Details

#### 1. State — Add `mirrorEnabled` flag

Add `mirrorEnabled: false` to the initial state in `script.js:22-30`:

```javascript
const { state, subscribe } = createState({
  // ...existing state
  mirrorEnabled: false
});
```

#### 2. CSS — Mirror transform (`styles.css`)

Add a class that flips the teleprompter container horizontally:

```css
#teleprompter-container.mirrored {
  transform: scaleX(-1);
}
```

Applying the transform to `#teleprompter-container` (not `#teleprompter-text`) ensures that:
- Scrolling still works correctly (scroll direction is unaffected by CSS transforms)
- The reading marker arrow remains in the correct position (it's a sibling, not a child)
- The entire text area, including padding, is flipped

#### 3. Toggle Logic (`script.js`)

Add a `toggleMirror()` function:

```javascript
function toggleMirror() {
  state.mirrorEnabled = !state.mirrorEnabled;
  teleprompterContainer.classList.toggle('mirrored', state.mirrorEnabled);
  mirrorBtn.classList.toggle('active', state.mirrorEnabled);
}
```

#### 4. UI Button (`index.html`)

Add a Mirror button in the controls row, alongside the existing Fullscreen and Voice buttons:

```html
<button id="mirror-btn" class="control-btn" title="Mirror text for beam-splitter">Mirror</button>
```

#### 5. Keyboard Shortcut (`script.js`)

Add `m` as a keyboard shortcut for toggling mirror mode, consistent with the existing keyboard handler pattern.

#### 6. Settings Persistence (`script.js`)

Add `mirrorEnabled` to `saveSettings()` and `loadSettings()`:

- `saveSettings()` (`script.js:713-721`): include `mirrorEnabled: state.mirrorEnabled`
- `loadSettings()` (`script.js:723-737`): restore `state.mirrorEnabled` with `?? false` default
- `subscribe()` (`script.js:831-841`): add `mirrorEnabled` to the list that triggers `saveSettings()`

Apply the mirror class on entering teleprompter mode if the setting is enabled.

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | A "Mirror" button in the controls overlay toggles horizontal text mirroring | Must have |
| FR-2 | Mirrored text must be readable in a physical mirror (i.e., reversed on screen) | Must have |
| FR-3 | Scrolling must work correctly in both normal and mirrored modes | Must have |
| FR-4 | The mirror setting must persist in localStorage across sessions | Must have |
| FR-5 | A keyboard shortcut (`m`) toggles mirror mode | Should have |
| FR-6 | The Mirror button should visually indicate when mirror mode is active | Should have |
| FR-7 | Voice mode and highlight mode must work correctly when mirrored | Should have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | Toggling mirror mode must be instantaneous (no perceptible delay) | Must have |
| NFR-2 | Mirror mode must not affect scroll performance | Must have |
| NFR-3 | The reading marker must remain correctly positioned in mirror mode | Must have |

## Success Criteria

- Text displays **horizontally mirrored** when mirror mode is enabled, readable when viewed through a physical mirror
- Manual scrolling (play/pause) works correctly in both modes
- Voice-follow scrolling works correctly in both modes
- CSS highlight API highlighting renders correctly in mirrored mode
- The setting persists: enabling mirror, exiting to editor, and re-entering teleprompter mode retains the mirror state
- Reading marker (the fixed arrow at 33%) remains in the correct screen position

## Scope

### In Scope

- Adding `mirrorEnabled` state property
- CSS mirror transform on `#teleprompter-container`
- Mirror toggle button in controls overlay
- Keyboard shortcut for mirror toggle
- Persisting mirror setting in localStorage
- Verifying scroll, voice, and highlight compatibility

### Out of Scope

- Vertical flip (for overhead teleprompter mounts) — can be added later as a separate feature
- Custom flip angles or partial transforms
- Automatic detection of physical mirror setups
- Changes to the editor view

## Affected Files

| File | Changes |
|------|---------|
| `script.js` | Add `mirrorEnabled` to state, `toggleMirror()` function, keyboard shortcut, settings persistence |
| `styles.css` | Add `.mirrored` class with `transform: scaleX(-1)` |
| `index.html` | Add Mirror button in controls overlay |
