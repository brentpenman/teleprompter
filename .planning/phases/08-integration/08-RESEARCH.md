# Phase 8: Integration - Research

**Researched:** 2026-01-24
**Domain:** Pipeline wiring, legacy component removal, debug overlay integration
**Confidence:** HIGH

## Summary

This phase wires the new v1.1 pipeline (SpeechRecognizer -> WordMatcher -> PositionTracker -> ScrollController), removes the deprecated v1.0 components (TextMatcher.js, ScrollSync.js, ConfidenceLevel.js), and adds production-ready debugging capabilities. The integration follows a "swap all at once" approach per user decisions - no parallel pipelines or feature flags.

The key challenge is not technical complexity but careful coordination. The new components are already built and tested individually; this phase connects them through script.js while simultaneously deleting old code. The "delete first, fix import errors" strategy ensures a clean break and prevents accidental use of deprecated code.

For debugging, the user decided to keep the debug overlay in production (accessible via keyboard shortcut), silence console logging unless debug mode is enabled, and add a state export button that copies current system state as JSON to clipboard. This provides excellent observability without cluttering the production experience.

**Primary recommendation:** Delete the three old files first (atomic commit), then update script.js to import and wire the new pipeline components, verifying each integration point compiles before proceeding. Add keyboard shortcut (Ctrl+Shift+D / Cmd+Shift+D) for debug overlay toggle, update overlay to show v1.1 state, and add state export via navigator.clipboard API.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native ES Modules | - | Dynamic imports in script.js | Already used for v1.0 matching system |
| navigator.clipboard | - | State export to clipboard | Modern standard, secure contexts only (HTTPS) |
| fuse.js | 7.0.0+ | Fuzzy matching (via WordMatcher) | Already in importmap |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| WordMatcher.js (Phase 5) | - | Stateless fuzzy matching | Core pipeline component |
| PositionTracker.js (Phase 6) | - | Position state management | Core pipeline component |
| ScrollController.js (Phase 7) | - | Reactive scroll control | Core pipeline component |
| Highlighter.js (existing) | - | CSS Custom Highlight API | Continues to work with new pipeline |
| SpeechRecognizer.js (v1.0) | - | Web Speech API wrapper | Kept - only speech component, already decoupled |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| navigator.clipboard.writeText | document.execCommand('copy') | execCommand is deprecated; clipboard API is the modern standard |
| Keyboard shortcut toggle | Settings panel checkbox | User explicitly chose shortcut for simpler UX |
| Console.log wrapper | Debug library (debug, loglevel) | Overkill for simple on/off; keep dependencies minimal |

**Installation:**
```bash
# No new dependencies needed
# All components already exist, fuse.js in importmap
```

## Architecture Patterns

### Recommended Project Structure After Integration
```
matching/
  WordMatcher.js        # v1.1 - stateless matching
  PositionTracker.js    # v1.1 - position state
  ScrollController.js   # v1.1 - reactive scroll
  Highlighter.js        # KEPT - highlighting (unchanged)
  textUtils.js          # KEPT - tokenization (unchanged)
  # DELETED: TextMatcher.js, ScrollSync.js, ConfidenceLevel.js
  # DELETED: *.test.js files for above (if any)

voice/
  SpeechRecognizer.js   # KEPT - v1.0, already clean interface
  AudioVisualizer.js    # KEPT - waveform display

script.js               # UPDATED - new pipeline wiring
index.html              # UPDATED - debug overlay enhancements
styles.css              # MINIMAL CHANGES - debug overlay styling
```

### Pattern 1: Delete-First Migration
**What:** Delete old files before updating imports, forcing compile-time errors for any missed references
**When to use:** For the "swap all at once" strategy (user decision)
**Why:** Prevents accidental use of old code; errors are obvious and localized

**Execution order:**
```bash
# Step 1: Atomic delete commit
git rm matching/TextMatcher.js matching/ScrollSync.js matching/ConfidenceLevel.js
git commit -m "chore: remove deprecated v1.0 components"

# Step 2: Fix import errors in script.js (will fail until fixed)
# This surfaces all places that need updating

# Step 3: Wire new pipeline, commit when working
```

