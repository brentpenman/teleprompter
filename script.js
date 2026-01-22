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
  isScrolling: false
});

// DOM elements (initialized on DOMContentLoaded)
let editorView;
let teleprompterView;
let scriptInput;
let teleprompterText;
let teleprompterContainer;
let startButton;

// Mode switching function
function switchMode(newMode) {
  if (newMode === 'teleprompter') {
    // Get text from editor
    const scriptContent = scriptInput.value;

    // Transfer text to teleprompter
    teleprompterText.textContent = scriptContent;

    // Apply font size from state
    teleprompterText.style.fontSize = `${state.fontSize}px`;

    // Reset scroll position
    teleprompterContainer.scrollTop = 0;

    // Switch views
    editorView.classList.add('hidden');
    teleprompterView.classList.remove('hidden');

    // Update state
    state.mode = 'teleprompter';
  } else if (newMode === 'editor') {
    // Switch views
    teleprompterView.classList.add('hidden');
    editorView.classList.remove('hidden');

    // Stop scrolling if active (placeholder for Plan 02)
    if (state.isScrolling) {
      state.isScrolling = false;
    }

    // Update state
    state.mode = 'editor';
  }
}

// State subscription handler (for future use)
subscribe((property, value) => {
  // Apply font size changes to teleprompter
  if (property === 'fontSize' && state.mode === 'teleprompter') {
    teleprompterText.style.fontSize = `${value}px`;
  }
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  editorView = document.getElementById('editor-view');
  teleprompterView = document.getElementById('teleprompter-view');
  scriptInput = document.getElementById('script-input');
  teleprompterText = document.getElementById('teleprompter-text');
  teleprompterContainer = document.getElementById('teleprompter-container');
  startButton = document.getElementById('start-button');

  // Event listeners
  startButton.addEventListener('click', () => {
    switchMode('teleprompter');
  });

  // Placeholder for exit button (will be added in Plan 02)
  // exitButton.addEventListener('click', () => {
  //   switchMode('editor');
  // });
});
