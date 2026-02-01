# Phase 11 Plan 01: Settings Infrastructure Summary

**One-liner:** localStorage-backed settings persistence, device capability detection with iOS/Android/Desktop logic, and RecognizerFactory with automatic Vosk→WebSpeech fallback

---

## Metadata

```yaml
phase: 11-engine-selection-polish
plan: 01
subsystem: settings-and-factory
status: complete
completed: 2026-02-01
duration: 6.5min
tests: 63 passing
```

## What Was Built

Created three foundational modules for engine selection infrastructure:

### 1. SettingsManager (settings/SettingsManager.js)
- localStorage persistence with full error handling
- Defaults: `{ recognitionEngine: 'auto', fontSize: 48, scrollSpeed: 50, highlightEnabled: true, mirrorEnabled: false }`
- Methods: `load()`, `save()`, `set()`, `get()`, `clear()`
- Graceful handling of private browsing mode (SecurityError, QuotaExceededError)
- Schema migration support (merges stored settings with defaults)
- **21 passing tests** including error simulation

### 2. DeviceCapability (settings/DeviceCapability.js)
- Platform detection: iOS, Android, mobile, desktop (from navigator.userAgent)
- SharedArrayBuffer availability check (required for Vosk WASM)
- Device memory detection (navigator.deviceMemory, Chromium only)
- Device tier categorization: low (<2GB), mid (2-4GB), high (>4GB), unknown
- Web Speech API availability detection
- **Engine recommendation logic:**
  - **iOS → webspeech** (SharedArrayBuffer unavailable on iOS Safari)
  - **Android + Vosk → vosk** (avoid notification beep - PRIMARY v1.2 GOAL)
  - **Desktop + low memory → webspeech** (avoid large download)
  - **Desktop + Vosk → vosk** (offline capability)
  - **Fallback → webspeech**
- Returns: `{ engine, reason, shouldDownloadModel }`
- **25 passing tests** covering all platform/capability combinations

### 3. RecognizerFactory (voice/recognizerFactory.js)
- Factory pattern for creating recognizers based on preference
- Accepts `preferredEngine: 'auto' | 'vosk' | 'webspeech'`
- **'auto' mode:** Uses DeviceCapability.recommendEngine() for intelligent selection
- **'vosk' mode:**
  - Creates ModelLoader with ModelCache/Downloader/Validator
  - Loads model from modelConfig with progress tracking via onModelProgress callback
  - Initializes VoskRecognizer with model ArrayBuffer
  - Falls back to Web Speech API on ANY error (model loading, WASM init, etc.)
- **'webspeech' mode:** Creates SpeechRecognizer directly
- Returns: `{ recognizer, engineUsed, fallbackReason }`
- Automatic fallback chain: Vosk → Web Speech API
- Throws only when NEITHER engine available
- **17 passing tests** covering all scenarios

## Technical Decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| localStorage (not IndexedDB) for settings | Simple key-value storage, 5MB quota sufficient for settings | Can't store complex data structures (but settings don't need it) |
| Try-catch wrapper on ALL localStorage access | Private browsing mode throws SecurityError | Adds defensive code but essential for Safari private browsing |
| Merge defaults with stored settings | Schema migration when adding new settings | Slightly more complex load() but handles version upgrades gracefully |
| Platform detection from userAgent | Consistent with SpeechRecognizer.getPlatform() | User agent sniffing less robust than feature detection, but platform-specific behavior needed |
| DeviceMemory for tier detection | Native API, instant, no performance cost | Only works in Chromium (Chrome, Edge); Safari/Firefox return null |
| iOS always gets webspeech | SharedArrayBuffer blocked on iOS Safari even with COOP/COEP | iOS users can't use Vosk offline mode |
| Android + Vosk prioritized | Primary v1.2 goal: eliminate notification beep | Requires 40MB model download, but avoids beep |
| Factory automatic fallback | Vosk initialization can fail (model load, WASM, etc.) | Users may not know why they got Web Speech API instead of Vosk (but app works) |
| Throw only when NEITHER engine works | Graceful degradation maximizes availability | Could mask underlying Vosk issues |