### Pattern 2: Pipeline Wiring in script.js
**What:** Replace the initMatchingSystem function to use new components
**When to use:** After old files deleted
**Why:** Central integration point; clean replacement

**Before (v1.0):**
```javascript
// Current pattern in script.js
let TextMatcher = null;
let Highlighter = null;
let ScrollSync = null;
let textMatcher = null;
let highlighter = null;
let scrollSync = null;

async function initMatchingSystem(scriptText) {
  const textUtils = await import('./matching/textUtils.js');
  const matcherModule = await import('./matching/TextMatcher.js');
  const highlightModule = await import('./matching/Highlighter.js');
  const scrollModule = await import('./matching/ScrollSync.js');

  TextMatcher = matcherModule.TextMatcher;
  // ... stateful instantiation
}
```

**After (v1.1):**
```javascript
// New pipeline components
import { createMatcher, findMatches } from './matching/WordMatcher.js';
import { PositionTracker } from './matching/PositionTracker.js';
import { ScrollController } from './matching/ScrollController.js';
import { Highlighter } from './matching/Highlighter.js';

let matcher = null;           // WordMatcher result (stateless)
let positionTracker = null;   // Stateful position
let scrollController = null;  // Reactive scroll
let highlighter = null;       // Kept from v1.0

async function initMatchingSystem(scriptText) {
  // Build matcher once for this script
  matcher = createMatcher(scriptText);

  // Create position tracker
  positionTracker = new PositionTracker();

  // Create scroll controller (depends on positionTracker)
  scrollController = new ScrollController(
    teleprompterContainer,
    positionTracker,
    matcher.scriptWords.length,
    {
      onStateChange: handleScrollStateChange
    }
  );

  // Create highlighter (unchanged from v1.0)
  highlighter = new Highlighter(teleprompterText, {
    phraseLength: 3,
    enabled: state.highlightEnabled
  });

  // Start scroll controller
  scrollController.start();
}
```

### Pattern 3: Speech Callback Wiring
**What:** Update the onTranscript callback to use new pipeline
**When to use:** In enableVoiceMode function
**Why:** This is where speech connects to matching

**New pattern:**
```javascript
speechRecognizer = new SpeechRecognizer({
  onTranscript: (text, isFinal) => {
    if (!matcher || !positionTracker || !scrollController) return;

    // Get current position from PositionTracker (single source of truth)
    const prevPosition = positionTracker.getConfirmedPosition();

    // Find matches using stateless WordMatcher
    const result = findMatches(text, matcher, prevPosition);

    if (result.bestMatch) {
      // Process through PositionTracker (handles confirmation logic)
      const processResult = positionTracker.processMatch(result.bestMatch);

      if (processResult.action === 'advanced') {
        // Notify ScrollController of position change
        scrollController.onPositionAdvanced(
          processResult.confirmedPosition,
          prevPosition
        );

        // Update highlight
        if (highlighter) {
          highlighter.highlightPosition(
            processResult.confirmedPosition,
            matcher.scriptWords
          );
        }
      }

      // Debug logging (only in debug mode)
      if (debugMode) {
        console.log('[Pipeline]', {
          transcript: text,
          match: result.bestMatch.position,
          action: processResult.action,
          confirmed: processResult.confirmedPosition
        });
      }
    }
  },
  // ... rest unchanged
});
```

### Pattern 4: Debug Overlay Toggle via Keyboard Shortcut
**What:** Toggle debug overlay visibility with Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (Mac)
**When to use:** Always - provides production-safe debug access
**Why (user decision):** "Access via keyboard shortcut (not settings panel)"

**Implementation:**
```javascript
// Debug mode state
let debugMode = false;

// Keyboard handler (add to existing keydown listener)
document.addEventListener('keydown', (e) => {
  // Debug overlay toggle: Ctrl+Shift+D (or Cmd+Shift+D on Mac)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    toggleDebugMode();
  }

  // ... existing handlers
});

function toggleDebugMode() {
  debugMode = !debugMode;

  if (debugOverlay) {
    debugOverlay.classList.toggle('hidden', !debugMode);
  }

  if (debugMode) {
    startDebugUpdates();
  } else {
    stopDebugUpdates();
  }
}
```

