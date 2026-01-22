# Phase 1: Core Display & Manual Control - Research

**Researched:** 2026-01-22
**Domain:** Web-based teleprompter with smooth scrolling and manual controls
**Confidence:** HIGH

## Summary

Researched how to build a professional web-based teleprompter application with smooth continuous scrolling, manual controls, and broadcast-style display. The standard approach in 2026 is vanilla JavaScript with requestAnimationFrame for smooth scrolling, CSS transitions for control overlays, and native Fullscreen API for distraction-free reading.

Key findings:
- **Smooth scrolling**: requestAnimationFrame is the 2026 standard for constant-speed smooth scrolling (60 FPS), avoiding CSS scroll-behavior which lacks speed control
- **Control overlays**: CSS transitions with mousemove event listeners provide smooth fade in/out behavior
- **Fullscreen API**: Broadly supported (all modern browsers), requires user gesture, simple Promise-based API
- **State persistence**: localStorage for user preferences (text size, scroll speed) is the standard approach
- **Framework choice**: For simple apps in 2026, vanilla JavaScript is recommended over frameworks - lighter, faster, and sufficient with modern browser APIs

**Primary recommendation:** Build with vanilla JavaScript using requestAnimationFrame for scrolling, CSS for styling/transitions, and localStorage for settings persistence. No framework needed for this scope.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JavaScript | ES2024+ | Core logic and scrolling | Modern browser APIs are sufficient; frameworks add unnecessary complexity for simple apps |
| requestAnimationFrame | Native API | Smooth 60 FPS scrolling | Standard for constant-speed animations, syncs with browser render cycle |
| Fullscreen API | Native API | Distraction-free mode | Universally supported, Promise-based, simple to implement |
| localStorage | Native API | Settings persistence | Built-in, 5MB storage, perfect for user preferences |
| CSS Transitions | Native CSS | Fade effects for controls | Hardware-accelerated, smooth, no JavaScript needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS overscroll-behavior | Safari 16+ | Prevent scroll bounce on iOS | Essential for fullscreen mobile experience |
| CSS user-select | Native CSS | Prevent text selection | Avoid selection during teleprompter scrolling |
| CSS position: fixed | Native CSS | Reading marker overlay | Create fixed reading guide that text scrolls past |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla JS | React/Vue | Framework adds build complexity, bundle size; only worth it for complex state management |
| requestAnimationFrame | GSAP/Lenis library | Libraries smoother for complex animations but overkill for constant-speed scroll |
| CSS scroll-behavior: smooth | Native smooth scrolling | CSS lacks speed control - can't adjust pixels/second dynamically |
| localStorage | IndexedDB | IndexedDB is overkill for simple key-value settings |

**Installation:**
No npm packages required - use native browser APIs only.

## Architecture Patterns

### Recommended Project Structure
```
/
├── index.html           # Single-page app structure
├── styles.css           # All styles (editor, teleprompter, controls)
├── script.js            # Core application logic
└── README.md            # Usage instructions
```

**Rationale:** Simple single-page architecture matches the proof-of-concept scope. No build tools, no bundler, instant deployment to static hosting.

### Pattern 1: State Management with Proxies (2026 Standard)
**What:** Use JavaScript Proxy objects for reactive state that auto-updates UI when state changes
**When to use:** When you need centralized state without framework overhead

**Example:**
```javascript
// Modern vanilla JS state management pattern
const createState = (initialState) => {
  let listeners = [];

  const state = new Proxy(initialState, {
    set(target, property, value) {
      target[property] = value;
      listeners.forEach(listener => listener(property, value));
      return true;
    }
  });

  const subscribe = (listener) => {
    listeners.push(listener);
  };

  return { state, subscribe };
};

// Usage for teleprompter
const { state, subscribe } = createState({
  scrollSpeed: 2,
  fontSize: 32,
  isScrolling: false,
  mode: 'editor' // 'editor' or 'teleprompter'
});

subscribe((property, value) => {
  localStorage.setItem(property, JSON.stringify(value));
  updateUI(property, value);
});
```

