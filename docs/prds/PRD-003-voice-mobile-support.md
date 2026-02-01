# PRD-003: Voice Mode Mobile Support

**GitHub Issue**: [#3 — Voice doesn't work on mobile](https://github.com/promptsmart/teleprompter/issues/3)
**Status**: Draft
**Priority**: High

---

## Problem Statement

Voice mode fails on mobile browsers. Users on iOS Safari and Android Chrome cannot use the voice-follow feature, which is a core differentiator of the teleprompter app.

## Background

The voice pipeline relies on two browser APIs:

1. **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`) — used by `SpeechRecognizer` (`voice/SpeechRecognizer.js`) for speech-to-text
2. **getUserMedia** — used in `enableVoiceMode()` (`script.js:425-436`) for microphone access and the audio visualizer

The current implementation (`SpeechRecognizer.js:38-42`) handles the vendor prefix:

```javascript
const SpeechRecognitionAPI = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;
```

And the static support check (`SpeechRecognizer.js:44-46`):

```javascript
static isSupported() {
  return !!SpeechRecognitionAPI;
}
```

However, detecting the API's existence does not guarantee it works correctly on mobile.

## Root Cause Analysis

### iOS Safari

- **SpeechRecognition support**: iOS Safari 14.5+ supports `webkitSpeechRecognition`, but with significant behavioral differences from desktop:
  - `continuous` mode may not work reliably — Safari can stop recognition after a single utterance regardless of the `continuous: true` setting
  - Recognition sessions may be silently killed when the app is backgrounded or the screen locks
  - Audio session conflicts: if another app (or Safari itself) holds the audio session, `getUserMedia` or `SpeechRecognition` may fail silently
  - Permission prompts behave differently — the user may need to grant permission each time rather than having it persisted

- **Auto-restart logic**: The `_scheduleRestart()` method (`SpeechRecognizer.js:148-169`) uses exponential backoff starting at 100ms. On iOS, rapid restarts of `SpeechRecognition` can trigger rate-limiting or permanent failure, making the retry logic counterproductive.

- **getUserMedia constraints**: The audio constraints in `enableVoiceMode()` (`script.js:427-433`) request `echoCancellation`, `noiseSuppression`, and `autoGainControl`. On iOS, some of these constraints may not be supported and could cause `getUserMedia` to reject.

### Android Chrome

- **SpeechRecognition support**: Android Chrome has good support for the Web Speech API, but:
  - Requires an active internet connection (speech is processed server-side)
  - The `onend` event fires differently — Chrome on Android may not auto-fire `onend` in the same scenarios as desktop Chrome
  - Permission flow on mobile Chrome may present differently (inline vs. dialog)

- **Screen lifecycle**: When the Android screen turns off or the browser is backgrounded, both `getUserMedia` streams and `SpeechRecognition` sessions are suspended. The current code does not handle `visibilitychange` events.

### Shared Issues

- **No mobile viewport meta for teleprompter mode**: The current `<meta name="viewport">` (`index.html:4`) is basic (`width=device-width, initial-scale=1.0`). It does not prevent zoom or handle safe areas, which affects the teleprompter UI on mobile.
- **Touch interaction conflicts**: The controls overlay uses mouse events for showing/hiding. Touch events may not trigger the same behavior.
- **No mobile-specific error messaging**: When voice fails on mobile, the user sees generic errors that don't help diagnose mobile-specific issues.

## Proposed Solutions

### 1. Mobile Detection and Configuration

Add mobile/platform detection and adjust `SpeechRecognizer` configuration accordingly:

```javascript
// Detect mobile platform
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = /Android/.test(navigator.userAgent);
const isMobile = isIOS || isAndroid;
```

**iOS-specific adjustments**:
- Set `continuous: false` and manually restart after each result (mimicking continuous mode)
- Increase restart delays to avoid rate-limiting (minimum 500ms on iOS)
- Handle `webkitSpeechRecognition`-specific quirks

**Android-specific adjustments**:
- Add network connectivity check before enabling voice
- Handle the different `onend` behavior

### 2. Graceful getUserMedia Fallback

Update the audio constraints to be more permissive on mobile:

```javascript
const constraints = {
  audio: isMobile
    ? true  // Let the browser pick defaults
    : {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
};
```

If the constrained request fails, fall back to `{ audio: true }` before showing an error.

### 3. Visibility Change Handling

Add `visibilitychange` event handling to gracefully pause and resume voice mode:

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.voiceEnabled) {
    speechRecognizer.stop();
    audioVisualizer?.stop();
  } else if (!document.hidden && state.voiceEnabled) {
    speechRecognizer.start();
    audioVisualizer?.start(audioStream);
  }
});
```

### 4. Permission Flow Improvements

- Check `navigator.permissions.query({ name: 'microphone' })` before requesting access
- Show a pre-permission prompt explaining why microphone access is needed
- Handle the case where permission is denied with a clear, actionable message

### 5. Mobile UI Adjustments

- Add `user-scalable=no` to viewport meta when in teleprompter mode (prevent accidental zoom)
- Ensure controls overlay responds to touch events
- Test and fix any layout issues with the controls on small screens
- Add iOS safe area inset handling for notched devices

## Requirements

### Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Voice mode must work on iOS Safari 17+ | Must have |
| FR-2 | Voice mode must work on Android Chrome (latest 2 versions) | Must have |
| FR-3 | App must handle visibility changes (backgrounding/foregrounding) gracefully | Must have |
| FR-4 | If voice mode cannot be started on mobile, show a clear, actionable error | Must have |
| FR-5 | getUserMedia must fall back to basic constraints if advanced constraints fail | Should have |
| FR-6 | Pre-permission prompt should explain microphone usage before browser prompt | Nice to have |

### Non-Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR-1 | Voice recognition latency on mobile should be within 2× of desktop latency | Should have |
| NFR-2 | No regression in desktop voice mode behavior | Must have |
| NFR-3 | Mobile UI must be usable on screens 375px wide and above | Must have |
| NFR-4 | Battery drain from voice mode should not exceed typical voice app usage | Nice to have |

## Success Criteria

- Voice mode activates and tracks position on **iOS Safari 17+** (iPhone and iPad)
- Voice mode activates and tracks position on **Android Chrome** (latest 2 versions)
- Switching away from and back to the app resumes voice mode without requiring manual restart
- Desktop voice mode continues to work identically to current behavior
- No unhandled errors or silent failures on mobile — all failure modes produce user-visible feedback

## Testing Matrix

| Platform | Browser | Version | Test Scenarios |
|----------|---------|---------|----------------|
| iPhone | Safari | 17+ | Start voice, track script, background/foreground, lock screen |
| iPad | Safari | 17+ | Start voice, track script, split-screen multitasking |
| Android Phone | Chrome | Latest 2 | Start voice, track script, background/foreground |
| Android Tablet | Chrome | Latest 2 | Start voice, track script |
| Desktop | Chrome | Latest | Regression test — no behavior changes |
| Desktop | Safari | Latest | Regression test |
| Desktop | Firefox | Latest | Confirm voice unsupported message (Firefox lacks SpeechRecognition) |

## Scope

### In Scope

- Platform detection and conditional configuration in `SpeechRecognizer.js`
- Fallback audio constraints in `script.js` `enableVoiceMode()`
- Visibility change handling in `script.js`
- Mobile-specific error messages
- Viewport and safe area CSS adjustments in `index.html` and `styles.css`

### Out of Scope

- Third-party speech recognition services (e.g., Deepgram, AssemblyAI) as fallback
- Offline speech recognition
- Supporting browsers that don't implement the Web Speech API at all (e.g., Firefox mobile)
- Redesigning the mobile UI layout (only fixes for voice-related issues)

## Affected Files

| File | Changes |
|------|---------|
| `voice/SpeechRecognizer.js` | Mobile detection, platform-specific configuration, adjusted retry logic for iOS |
| `script.js` | Fallback getUserMedia constraints, visibility change handler, mobile error messaging |
| `index.html` | Viewport meta updates, potential touch-action meta |
| `styles.css` | Safe area insets, mobile-specific control sizing, touch-friendly tap targets |