### Pattern 5: State Export via Clipboard API
**What:** Button in debug overlay that copies current state as JSON to clipboard
**When to use:** For issue reporting and debugging
**Why (user decision):** "Export state button in debug overlay - copies current state as JSON for issue reporting"

**Implementation:**
```javascript
async function exportDebugState() {
  const stateSnapshot = {
    timestamp: new Date().toISOString(),
    version: '1.1',

    // Position state
    position: positionTracker ? {
      confirmed: positionTracker.getConfirmedPosition(),
      candidate: positionTracker.candidatePosition,
      consecutiveCount: positionTracker.consecutiveMatchCount
    } : null,

    // Scroll state
    scroll: scrollController ? {
      isTracking: scrollController.isTracking,
      speakingPace: scrollController.speakingPace,
      targetScrollTop: scrollController.targetScrollTop,
      currentScroll: teleprompterContainer?.scrollTop
    } : null,

    // Speech state
    speech: {
      enabled: state.voiceEnabled,
      state: state.voiceState
    },

    // Script info
    script: matcher ? {
      totalWords: matcher.scriptWords.length
    } : null
  };

  try {
    const json = JSON.stringify(stateSnapshot, null, 2);
    await navigator.clipboard.writeText(json);
    showToast('State copied to clipboard');
  } catch (err) {
    console.error('Failed to copy state:', err);
    // Fallback: log to console
    console.log('Debug state:', stateSnapshot);
  }
}
```

### Pattern 6: Conditional Console Logging
**What:** Wrap console.log calls to only output in debug mode
**When to use:** Throughout pipeline code
**Why (user decision):** "Console logging silent in production - no info/debug logs unless debug mode enabled"

**Implementation:**
```javascript
// Simple debug logger
function debugLog(...args) {
  if (debugMode) {
    console.log('[Debug]', ...args);
  }
}

// Usage in speech callback
debugLog('Transcript:', text, 'Match:', result.bestMatch);

// For warnings/errors - always log
console.warn('[Voice] Connection issue:', err);
console.error('[Pipeline] Fatal error:', err);
```

### Anti-Patterns to Avoid
- **Parallel pipelines:** Don't run old and new simultaneously - user chose "swap all at once"
- **Feature flags:** Don't add complexity - clean break with git revert as recovery
- **Incremental tracing:** Don't try to understand old wiring - "clean sweep" approach
- **Scattered imports:** Keep all pipeline imports at top of script.js, not dynamic
- **Debug always-on:** Don't leave debug overlay visible by default in production
- **Logging without guard:** Don't console.log in hot paths without debug check

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clipboard access | document.execCommand | navigator.clipboard API | execCommand is deprecated; clipboard API is modern standard |
| JSON formatting | Manual string building | JSON.stringify(obj, null, 2) | Built-in with proper indentation |
| Key detection cross-platform | Manual keyCode checking | e.metaKey for Mac, e.ctrlKey for Windows/Linux | Standard properties handle cross-platform |
| Toast notification | Custom modal | Simple CSS transition + setTimeout | Keep it minimal; not a core feature |
| Position tracking | Local variable in script.js | PositionTracker.getConfirmedPosition() | Single source of truth pattern |

**Key insight:** This phase is integration, not implementation. Use the components as designed; resist the urge to add new logic. If something doesn't work, fix it in the component, not in the wiring.

## Common Pitfalls

### Pitfall 1: Orphaned Old Code References
**What goes wrong:** Old component names/patterns accidentally left in script.js
**Why it happens:** Large file (800+ lines), easy to miss references during search-replace
**How to avoid:**
- Delete old files first (compile errors surface references)
- Search for old class names: TextMatcher, ScrollSync, ConfidenceLevel
- Search for old variable names: textMatcher, scrollSync
- Search for old methods: getMatchWithConfidence, updateConfidence, handleMatch
**Warning signs:** Runtime errors referencing undefined modules; unexpected behavior

