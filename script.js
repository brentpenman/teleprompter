// v1.1 pipeline components
import { createMatcher, findMatches } from './matching/WordMatcher.js';
import { PositionTracker } from './matching/PositionTracker.js';
import { ScrollController } from './matching/ScrollController.js';
import { Highlighter } from './matching/Highlighter.js';

// State management using Proxy pattern
const createState = (initialState) => {
  let listeners = [];
  const state = new Proxy(initialState, {
    set(target, property, value) {
      target[property] = value;
      listeners.forEach(listener => listener(property, value));
      return true;
    }
  });
  const subscribe = (listener) => listeners.push(listener);
  return { state, subscribe };
};

// Initialize app state
const { state, subscribe } = createState({
  mode: 'editor',
  fontSize: 48,
  scrollSpeed: 50,
  isScrolling: false,
  voiceEnabled: false,      // Voice mode on/off
  voiceState: 'idle',       // 'idle' | 'listening' | 'error' | 'retrying'
  highlightEnabled: true    // Show text highlighting
});

// Voice recognition components
let speechRecognizer = null;
let audioVisualizer = null;
let audioStream = null;

// v1.1 pipeline component instances
let matcher = null;           // WordMatcher result (stateless)
let positionTracker = null;   // Stateful position
let scrollController = null;  // Reactive scroll
let highlighter = null;       // Kept from v1.0

// Debug mode (off by default, toggled via Ctrl+Shift+D)
let debugMode = false;

// Debug logging helper
function debugLog(...args) {
  if (debugMode) {
    console.log('[Debug]', ...args);
  }
}