### Pattern 2: RequestAnimationFrame Scrolling Loop
**What:** Constant-speed scrolling using requestAnimationFrame with timestamp-based calculation
**When to use:** For smooth, constant-speed scrolling (teleprompter's core feature)

**Example:**
```javascript
// Source: Verified against MDN requestAnimationFrame best practices
let lastTimestamp = null;
let animationId = null;

function scrollLoop(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;

  const deltaTime = timestamp - lastTimestamp;
  const pixelsToScroll = (state.scrollSpeed * deltaTime) / 1000; // pixels per second

  const scrollContainer = document.getElementById('teleprompter-text');
  scrollContainer.scrollTop += pixelsToScroll;

  lastTimestamp = timestamp;

  if (state.isScrolling) {
    animationId = requestAnimationFrame(scrollLoop);
  }
}

function startScrolling() {
  state.isScrolling = true;
  lastTimestamp = null;
  animationId = requestAnimationFrame(scrollLoop);
}

function stopScrolling() {
  state.isScrolling = false;
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}
```

### Pattern 3: Auto-Hide Overlay with CSS Transitions
**What:** Controls that fade in on mouse movement and fade out after inactivity
**When to use:** Essential for teleprompter UI - controls must not distract from text

**Example:**
```css
/* Source: MDN CSS Transitions guide */
.controls-overlay {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  opacity: 0;
  transition: opacity 0.3s ease-out;
  pointer-events: none;
}

.controls-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}
```

```javascript
// Ticking flag pattern to prevent excessive RAF calls
let hideTimeout = null;
let ticking = false;

function showControls() {
  const overlay = document.querySelector('.controls-overlay');
  overlay.classList.add('visible');

  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    overlay.classList.remove('visible');
  }, 3000); // Hide after 3 seconds of inactivity
}

document.addEventListener('mousemove', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      showControls();
      ticking = false;
    });
    ticking = true;
  }
});
```

### Pattern 4: Fullscreen API with Error Handling
**What:** Toggle fullscreen mode with proper Promise handling and user feedback
**When to use:** Essential for distraction-free teleprompter experience

**Example:**
```javascript
// Source: MDN Fullscreen API official documentation
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (error) {
    console.error('Fullscreen error:', error);
    showUserMessage('Fullscreen not available. Press F11 to enter fullscreen.');
  }
}

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', () => {
  const isFullscreen = !!document.fullscreenElement;
  updateFullscreenButton(isFullscreen);
});

// Must be called from user gesture (click, keypress)
fullscreenButton.addEventListener('click', toggleFullscreen);
```

### Pattern 5: localStorage Settings Persistence
**What:** Save and restore user preferences across sessions
**When to use:** Text size and scroll speed should persist between sessions

**Example:**
```javascript
// Source: MDN Web Storage API + 2026 best practices
const SETTINGS_KEY = 'teleprompter-settings';

function saveSettings() {
  const settings = {
    scrollSpeed: state.scrollSpeed,
    fontSize: state.fontSize,
    lastUpdated: Date.now()
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const settings = JSON.parse(saved);
      state.scrollSpeed = settings.scrollSpeed ?? 2;
      state.fontSize = settings.fontSize ?? 32;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    // Use defaults if localStorage fails
  }
}

// Load settings on page load
loadSettings();

// Auto-save when state changes
subscribe((property, value) => {
  if (['scrollSpeed', 'fontSize'].includes(property)) {
    saveSettings();
  }
});
```

### Anti-Patterns to Avoid
- **Using CSS scroll-behavior: smooth for teleprompter scrolling:** Cannot control speed in pixels/second, which is essential for teleprompter
- **Animating to/from auto values:** Produces unpredictable results across browsers (MDN specification warning)
- **Setting overflow: hidden on body in fullscreen:** Breaks mobile Safari scrolling; use overscroll-behavior instead
- **Storing script text in localStorage:** 5MB limit can be exceeded; keep only settings in localStorage, use textarea value for script
- **Using setTimeout/setInterval for scrolling:** Not synced with browser render cycle, causes janky scrolling

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Smooth animation timing | Custom timing functions | requestAnimationFrame | Syncs with browser render cycle (60 FPS), handles tab visibility, prevents wasted CPU cycles |
| Fullscreen mode | Custom F11 detection/CSS hacks | Fullscreen API | Handles browser UI, keyboard shortcuts, user preferences, cross-browser compatibility |
| State persistence | Custom cookie parser | localStorage API | Built-in serialization, 5MB storage, sync API, domain-scoped |
| CSS transitions | JavaScript-based fade effects | CSS transition property | Hardware-accelerated, declarative, better performance |
| Scroll bounce prevention (mobile) | JavaScript touch event blocking | CSS overscroll-behavior | Native support in Safari 16+, fewer edge cases, better performance |

**Key insight:** Modern browser APIs (2024+) have matured to the point where custom solutions are rarely needed. The ecosystem has standardized around native APIs for common problems.

## Common Pitfalls

### Pitfall 1: Scroll Speed Inconsistency Across Frame Rates
**What goes wrong:** Using fixed pixel increments per frame causes different scroll speeds on different refresh rates (60Hz vs 120Hz displays)
**Why it happens:** Assuming requestAnimationFrame always fires at 60 FPS
**How to avoid:** Calculate pixels to scroll based on timestamp delta: `pixelsToScroll = (speed * deltaTime) / 1000`
**Warning signs:** Users on high-refresh displays report scrolling is too fast

### Pitfall 2: Fullscreen API Requires User Gesture
**What goes wrong:** Calling requestFullscreen() on page load or from async code fails silently
**Why it happens:** Browser security requires user interaction (click, keypress) to prevent abuse
**How to avoid:** Only call requestFullscreen() from within click/keypress event handlers
**Warning signs:** Fullscreen request fails with "Failed to execute 'requestFullscreen'" error

### Pitfall 3: iOS Safari Fullscreen Keyboard Blur
**What goes wrong:** On iOS, entering fullscreen while textarea has focus causes keyboard to appear and hide content
**Why it happens:** iOS Safari shows keyboard when input element has focus
**How to avoid:** Call `document.activeElement.blur()` before entering fullscreen mode
**Warning signs:** On mobile, fullscreen mode shows keyboard covering half the screen

### Pitfall 4: Text Selection During Scrolling
**What goes wrong:** Users accidentally select text when trying to interact with controls or reading
**Why it happens:** Default browser behavior allows text selection on click-drag
**How to avoid:** Apply `user-select: none` to teleprompter container in CSS
**Warning signs:** Text becomes highlighted/selected while scrolling or clicking controls

### Pitfall 5: Scroll Bounce on iOS Safari
**What goes wrong:** Scrolling past top/bottom of content causes rubber-band bounce effect that breaks immersion
**Why it happens:** iOS Safari's default overscroll behavior
**How to avoid:** Use `overscroll-behavior: none` on html/body (supported in Safari 16+)
**Warning signs:** Visible white/gray background when scrolling past content boundaries on iOS

### Pitfall 6: Mouse Cursor Visible During Fullscreen Reading
**What goes wrong:** Mouse cursor remains visible and distracting during fullscreen teleprompter reading
**Why it happens:** Browser doesn't automatically hide cursor in fullscreen
**How to avoid:** Set `cursor: none` on teleprompter container when in fullscreen mode
**Warning signs:** Users complain cursor is distracting during reading

### Pitfall 7: Inadequate Line Height for Large Text
**What goes wrong:** Text feels cramped and hard to read despite large font size
**Why it happens:** Browser default line-height (1.2) is too tight for large teleprompter text
**How to avoid:** Set line-height between 1.4-1.5 for optimal readability (industry standard)
**Warning signs:** Lines feel crowded, text is hard to scan quickly

### Pitfall 8: Forgetting to Cancel Animation Frame on Stop
**What goes wrong:** Scrolling continues in background even after stopping, wasting CPU/battery
**Why it happens:** requestAnimationFrame continues until explicitly cancelled
**How to avoid:** Always call `cancelAnimationFrame(animationId)` when stopping scroll
**Warning signs:** Performance tools show animation frames firing when scroll is paused

## Code Examples

Verified patterns from official sources:

### Responsive Font Sizing with Incremental Controls
```javascript
// User can increase/decrease font size with +/- buttons
const MIN_FONT_SIZE = 16;
const MAX_FONT_SIZE = 120;
const FONT_INCREMENT = 4;

function increaseFontSize() {
  if (state.fontSize < MAX_FONT_SIZE) {
    state.fontSize += FONT_INCREMENT;
    applyFontSize();
  }
}

function decreaseFontSize() {
  if (state.fontSize > MIN_FONT_SIZE) {
    state.fontSize -= FONT_INCREMENT;
    applyFontSize();
  }
}

function applyFontSize() {
  const textContainer = document.getElementById('teleprompter-text');
  textContainer.style.fontSize = `${state.fontSize}px`;
}
```

### Scroll Speed Controls with Range Validation
```javascript
// Speed in pixels per second
const MIN_SPEED = 10;   // 10 px/s - very slow
const MAX_SPEED = 200;  // 200 px/s - very fast
const SPEED_INCREMENT = 10;

function increaseSpeed() {
  if (state.scrollSpeed < MAX_SPEED) {
    state.scrollSpeed += SPEED_INCREMENT;
  }
}

function decreaseSpeed() {
  if (state.scrollSpeed > MIN_SPEED) {
    state.scrollSpeed -= SPEED_INCREMENT;
  }
}
```

### Reading Marker with Fixed Position
```css
/* Fixed reading guide line that stays in place while text scrolls */
.reading-marker {
  position: fixed;
  top: 33.33%; /* Top third of screen */
  left: 0;
  right: 0;
  height: 2px;
  background-color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
  z-index: 10;
}

/* Alternative: Highlight bar instead of line */
.reading-marker-highlight {
  position: fixed;
  top: 30%;
  left: 0;
  right: 0;
  height: 15%;
  background: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.05),
    rgba(255, 255, 255, 0.1),
    rgba(255, 255, 255, 0.05)
  );
  pointer-events: none;
  z-index: 10;
}
```

### Mode Toggle with Instant Transition
```javascript
// Toggle between editor and teleprompter modes
function switchMode(newMode) {
  const editorView = document.getElementById('editor-view');
  const teleprompterView = document.getElementById('teleprompter-view');

  if (newMode === 'teleprompter') {
    // Copy text from editor to teleprompter
    const scriptText = document.getElementById('script-input').value;
    document.getElementById('teleprompter-text').textContent = scriptText;

    // Switch views (instant, no transition per user decision)
    editorView.style.display = 'none';
    teleprompterView.style.display = 'block';

    // Reset scroll position
    teleprompterView.scrollTop = 0;
    lastTimestamp = null;

    state.mode = 'teleprompter';
  } else {
    // Stop scrolling if active
    if (state.isScrolling) {
      stopScrolling();
    }

    // Switch back to editor
    teleprompterView.style.display = 'none';
    editorView.style.display = 'block';

    state.mode = 'editor';
  }
}
```

### Broadcast-Style Typography
```css
/* Industry-standard broadcast teleprompter styling */
.teleprompter-container {
  background-color: #000; /* Pure black per user decision */
  color: #fff;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.5; /* Industry standard for readability */
  letter-spacing: 0.01em; /* Slight spacing for large text clarity */
  padding: 2rem;
  overflow-y: auto;
  height: 100vh;
  user-select: none; /* Prevent accidental text selection */
  cursor: none; /* Hide cursor in fullscreen */
}

.teleprompter-text {
  max-width: 800px; /* Optimal line length for readability */
  margin: 0 auto;
  text-align: left; /* Left-aligned paragraphs per user decision */
}

/* Paragraph spacing for natural reading flow */
.teleprompter-text p {
  margin-bottom: 1.5em;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jQuery for DOM manipulation | Vanilla JS with modern APIs | ~2020-2021 | Native APIs are now sufficient, no library needed |
| CSS animations for scrolling | requestAnimationFrame | ~2015 | RAF provides precise speed control in pixels/second |
| Vendor prefixes for Fullscreen API | Standard Fullscreen API | ~2021 (Safari) | No prefixes needed for modern browsers |
| JavaScript touch blocking for scroll bounce | CSS overscroll-behavior | 2022 (Safari 16) | Native CSS solution, better performance |
| setTimeout for animations | requestAnimationFrame | ~2013 | RAF syncs with browser render cycle |
| Cookies for settings | localStorage | ~2010 | localStorage is simpler, higher storage limit |
| React/Vue for simple apps | Vanilla JS | 2025-2026 trend | "Vanilla-first" movement - frameworks only when needed |

**Deprecated/outdated:**
- **Document.fullscreen property:** Deprecated in favor of `document.fullscreenElement` (returns element or null)
- **Webkitfullscreen/mozFullScreen prefixes:** Modern browsers support standard Fullscreen API
- **jQuery smooth scroll plugins:** requestAnimationFrame provides better control and performance

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal scroll speed range for different reading speeds**
   - What we know: Commercial teleprompters use pixels/second, typical range 20-150 px/s
   - What's unclear: Optimal default and range for web-based teleprompter with various screen sizes
   - Recommendation: Start with MIN=10, MAX=200, DEFAULT=50, allow user adjustment. Consider adding "slow/medium/fast" presets in future phase.

2. **Reading marker design preference**
   - What we know: User specified "line or arrow" - both are common in professional teleprompters
   - What's unclear: Which provides better reading experience for web-based use
   - Recommendation: Implement subtle horizontal line (2px, 30% opacity) as default. Claude has discretion per CONTEXT.md.

3. **Accessibility for screen readers**
   - What we know: WCAG 2.1 AA requires keyboard navigation and screen reader support
   - What's unclear: How screen readers should interact with auto-scrolling teleprompter text
   - Recommendation: Ensure keyboard controls (Space=play/pause, +/-=speed, arrows=manual scroll), add aria-live regions for state changes. Mark as LOW priority for proof of concept.

## Sources

### Primary (HIGH confidence)
- [MDN Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API) - Official browser API documentation
- [MDN CSS Transitions Guide](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Transitions/Using) - Official CSS transitions reference
- [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) - Web Storage API documentation
- [MDN requestAnimationFrame best practices](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) - Animation loop patterns

### Secondary (MEDIUM confidence)
- [CSS-Tricks: Reading Position Indicator](https://css-tricks.com/reading-position-indicator/) - Fixed position overlay patterns
- [BrowserStack: Smooth Scrolling with CSS & JavaScript](https://www.browserstack.com/guide/browser-compatible-smooth-scrolling-in-css-javascript) - Cross-browser scrolling techniques
- [DigitalOcean: CSS line-height for Readability](https://www.digitalocean.com/community/tutorials/css-line-height) - Typography best practices
- [GitHub: scroll-to-by-speed](https://github.com/ryanburnette/scroll-to-by-speed) - Pixels per second scrolling approach
- [DEV.to: requestAnimationFrame Explained](https://dev.to/tawe/requestanimationframe-explained-why-your-ui-feels-laggy-and-how-to-fix-it-3ep2) - Performance optimization

### Tertiary (LOW confidence - WebSearch only)
- [Teleprompter.com Blog: Dos and Don'ts](https://www.teleprompter.com/blog/teleprompter-for-professional-videos-dos-and-donts) - Usage best practices (not implementation)
- [Medium: State Management in Vanilla JS: 2026 Trends](https://medium.com/@chirag.dave/state-management-in-vanilla-js-2026-trends-f9baed7599de) - Modern patterns
- [The New Stack: Why Developers Are Ditching Frameworks](https://thenewstack.io/why-developers-are-ditching-frameworks-for-vanilla-javascript/) - Vanilla-first movement

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All recommendations based on official MDN documentation and verified browser support
- Architecture: HIGH - Patterns verified against official docs and 2026 best practices
- Pitfalls: HIGH - Common issues documented in browser specifications (Fullscreen API security, scroll bounce, RAF timing)
- Don't hand-roll: HIGH - Native APIs verified in MDN docs, avoiding reinvention is industry standard

**Research date:** 2026-01-22
**Valid until:** ~2026-03-22 (60 days - stable domain, browser APIs change slowly)

**Note on user decisions:** Research constrained by CONTEXT.md decisions:
- Left-aligned paragraphs (not centered)
- Reading marker (line or arrow - Claude's discretion on exact design)
- Plus/minus buttons for controls (not sliders)
- Pure black background (#000)
- System sans-serif font (no custom fonts)
- Instant mode transitions (no fade animations)
- Auto-hide overlay for controls