### Pitfall 2: Wrong Callback Wiring Order
**What goes wrong:** Components initialized but not connected; speech doesn't trigger scrolling
**Why it happens:** Missing or incorrect callback hookup between pipeline stages
**How to avoid:**
- Follow pipeline order: Speech -> WordMatcher -> PositionTracker -> ScrollController
- Verify each stage receives output from previous
- Add debug logging at each stage to trace flow
**Warning signs:** Speech recognized but no scrolling; matches found but position doesn't update

### Pitfall 3: Debug Overlay Showing Wrong State
**What goes wrong:** Debug overlay displays v1.0 state fields that no longer exist
**Why it happens:** HTML not updated for new component properties
**How to avoid:**
- Review debug overlay HTML for v1.0-specific fields (scrollState, targetSpeed, etc.)
- Update to v1.1 properties: confirmedPosition, isTracking, speakingPace
- Match field names to actual component APIs
**Warning signs:** "undefined" values in debug overlay; NaN in numeric fields

### Pitfall 4: Clipboard API Fails Silently
**What goes wrong:** State export button does nothing; user doesn't know it failed
**Why it happens:** Clipboard API requires secure context (HTTPS) and may require user gesture
**How to avoid:**
- Wrap in try/catch with fallback to console.log
- Show visual feedback (toast) on success
- Test in both HTTP (dev) and HTTPS (production) contexts
**Warning signs:** Button click has no visible effect; console errors about permissions

### Pitfall 5: Dynamic Imports Break After Refactor
**What goes wrong:** Module import paths incorrect after file structure changes
**Why it happens:** Relative paths become wrong when files move or delete
**How to avoid:**
- Use explicit relative paths: './matching/WordMatcher.js'
- Verify import statements after any file deletion
- Test imports in browser dev tools network tab
**Warning signs:** 404 errors in network tab; "Failed to fetch" module errors

### Pitfall 6: Reset Not Cleaning All State
**What goes wrong:** After reset, old position state persists causing wrong behavior
**Why it happens:** reset() not called on all components; new pipeline has different reset pattern
**How to avoid:**
- Update resetTeleprompter function for new components
- Call reset on: positionTracker, scrollController, highlighter
- Verify scroll position returns to 0
**Warning signs:** After reset, scrolling starts from wrong position; old highlights persist

## Code Examples

Verified patterns for integration:

### Complete initMatchingSystem Replacement
```javascript
// Source: Combined from Phase 5-7 research + existing script.js pattern
import { createMatcher, findMatches } from './matching/WordMatcher.js';
import { PositionTracker } from './matching/PositionTracker.js';
import { ScrollController } from './matching/ScrollController.js';
import { Highlighter } from './matching/Highlighter.js';

// Pipeline components (module-level)
let matcher = null;
let positionTracker = null;
let scrollController = null;
let highlighter = null;

// Debug mode (user decision: off by default)
let debugMode = false;

async function initMatchingSystem(scriptText) {
  // Build stateless matcher for this script
  matcher = createMatcher(scriptText, { threshold: 0.3 });

  // Create stateful position tracker
  positionTracker = new PositionTracker({
    confidenceThreshold: 0.7,
    nearbyThreshold: 10,
    smallSkipConsecutive: 4,
    largeSkipConsecutive: 5
  });

  // Create reactive scroll controller
  scrollController = new ScrollController(
    teleprompterContainer,
    positionTracker,
    matcher.scriptWords.length,
    {
      caretPercent: loadCaretSetting(),
      holdTimeout: 5000,
      onStateChange: (scrollState) => {
        updateTrackingIndicator(scrollState);
        debugLog('[Scroll] State:', scrollState);
      }
    }
  );

  // Create highlighter (same as v1.0)
  highlighter = new Highlighter(teleprompterText, {
    phraseLength: 3,
    enabled: state.highlightEnabled
  });

  debugLog('[Pipeline] Initialized with', matcher.scriptWords.length, 'words');
}
```