// Debug mode toggle functions
function toggleDebugMode() {
  debugMode = !debugMode;

  if (debugOverlay) {
    debugOverlay.classList.toggle('hidden', !debugMode);
  }

  if (debugMode) {
    startDebugUpdates();
    console.log('[Debug] Mode enabled - Ctrl+Shift+D to toggle');
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

// Scrolling loop variables
let lastTimestamp = null;
let animationId = null;

// Constants
const MIN_SPEED = 10;
const MAX_SPEED = 200;
const SPEED_INCREMENT = 10;
const MIN_FONT_SIZE = 24;
const MAX_FONT_SIZE = 96;
const FONT_INCREMENT = 4;
const SETTINGS_KEY = 'teleprompter-settings';

// Default script shown to new users
const DEFAULT_SCRIPT = `Welcome to Teleprompter!

This app helps you read scripts smoothly while recording videos or giving presentations. Here's how to use it:

GETTING STARTED
Paste or type your script in this box, then click "Start Teleprompter" to begin.

PLAY MODE
Press the green Play button or hit Space to start auto-scrolling. Use the Speed controls or Arrow keys to adjust how fast the text moves. Press Space again to pause.

VOICE MODE
Click the purple Voice button to enable voice-controlled scrolling. The teleprompter will follow along as you speak, highlighting your position in the script. This requires microphone access.

Note: Play and Voice modes cannot be used at the same time.

OTHER CONTROLS
- Text +/- adjusts the font size (or use + and - keys)
- Fullscreen expands the view (or press F)
- Reset returns to the beginning
- Highlight toggles word highlighting in voice mode
- Exit returns to this editor

ADVANCED
Press Ctrl+Shift+D (or Cmd+Shift+D on Mac) to open the debug overlay with detailed stats and tuning controls.

Delete this text and paste your script to get started!`;

// DOM elements (initialized on DOMContentLoaded)
let editorView;
let teleprompterView;
let scriptInput;
let teleprompterText;
let teleprompterContainer;
let startButton;
let exitBtn;
let playPauseBtn;
let speedDownBtn;
let speedUpBtn;
let speedDisplay;
let sizeDownBtn;
let sizeUpBtn;
let sizeDisplay;
let fullscreenBtn;
let voiceToggle;
let listeningIndicator;
let waveformCanvas;
let highlightToggle;
let debugOverlay;
let debugUpdateInterval = null;

// Scrolling loop
function scrollLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;

  const deltaTime = timestamp - lastTimestamp;
  const pixelsToScroll = (state.scrollSpeed * deltaTime) / 1000;

  const newScrollTop = teleprompterContainer.scrollTop + pixelsToScroll;
  const maxScroll = teleprompterContainer.scrollHeight - teleprompterContainer.clientHeight;

  // Ensure scrollTop doesn't go negative or past the end
  if (newScrollTop < 0) {
    teleprompterContainer.scrollTop = 0;
  } else if (newScrollTop >= maxScroll) {
    // Reached the end, stop scrolling
    teleprompterContainer.scrollTop = maxScroll;
    stopScrolling();
    return;
  } else {
    teleprompterContainer.scrollTop = newScrollTop;
  }

  lastTimestamp = timestamp;

  if (state.isScrolling) {
    animationId = requestAnimationFrame(scrollLoop);
  }
}

function startScrolling() {
  state.isScrolling = true;
  lastTimestamp = null;
  animationId = requestAnimationFrame(scrollLoop);
  updatePlayPauseButton();
  voiceToggle.disabled = true;
}

function stopScrolling() {
  state.isScrolling = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  updatePlayPauseButton();
  // Re-enable voice toggle only if speech recognition is supported
  if (SpeechRecognizer.isSupported()) {
    voiceToggle.disabled = false;
  }
}

function toggleScrolling() {
  if (state.isScrolling) {
    stopScrolling();
  } else {
    startScrolling();
  }
}

function resetTeleprompter() {
  // Stop voice mode if active
  if (state.voiceEnabled) {
    disableVoiceMode();
  }

  // Stop manual scrolling
  if (state.isScrolling) {
    stopScrolling();
  }

  // Reset scroll position to align first line with caret
  if (teleprompterContainer) {
    const caretPercent = 33;
    const paddingPercent = 50;
    const initialScroll = window.innerHeight * (paddingPercent - caretPercent) / 100;
    teleprompterContainer.scrollTop = initialScroll;
  }

  // Reset v1.1 pipeline components
  if (positionTracker) {
    positionTracker.reset();
  }
  if (scrollController) {
    scrollController.reset();
  }
  if (highlighter) {
    highlighter.clear();
  }

  console.log('[Reset] Teleprompter reset to start');
}

// Speed controls
function increaseSpeed() {
  if (state.scrollSpeed < MAX_SPEED) {
    state.scrollSpeed += SPEED_INCREMENT;
    updateSpeedDisplay();
  }
}

function decreaseSpeed() {
  if (state.scrollSpeed > MIN_SPEED) {
    state.scrollSpeed -= SPEED_INCREMENT;
    updateSpeedDisplay();
  }
}

function updateSpeedDisplay() {
  if (speedDisplay) {
    speedDisplay.textContent = state.scrollSpeed;
  }
}

// Font size controls
function increaseFontSize() {
  if (state.fontSize < MAX_FONT_SIZE) {
    state.fontSize += FONT_INCREMENT;
    applyFontSize();
    updateSizeDisplay();
  }
}

function decreaseFontSize() {
  if (state.fontSize > MIN_FONT_SIZE) {
    state.fontSize -= FONT_INCREMENT;
    applyFontSize();
    updateSizeDisplay();
  }
}

function applyFontSize() {
  if (teleprompterText) {
    teleprompterText.style.fontSize = state.fontSize + 'px';
  }
}

function updateSizeDisplay() {
  if (sizeDisplay) {
    sizeDisplay.textContent = state.fontSize;
  }
}

// Fullscreen controls
async function toggleFullscreen() {
  // Blur any focused element first (iOS keyboard issue)
  if (document.activeElement) {
    document.activeElement.blur();
  }

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.error('Fullscreen error:', error);
    // Graceful fallback - just continue without fullscreen
  }
}

function updateFullscreenButton() {
  if (fullscreenBtn) {
    fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
  }
}

function updatePlayPauseButton() {
  if (playPauseBtn) {
    playPauseBtn.textContent = state.isScrolling ? 'Pause' : 'Play';
  }
}