## Dependencies

**Requires (built upon):**
- Phase 09: ModelLoader, ModelCache, ModelDownloader, ModelValidator (for Vosk model loading)
- Phase 10: VoskRecognizer, SpeechRecognizer (recognizer implementations)
- Phase 01: Web Speech API wrapper (SpeechRecognizer)

**Provides (for future phases):**
- SettingsManager: Persistence layer for all user preferences
- DeviceCapability: Platform detection and engine recommendation
- RecognizerFactory: Unified recognizer creation with fallback

**Affects (downstream):**
- Phase 11-02: Settings UI will use SettingsManager + DeviceCapability
- Phase 11-03: Integration will use RecognizerFactory.create()

## Files

**Created:**
```
settings/
  SettingsManager.js              (117 lines)
  SettingsManager.test.js         (285 lines)
  DeviceCapability.js             (137 lines)
  DeviceCapability.test.js        (281 lines)
voice/
  recognizerFactory.js            (132 lines)
  recognizerFactory.test.js       (225 lines)
```

**Modified:**
```
voice/
  SpeechRecognizer.js             (Added export statement, Node environment handling)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing export statement in SpeechRecognizer**
- **Found during:** Task 2 (DeviceCapability test failure)
- **Issue:** SpeechRecognizer.js had no `export default SpeechRecognizer;` statement
- **Fix:** Added export statement at end of file
- **Files modified:** voice/SpeechRecognizer.js
- **Commit:** c8b2dbf

**2. [Rule 2 - Missing Critical] Node environment handling in SpeechRecognizer**
- **Found during:** Task 3 (RecognizerFactory test failure)
- **Issue:** SpeechRecognizer referenced `window` and `navigator` at module load time, breaking Node tests
- **Fix:** Added checks: `const global = typeof window !== 'undefined' ? window : {};` and similar for navigator
- **Files modified:** voice/SpeechRecognizer.js
- **Commit:** 68bb0c5

**3. [Rule 2 - Missing Critical] Node environment handling in DeviceCapability**
- **Found during:** Task 2 (initial implementation)
- **Issue:** DeviceCapability needs to work in both browser and Node test environments
- **Fix:** Added typeof checks for window, navigator, and self before accessing
- **Files modified:** settings/DeviceCapability.js
- **Commit:** c8b2dbf (included in initial implementation)

## Requirements Satisfied

From 11-01-PLAN.md must_haves:

**Truths:**
- ✅ User preferences persist across sessions (SettingsManager.load/save)
- ✅ App detects device capabilities and recommends appropriate engine (DeviceCapability.detect/recommendEngine)
- ✅ App creates correct recognizer based on preference with automatic fallback (RecognizerFactory.create)

**Artifacts:**
- ✅ settings/SettingsManager.js (117 lines, exports SettingsManager)
- ✅ settings/DeviceCapability.js (137 lines, exports DeviceCapability)
- ✅ voice/recognizerFactory.js (132 lines, exports RecognizerFactory)

**Key Links:**
- ✅ recognizerFactory imports DeviceCapability (`import DeviceCapability from '../settings/DeviceCapability.js'`)
- ✅ recognizerFactory imports VoskRecognizer (`import VoskRecognizer from './VoskRecognizer.js'`)
- ✅ recognizerFactory imports SpeechRecognizer (`import SpeechRecognizer from './SpeechRecognizer.js'`)
- ✅ recognizerFactory imports ModelLoader (`import { ModelLoader } from '../src/model/ModelLoader.js'`)

**Success Criteria:**
- ✅ SettingsManager class with load/save/set/get/clear methods
- ✅ localStorage access wrapped in try-catch blocks
- ✅ DeviceCapability class with detect/recommendEngine static methods
- ✅ iOS devices get 'webspeech' recommendation
- ✅ Android devices with SharedArrayBuffer get 'vosk' recommendation
- ✅ RecognizerFactory class with create static method
- ✅ Factory attempts Vosk first, falls back to Web Speech API on error
- ✅ Factory uses DeviceCapability for 'auto' engine selection
- ✅ All three modules have passing tests (63 total)
- ✅ No external dependencies added (uses existing Phase 9/10 infrastructure)
- ✅ Satisfies ENGINE-02 (localStorage persistence)
- ✅ Satisfies ENGINE-03 (capability detection)
- ✅ Satisfies INTEG-03 (fallback to Web Speech API)
- ✅ Satisfies INTEG-04 (fallback on Vosk failure)

## Test Coverage

**Total: 63 passing tests**

**SettingsManager (21 tests):**
- Constructor defaults and custom storage key
- load() with empty/stored/corrupted/error scenarios
- save() with persistence and error handling
- set()/get() individual key operations
- clear() removal and error handling
- Private browsing mode simulation (all localStorage methods throwing)

**DeviceCapability (25 tests):**
- Platform detection (iOS, Android, Desktop)
- SharedArrayBuffer availability checks
- Device memory and tier categorization
- Web Speech API detection (standard and webkit prefix)
- Engine recommendations for all platform combinations
- shouldDownloadModel flag accuracy

**RecognizerFactory (17 tests):**
- Input validation (preferredEngine, callbacks)
- 'auto' mode using DeviceCapability.recommendEngine()
- 'vosk' mode attempting initialization with fallback
- 'webspeech' mode direct creation
- Error handling when neither engine available
- Return value structure validation

## Next Phase Readiness

**Phase 11-02 (Settings UI) Ready:**
- ✅ SettingsManager provides persistence API
- ✅ DeviceCapability provides recommendation logic for UI messaging
- ✅ All modules tested and documented

**Phase 11-03 (Integration) Ready:**
- ✅ RecognizerFactory provides unified creation API
- ✅ Automatic fallback ensures app always works
- ✅ Progress callback support for model loading UI

**Outstanding Questions:**
- ⚠️ **Android beep elimination unverified** - Vosk's offline processing *should* avoid notification beep, but requires real device testing (Pixel 3a or newer). This is the PRIMARY success criterion for v1.2. If beep persists, entire milestone value proposition fails.
- ⚠️ iOS SharedArrayBuffer permanently blocked? Or future iOS version might enable? (Assume permanently unavailable, monitor WebKit blog)

**Blockers:** None

**Concerns:** Android beep test is critical and must happen during Phase 11-03 integration validation

## Lessons Learned

1. **Node environment handling essential for ES module tests:** Browser-only code (window, navigator) breaks Jest tests. Always add typeof checks at module load time.

2. **Export statements easy to forget:** SpeechRecognizer worked in browser but had no export. Add exports immediately when creating new modules.

3. **Graceful degradation maximizes availability:** RecognizerFactory's automatic Vosk→WebSpeech fallback ensures app works even when model loading fails, WASM errors occur, or SharedArrayBuffer unavailable.

4. **localStorage try-catch is non-negotiable:** Private browsing mode is common (especially on iOS). Every localStorage access must be wrapped or app crashes.

5. **Platform detection needed despite feature detection best practices:** While feature detection generally superior to user agent sniffing, engine selection requires platform-specific logic (iOS can't use Vosk, Android benefits from beep elimination).

## Implementation Notes

**SettingsManager Design:**
- Single storage key for all settings reduces localStorage clutter
- Merge strategy handles schema changes gracefully (new settings in future versions)
- Return value booleans for save/set/clear enable UI feedback

**DeviceCapability Design:**
- Static methods (no instance needed) - pure detection/recommendation logic
- Multiple signals for robust detection (SharedArrayBuffer + platform + memory)
- Unknown device tier when deviceMemory unavailable (Safari/Firefox) defaults to mid-tier assumptions

**RecognizerFactory Design:**
- Async factory pattern (model loading is async)
- Progress callback optional (onModelProgress can be undefined, defaults to noop)
- fallbackReason tracks why engine changed (for debugging and user communication)
- _createWebSpeech private helper avoids code duplication

## Tags

`settings`, `persistence`, `localStorage`, `device-detection`, `platform-detection`, `factory-pattern`, `vosk`, `web-speech-api`, `fallback`, `graceful-degradation`, `engine-selection`