### Updated enableVoiceMode with New Pipeline
```javascript
// Source: Existing enableVoiceMode + new pipeline pattern
async function enableVoiceMode() {
  // Microphone permission request (unchanged)
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch (err) {
    handleMicrophoneError(err);
    return;
  }

  // Initialize visualizer (unchanged)
  if (!audioVisualizer) {
    audioVisualizer = new AudioVisualizer(waveformCanvas);
  }
  audioVisualizer.start(audioStream);

  // Initialize speech recognizer with NEW pipeline callback
  if (!speechRecognizer) {
    speechRecognizer = new SpeechRecognizer({
      onTranscript: handleSpeechTranscript,  // NEW: extracted function
      onError: (errorType, isFatal) => {
        console.error('[Voice] Error:', errorType, 'fatal:', isFatal);
        if (isFatal) {
          disableVoiceMode();
          showVoiceError(`Voice recognition error: ${errorType}`);
        }
      },
      onStateChange: (newState) => {
        state.voiceState = newState;
        updateVoiceIndicator();
      }
    });
  }

  speechRecognizer.start();

  // Start scroll controller when voice mode activates
  if (scrollController) {
    scrollController.start();
  }

  // Update UI
  state.voiceEnabled = true;
  voiceToggle.classList.add('active');
  listeningIndicator.classList.remove('hidden');
}

function handleSpeechTranscript(text, isFinal) {
  if (!matcher || !positionTracker || !scrollController) {
    debugLog('[Pipeline] Components not ready');
    return;
  }

  debugLog('[Speech]', isFinal ? 'FINAL:' : 'interim:', text);

  // Get current position from PositionTracker
  const prevPosition = positionTracker.getConfirmedPosition();

  // Find matches using stateless WordMatcher
  const result = findMatches(text, matcher, prevPosition, {
    radius: 50,
    minConsecutive: 2,
    distanceWeight: 0.3
  });

  if (!result.bestMatch) {
    debugLog('[Pipeline] No match found');
    return;
  }

  debugLog('[Match]', {
    position: result.bestMatch.position,
    score: result.bestMatch.combinedScore.toFixed(3),
    distance: result.bestMatch.distance
  });

  // Process through PositionTracker
  const processResult = positionTracker.processMatch(result.bestMatch);

  debugLog('[Position]', processResult.action,
    processResult.action === 'advanced'
      ? `-> ${processResult.confirmedPosition}`
      : `(confirmed: ${processResult.confirmedPosition})`
  );

  if (processResult.action === 'advanced') {
    // Notify ScrollController
    scrollController.onPositionAdvanced(
      processResult.confirmedPosition,
      prevPosition
    );

    // Update highlight
    if (highlighter && state.highlightEnabled) {
      highlighter.highlightPosition(
        processResult.confirmedPosition,
        matcher.scriptWords
      );
    }

    // Update confidence indicator
    if (audioVisualizer) {
      audioVisualizer.setConfidenceLevel('high');
    }
  } else if (processResult.action === 'exploring') {
    // Show medium confidence during skip exploration
    if (audioVisualizer) {
      audioVisualizer.setConfidenceLevel('medium');
    }
  }
}
```

### Updated disableVoiceMode
```javascript
function disableVoiceMode() {
  // Stop speech recognition
  if (speechRecognizer) {
    speechRecognizer.stop();
  }

  // Stop visualizer
  if (audioVisualizer) {
    audioVisualizer.stop();
  }

  // Stop scroll controller (NEW: was scrollSync.stop())
  if (scrollController) {
    scrollController.stop();
  }

  audioStream = null;

  // Update UI
  state.voiceEnabled = false;
  state.voiceState = 'idle';
  voiceToggle.classList.remove('active');
  listeningIndicator.classList.add('hidden');

  // Hide debug overlay when voice mode disabled
  if (debugOverlay && !debugMode) {
    debugOverlay.classList.add('hidden');
  }
}
```