// Auto-hide overlay
let hideTimeout = null;
let ticking = false;

function showControls() {
  const overlay = document.querySelector('.controls-overlay');
  if (!overlay) return;

  overlay.classList.add('visible');

  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    if (state.mode === 'teleprompter') {
      overlay.classList.remove('visible');
    }
  }, 3000);
}

// Tracking indicator update function
function updateTrackingIndicator(scrollState) {
  const indicator = document.getElementById('tracking-indicator');
  if (!indicator) return;

  // Remove all state classes
  indicator.classList.remove('tracking', 'holding', 'stopped');

  // Add appropriate class and text
  if (scrollState === 'tracking') {
    indicator.classList.add('tracking');
    indicator.textContent = 'Tracking';
  } else if (scrollState === 'holding') {
    indicator.classList.add('holding');
    indicator.textContent = 'Holding';
  } else {
    indicator.classList.add('stopped');
    indicator.textContent = 'Stopped';
  }
}

// v1.1 pipeline speech transcript handler
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

// Voice mode controls
async function enableVoiceMode() {
  // Request microphone permission
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

  // Initialize visualizer with the stream
  if (!audioVisualizer) {
    audioVisualizer = new AudioVisualizer(waveformCanvas);
  }
  audioVisualizer.start(audioStream);

  // Initialize and start speech recognizer
  if (!speechRecognizer) {
    speechRecognizer = new SpeechRecognizer({
      onTranscript: handleSpeechTranscript,
      onError: (errorType, isFatal) => {
        console.error(`[Voice] Error: ${errorType} (fatal: ${isFatal})`);
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

  // Start scroll controller
  if (scrollController) {
    scrollController.start();
  }

  // Update UI
  state.voiceEnabled = true;
  voiceToggle.classList.add('active');
  listeningIndicator.classList.remove('hidden');
  playPauseBtn.disabled = true;

  // Start debug updates if debug mode is enabled (keyboard shortcut controls visibility)
  if (debugMode) {
    startDebugUpdates();
  }
}

function disableVoiceMode() {
  // Stop speech recognition
  if (speechRecognizer) {
    speechRecognizer.stop();
  }

  // Stop visualizer (this also stops the audio stream)
  if (audioVisualizer) {
    audioVisualizer.stop();
  }

  // Stop voice-controlled scrolling
  if (scrollController) {
    scrollController.stop();
  }

  // Clear references
  audioStream = null;

  // Update UI
  state.voiceEnabled = false;
  state.voiceState = 'idle';
  voiceToggle.classList.remove('active');
  listeningIndicator.classList.add('hidden');
  playPauseBtn.disabled = false;

  // Stop debug updates (keyboard shortcut controls visibility)
  stopDebugUpdates();
}

function handleMicrophoneError(err) {
  let message = 'Unable to access microphone.';

  switch (err.name) {
    case 'NotAllowedError':
      message = 'Microphone permission denied. Voice mode requires microphone access.';
      voiceToggle.disabled = true;
      voiceToggle.title = message;
      break;
    case 'NotFoundError':
      message = 'No microphone detected.';
      break;
    case 'NotReadableError':
      message = 'Microphone is in use by another application.';
      break;
  }

  console.error('[Voice] Microphone error:', err.name, message);
  showVoiceError(message);
}

function showVoiceError(message) {
  // Brief error display using alert as simple fallback
  alert(message);
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
      scrollController.speakingPace?.toFixed(1) || '0';
    document.getElementById('debug-state').textContent =
      scrollController.isTracking ? 'tracking' : 'holding';
  }

  // Speed display
  if (teleprompterContainer) {
    document.getElementById('debug-speed').textContent =
      Math.round(teleprompterContainer.scrollTop);
  }

  // Target speed - use 0 or remove (v1.1 doesn't have this concept)
  const targetEl = document.getElementById('debug-target-speed');
  if (targetEl) targetEl.textContent = '-';
}

// Export debug state to clipboard
async function exportDebugState() {
  const stateSnapshot = {
    timestamp: new Date().toISOString(),
    version: '1.1',

    position: positionTracker ? {
      confirmed: positionTracker.getConfirmedPosition(),
      candidate: positionTracker.candidatePosition,
      consecutiveCount: positionTracker.consecutiveMatchCount
    } : null,

    scroll: scrollController ? {
      isTracking: scrollController.isTracking,
      speakingPace: scrollController.speakingPace,
      caretPercent: scrollController.caretPercent,
      currentScroll: teleprompterContainer?.scrollTop || 0
    } : null,

    speech: {
      enabled: state.voiceEnabled,
      state: state.voiceState
    },

    script: matcher ? {
      totalWords: matcher.scriptWords.length
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

function setupTuningControls() {
  // v1.0 tuning controls - disabled in v1.1
  // The v1.1 pipeline uses PositionTracker/ScrollController with different tuning
  // These controls may be re-implemented in a future phase
  console.log('[Tuning] v1.0 tuning controls disabled (v1.1 pipeline active)');
}

function updateVoiceIndicator() {
  if (!audioVisualizer) return;

  switch (state.voiceState) {
    case 'listening':
      audioVisualizer.setErrorState(false);  // Green bars
      break;
    case 'retrying':
    case 'error':
      audioVisualizer.setErrorState(true);   // Amber bars
      break;
    case 'idle':
      // No change needed, indicator hidden when idle
      break;
  }
}

function toggleVoiceMode() {
  if (state.voiceEnabled) {
    disableVoiceMode();
  } else {
    enableVoiceMode();
  }
}

// Matching system initialization (v1.1 pipeline)
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
      caretPercent: 33, // Default, will be updated by slider
      holdTimeout: 5000,
      onStateChange: (scrollState) => {
        updateTrackingIndicator(scrollState);
        debugLog('[Scroll] State:', scrollState);
      }
    }
  );

  // Create highlighter (same as v1.0 but static import)
  highlighter = new Highlighter(teleprompterText, {
    phraseLength: 3,
    enabled: state.highlightEnabled
  });

  debugLog('[Pipeline] Initialized with', matcher.scriptWords.length, 'words');
}

// Highlight toggle function
function toggleHighlight() {
  state.highlightEnabled = !state.highlightEnabled;
  if (highlighter) {
    highlighter.setEnabled(state.highlightEnabled);
  }
  updateHighlightButton();
}

function updateHighlightButton() {
  const btn = document.getElementById('highlight-toggle');
  if (btn) {
    btn.classList.toggle('active', state.highlightEnabled);
  }
}

// Settings persistence
function saveSettings() {
  const settings = {
    scrollSpeed: state.scrollSpeed,
    fontSize: state.fontSize,
    voiceEnabled: state.voiceEnabled,
    highlightEnabled: state.highlightEnabled
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const settings = JSON.parse(saved);
      state.scrollSpeed = settings.scrollSpeed ?? 50;
      state.fontSize = settings.fontSize ?? 48;
      state.highlightEnabled = settings.highlightEnabled ?? true;
      // Note: voiceEnabled is NOT restored to state here
      // It's restored when entering teleprompter mode via switchMode
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
}

function getSavedVoicePreference() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const settings = JSON.parse(saved);
      return settings.voiceEnabled ?? false;
    }
  } catch (e) {
    // Ignore errors
  }
  return false;
}

// Mode switching function
function switchMode(newMode) {
  if (newMode === 'teleprompter') {
    // Get text from editor
    const scriptContent = scriptInput.value;

    // Transfer text to teleprompter
    teleprompterText.textContent = scriptContent;

    // Apply font size from state
    applyFontSize();

    // Switch views
    editorView.classList.add('hidden');
    teleprompterView.classList.remove('hidden');

    // Set initial scroll position to align first line with caret
    // Must happen AFTER view is visible so layout is calculated
    // Container has 50vh top padding, caret is at 33% - scroll to align them
    requestAnimationFrame(() => {
      const caretPercent = 33;
      const paddingPercent = 50;
      const initialScroll = window.innerHeight * (paddingPercent - caretPercent) / 100;
      teleprompterContainer.scrollTop = initialScroll;
    });

    // Update state
    state.mode = 'teleprompter';

    // Initialize matching system
    initMatchingSystem(scriptContent).catch(err => {
      console.error('[Matching] Init failed:', err);
    });

    // Show controls briefly
    showControls();

    // Restore voice mode if previously enabled and browser supports it
    if (getSavedVoicePreference() && SpeechRecognizer.isSupported() && !state.voiceEnabled) {
      // Small delay to let UI settle before requesting mic permission
      setTimeout(() => enableVoiceMode(), 100);
    }
  } else if (newMode === 'editor') {
    // Stop scrolling if active
    if (state.isScrolling) {
      stopScrolling();
    }

    // Stop voice mode when exiting teleprompter
    if (state.voiceEnabled) {
      disableVoiceMode();
    }

    // Clean up v1.1 pipeline components
    if (positionTracker) {
      positionTracker.reset();
    }
    if (scrollController) {
      scrollController.reset();
    }
    if (highlighter) {
      highlighter.clear();
    }

    // Reset confidence indicator to default
    if (audioVisualizer) {
      audioVisualizer.setConfidenceLevel('high');
    }

    // Switch views
    teleprompterView.classList.add('hidden');
    editorView.classList.remove('hidden');

    // Update state
    state.mode = 'editor';
  }
}

// State subscription handler
subscribe((property, value) => {
  // Apply font size changes to teleprompter
  if (property === 'fontSize' && state.mode === 'teleprompter') {
    teleprompterText.style.fontSize = `${value}px`;
  }

  // Auto-save settings
  if (['scrollSpeed', 'fontSize', 'voiceEnabled', 'highlightEnabled'].includes(property)) {
    saveSettings();
  }
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Load settings from localStorage
  loadSettings();

  // Get DOM elements
  editorView = document.getElementById('editor-view');
  teleprompterView = document.getElementById('teleprompter-view');
  scriptInput = document.getElementById('script-input');
  teleprompterText = document.getElementById('teleprompter-text');
  teleprompterContainer = document.getElementById('teleprompter-container');
  startButton = document.getElementById('start-button');
  exitBtn = document.getElementById('exit-btn');
  playPauseBtn = document.getElementById('play-pause-btn');
  speedDownBtn = document.getElementById('speed-down');
  speedUpBtn = document.getElementById('speed-up');
  speedDisplay = document.getElementById('speed-display');
  sizeDownBtn = document.getElementById('size-down');
  sizeUpBtn = document.getElementById('size-up');
  sizeDisplay = document.getElementById('size-display');
  fullscreenBtn = document.getElementById('fullscreen-btn');
  voiceToggle = document.getElementById('voice-toggle');
  listeningIndicator = document.getElementById('listening-indicator');
  waveformCanvas = document.getElementById('waveform-canvas');
  highlightToggle = document.getElementById('highlight-toggle');
  debugOverlay = document.getElementById('debug-overlay');

  // Check browser support for speech recognition
  if (!SpeechRecognizer.isSupported()) {
    voiceToggle.disabled = true;
    voiceToggle.title = 'Voice recognition not supported in this browser. Use Chrome or Safari.';
  }

  // Update displays with loaded settings
  updateSpeedDisplay();
  updateSizeDisplay();
  updateHighlightButton();
  setupTuningControls();

  // Initialize default script if textarea is empty
  if (!scriptInput.value) {
    scriptInput.value = DEFAULT_SCRIPT;
    scriptInput.classList.add('has-default-script');
  }

  // Clear default script when user enters any text (typing or pasting)
  scriptInput.addEventListener('beforeinput', (e) => {
    if (scriptInput.classList.contains('has-default-script') && e.inputType.startsWith('insert')) {
      scriptInput.value = '';
      scriptInput.classList.remove('has-default-script');
    }
  });

  // Event listeners - Editor
  startButton.addEventListener('click', () => {
    switchMode('teleprompter');
  });

  // Event listeners - Teleprompter controls
  exitBtn.addEventListener('click', () => {
    switchMode('editor');
  });

  document.getElementById('reset-btn').addEventListener('click', resetTeleprompter);

  playPauseBtn.addEventListener('click', toggleScrolling);

  speedUpBtn.addEventListener('click', increaseSpeed);
  speedDownBtn.addEventListener('click', decreaseSpeed);

  sizeUpBtn.addEventListener('click', increaseFontSize);
  sizeDownBtn.addEventListener('click', decreaseFontSize);

  fullscreenBtn.addEventListener('click', toggleFullscreen);

  // Voice toggle
  voiceToggle.addEventListener('click', toggleVoiceMode);

  // Highlight toggle
  if (highlightToggle) {
    highlightToggle.addEventListener('click', toggleHighlight);
  }

  // Debug overlay export button
  document.getElementById('export-state-btn')?.addEventListener('click', exportDebugState);

  // Caret slider wiring
  document.getElementById('caret-slider')?.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);

    // Update display
    const valueDisplay = document.getElementById('caret-value');
    if (valueDisplay) valueDisplay.textContent = `${value}%`;

    // Update caret line visual position
    const caretLine = document.getElementById('caret-line');
    if (caretLine) caretLine.style.top = `${value}%`;

    // Update reading marker (arrow) position
    const readingMarker = document.querySelector('.reading-marker');
    if (readingMarker) readingMarker.style.top = `${value}%`;

    // Update ScrollController (if initialized)
    if (scrollController && scrollController.setCaretPercent) {
      scrollController.setCaretPercent(value);
    }
  });

  // Caret arrow visibility toggle
  document.getElementById('caret-arrow-toggle')?.addEventListener('change', (e) => {
    const readingMarker = document.querySelector('.reading-marker');
    if (readingMarker) {
      readingMarker.classList.toggle('hidden', !e.target.checked);
    }
  });

  // Caret line visibility toggle
  document.getElementById('caret-line-toggle')?.addEventListener('change', (e) => {
    const caretLine = document.getElementById('caret-line');
    if (caretLine) {
      caretLine.classList.toggle('visible', e.target.checked);
    }
  });

  // Prevent manual scrolling when play mode or voice mode is active
  teleprompterContainer.addEventListener('wheel', (e) => {
    if (state.isScrolling || state.voiceEnabled) {
      e.preventDefault();
    }
  }, { passive: false });

  teleprompterContainer.addEventListener('touchmove', (e) => {
    if (state.isScrolling || state.voiceEnabled) {
      e.preventDefault();
    }
  }, { passive: false });
});

