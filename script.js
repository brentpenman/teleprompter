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
  voiceState: 'idle'        // 'idle' | 'listening' | 'error' | 'retrying'
});

// Voice recognition components
let speechRecognizer = null;
let audioVisualizer = null;
let audioStream = null;

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
}

function stopScrolling() {
  state.isScrolling = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  updatePlayPauseButton();
}

function toggleScrolling() {
  if (state.isScrolling) {
    stopScrolling();
  } else {
    startScrolling();
  }
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
      onTranscript: (text, isFinal) => {
        // For Phase 2, just log transcripts (Phase 3 will use them for matching)
        console.log(`[Voice] ${isFinal ? 'FINAL' : 'interim'}: ${text}`);
      },
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

  // Update UI
  state.voiceEnabled = true;
  voiceToggle.classList.add('active');
  listeningIndicator.classList.remove('hidden');
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

  // Clear references
  audioStream = null;

  // Update UI
  state.voiceEnabled = false;
  state.voiceState = 'idle';
  voiceToggle.classList.remove('active');
  listeningIndicator.classList.add('hidden');
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

// Settings persistence
function saveSettings() {
  const settings = {
    scrollSpeed: state.scrollSpeed,
    fontSize: state.fontSize,
    voiceEnabled: state.voiceEnabled
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

    // Reset scroll position
    teleprompterContainer.scrollTop = 0;

    // Switch views
    editorView.classList.add('hidden');
    teleprompterView.classList.remove('hidden');

    // Update state
    state.mode = 'teleprompter';

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
  if (['scrollSpeed', 'fontSize', 'voiceEnabled'].includes(property)) {
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

  // Check browser support for speech recognition
  if (!SpeechRecognizer.isSupported()) {
    voiceToggle.disabled = true;
    voiceToggle.title = 'Voice recognition not supported in this browser. Use Chrome or Safari.';
  }

  // Update displays with loaded settings
  updateSpeedDisplay();
  updateSizeDisplay();

  // Event listeners - Editor
  startButton.addEventListener('click', () => {
    switchMode('teleprompter');
  });

  // Event listeners - Teleprompter controls
  exitBtn.addEventListener('click', () => {
    switchMode('editor');
  });

  playPauseBtn.addEventListener('click', toggleScrolling);

  speedUpBtn.addEventListener('click', increaseSpeed);
  speedDownBtn.addEventListener('click', decreaseSpeed);

  sizeUpBtn.addEventListener('click', increaseFontSize);
  sizeDownBtn.addEventListener('click', decreaseFontSize);

  fullscreenBtn.addEventListener('click', toggleFullscreen);

  // Voice toggle
  voiceToggle.addEventListener('click', toggleVoiceMode);
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
  if (state.mode !== 'teleprompter') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault(); // Prevent page scroll
      toggleScrolling();
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