### Updated resetTeleprompter
```javascript
function resetTeleprompter() {
  // Stop voice mode if active
  if (state.voiceEnabled) {
    disableVoiceMode();
  }

  // Stop manual scrolling
  if (state.isScrolling) {
    stopScrolling();
  }

  // Reset scroll position
  if (teleprompterContainer) {
    teleprompterContainer.scrollTop = 0;
  }

  // Reset NEW pipeline components
  if (positionTracker) {
    positionTracker.reset();
  }
  if (scrollController) {
    scrollController.reset();
  }
  if (highlighter) {
    highlighter.clear();
  }

  debugLog('[Reset] Teleprompter reset to start');
}
```

### Debug Mode Implementation
```javascript
// Debug mode state
let debugMode = false;
let debugUpdateInterval = null;

// Debug logging helper
function debugLog(...args) {
  if (debugMode) {
    console.log('[Debug]', ...args);
  }
}

function toggleDebugMode() {
  debugMode = !debugMode;

  if (debugOverlay) {
    debugOverlay.classList.toggle('hidden', !debugMode);
  }

  if (debugMode) {
    startDebugUpdates();
    debugLog('Debug mode enabled');
  } else {
    stopDebugUpdates();
  }
}

function startDebugUpdates() {
  if (debugUpdateInterval) return;
  debugUpdateInterval = setInterval(updateDebugOverlay, 100);
}

function stopDebugUpdates() {
  if (debugUpdateInterval) {
    clearInterval(debugUpdateInterval);
    debugUpdateInterval = null;
  }
}

function updateDebugOverlay() {
  if (!debugOverlay) return;

  // Position info (from PositionTracker)
  const posInfo = positionTracker ? {
    confirmed: positionTracker.getConfirmedPosition(),
    total: matcher?.scriptWords.length || 0
  } : { confirmed: 0, total: 0 };

  document.getElementById('debug-position').textContent =
    `${posInfo.confirmed}/${posInfo.total}`;

  // Scroll info (from ScrollController)
  if (scrollController) {
    document.getElementById('debug-pace').textContent =
      scrollController.speakingPace.toFixed(1);
    document.getElementById('debug-state').textContent =
      scrollController.isTracking ? 'tracking' : 'holding';
  }

  // Speed display (current scroll position delta)
  if (teleprompterContainer) {
    document.getElementById('debug-speed').textContent =
      Math.round(teleprompterContainer.scrollTop);
  }
}

// Keyboard shortcut for debug toggle
document.addEventListener('keydown', (e) => {
  // Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (Mac)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyD') {
    e.preventDefault();
    toggleDebugMode();
    return;
  }

  // ... existing teleprompter mode shortcuts
});
```

### State Export Button
```html
<!-- Add to debug overlay in index.html -->
<button id="export-state-btn" class="debug-btn">Export State</button>
```

```javascript
// State export implementation
async function exportDebugState() {
  const stateSnapshot = {
    timestamp: new Date().toISOString(),
    version: '1.1',

    position: positionTracker ? {
      confirmed: positionTracker.getConfirmedPosition(),
      candidate: positionTracker.candidatePosition,
      consecutiveCount: positionTracker.consecutiveMatchCount,
      lastMatchEnd: positionTracker.lastMatchEndPosition
    } : null,

    scroll: scrollController ? {
      isTracking: scrollController.isTracking,
      speakingPace: scrollController.speakingPace,
      targetScrollTop: scrollController.targetScrollTop,
      caretPercent: scrollController.caretPercent,
      currentScroll: teleprompterContainer?.scrollTop || 0
    } : null,

    speech: {
      enabled: state.voiceEnabled,
      state: state.voiceState
    },

    script: matcher ? {
      totalWords: matcher.scriptWords.length,
      firstWords: matcher.scriptWords.slice(0, 5).join(' '),
      lastWords: matcher.scriptWords.slice(-5).join(' ')
    } : null,

    settings: {
      fontSize: state.fontSize,
      highlightEnabled: state.highlightEnabled
    }
  };

  try {
    const json = JSON.stringify(stateSnapshot, null, 2);
    await navigator.clipboard.writeText(json);
    showExportSuccess();
  } catch (err) {
    console.error('Clipboard write failed:', err);
    // Fallback: log to console for manual copy
    console.log('Debug state (copy manually):\n', JSON.stringify(stateSnapshot, null, 2));
    showExportFallback();
  }
}

function showExportSuccess() {
  const btn = document.getElementById('export-state-btn');
  if (btn) {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('success');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('success');
    }, 1500);
  }
}

function showExportFallback() {
  const btn = document.getElementById('export-state-btn');
  if (btn) {
    btn.textContent = 'See Console';
    setTimeout(() => {
      btn.textContent = 'Export State';
    }, 2000);
  }
}

// Wire up button
document.getElementById('export-state-btn')?.addEventListener('click', exportDebugState);
```