// Fullscreen change listener
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    teleprompterView.classList.add('fullscreen-active');
  } else {
    teleprompterView.classList.remove('fullscreen-active');
  }
  updateFullscreenButton();
});

// Mouse move and touch handlers for auto-hide controls
document.addEventListener('mousemove', () => {
  if (state.mode !== 'teleprompter') return;

  if (!ticking) {
    requestAnimationFrame(() => {
      showControls();
      ticking = false;
    });
    ticking = true;
  }
});

document.addEventListener('touchstart', showControls);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Debug overlay toggle: Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (Mac)
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyD') {
    e.preventDefault();
    toggleDebugMode();
    return;
  }

  if (state.mode !== 'teleprompter') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault(); // Prevent page scroll
      // Don't toggle play mode when voice mode is active
      if (!state.voiceEnabled) {
        toggleScrolling();
      }
      showControls();
      break;
    case 'ArrowUp':
      e.preventDefault();
      increaseSpeed();
      showControls();
      break;
    case 'ArrowDown':
      e.preventDefault();
      decreaseSpeed();
      showControls();
      break;
    case 'Equal': // + key
    case 'NumpadAdd':
      increaseFontSize();
      showControls();
      break;
    case 'Minus':
    case 'NumpadSubtract':
      decreaseFontSize();
      showControls();
      break;
    case 'KeyF':
      toggleFullscreen();
      showControls();
      break;
    case 'Escape':
      // If not in fullscreen, exit to editor
      if (!document.fullscreenElement) {
        switchMode('editor');
      }
      // If in fullscreen, browser handles exit
      break;
  }
});