## State of the Art

| Old Approach (v1.0) | Current Approach (v1.1) | Reason for Change |
|---------------------|-------------------------|-------------------|
| TextMatcher (stateful) | WordMatcher (stateless) + PositionTracker | Clear separation of concerns; easier testing |
| ScrollSync (state machine) | ScrollController (reactive) | Simpler; single source of truth for position |
| ConfidenceLevel (class) | Combined score in WordMatcher | Continuous 0-1 score more flexible than discrete levels |
| Debug overlay visible with voice | Hidden by default, keyboard shortcut toggle | Production-ready; no debug clutter |
| Console.log everywhere | Debug-guarded logging | Clean production console |
| No state export | JSON clipboard export | Issue reporting capability |

**Deprecated/outdated (to delete):**
- `TextMatcher.js` - Replaced by WordMatcher + PositionTracker
- `ScrollSync.js` - Replaced by ScrollController
- `ConfidenceLevel.js` - Scoring absorbed into WordMatcher

## Open Questions

Things that couldn't be fully resolved:

1. **Caret slider integration with new ScrollController**
   - What we know: ScrollController has setCaretPercent method
   - What's unclear: Existing debug overlay has caret slider; need to wire to new API
   - Recommendation: Keep slider, update to call scrollController.setCaretPercent()

2. **Tuning controls relevance**
   - What we know: Debug overlay has many v1.0 tuning inputs (base-speed, behind-max, etc.)
   - What's unclear: Which map to v1.1 components; some may be obsolete
   - Recommendation: Remove obsolete controls or map to new component options

3. **Tracking indicator update**
   - What we know: VIS-01 requires tracking state indicator
   - What's unclear: Current indicator uses v1.0 ScrollState; needs update for v1.1
   - Recommendation: Update to use scrollController.isTracking boolean

4. **Error recovery path**
   - What we know: User chose git revert for recovery
   - What's unclear: At what granularity to commit for clean revert points
   - Recommendation: Commit after file deletion, commit after successful wiring

## Sources

### Primary (HIGH confidence)
- script.js (existing) - Current integration patterns, 816 lines
- WordMatcher.js, PositionTracker.js, ScrollController.js - v1.1 component APIs
- 08-CONTEXT.md - User decisions on transition approach, debugging
- Phase 5-7 RESEARCH.md files - Component integration patterns

### Secondary (MEDIUM confidence)
- [MDN Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText) - navigator.clipboard.writeText documentation
- [MDN KeyboardEvent](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent) - e.metaKey, e.ctrlKey for cross-platform shortcuts
- [JavaScript Modules Best Practices](https://dmitripavlutin.com/javascript-modules-best-practices/) - ES module patterns

### Tertiary (LOW confidence)
- WebSearch results for refactoring patterns - General guidance, not project-specific

## Metadata

**Confidence breakdown:**
- Pipeline wiring: HIGH - Component APIs are well-defined from Phase 5-7; patterns clear
- File deletion: HIGH - Straightforward git rm; compile errors guide cleanup
- Debug overlay: HIGH - Simple DOM manipulation; clipboard API well-documented
- Integration testing: MEDIUM - End-to-end behavior may need tuning; components tested individually

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - integration is specific to this codebase state)
