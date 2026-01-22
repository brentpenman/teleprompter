# Architecture Research: Voice-Controlled Teleprompter

**Domain:** Real-time voice-tracking teleprompter web application
**Researched:** 2026-01-22
**Confidence:** MEDIUM-HIGH

## Executive Summary

Voice-controlled teleprompters require coordinating multiple real-time systems: speech recognition, text matching, position tracking, and scroll control. The architecture must handle the inherent uncertainty of speech recognition (pauses, paraphrasing, false starts) while maintaining smooth visual feedback.

**Key architectural insight:** Separate concerns cleanly between audio capture, text matching, and UI control. The speech recognition system produces uncertain data; the matching system resolves uncertainty; the UI reacts to high-confidence positions only.

## Standard Architecture Pattern

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Teleprompter│  │   Script     │  │   Controls   │      │
│  │    Display   │  │    Editor    │  │    Panel     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
├─────────┴──────────────────┴──────────────────┴──────────────┤
│                      STATE MANAGEMENT                        │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────┐  │
│  │         Application State (Zustand/Redux)              │  │
│  │  - Script content and structure                        │  │
│  │  - Current scroll position                             │  │
│  │  - Confidence scores                                   │  │
│  │  - Recognition status                                  │  │
│  └──────────────────────┬────────────────────────────────┘  │
│                         │                                    │
├─────────────────────────┴────────────────────────────────────┤
│                     PROCESSING LAYER                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Speech     │  │    Text      │  │    Scroll    │      │
│  │ Recognition  │→ │   Matcher    │→ │  Controller  │      │
│  │   Service    │  │   Service    │  │   Service    │      │
│  └──────┬───────┘  └──────────────┘  └──────────────┘      │
│         │                                                    │
├─────────┴────────────────────────────────────────────────────┤
│                     BROWSER APIs                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Web Speech API  |  MediaStream  |  AudioContext    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Speech Recognition Service** | Captures audio, produces transcripts with timestamps | Web Speech API wrapper with event handling |
| **Text Matcher Service** | Matches uncertain speech to script position | Fuzzy matching (Levenshtein) or semantic embeddings |
| **Scroll Controller Service** | Determines scroll behavior based on confidence | State machine: scroll/pause/jump |
| **Application State** | Single source of truth for app data | Zustand (lightweight) or Redux (complex apps) |
| **Teleprompter Display** | Renders script at current position with smooth scrolling | React component with CSS transitions or GPU-accelerated scroll |
| **Script Editor** | Allows user to input/edit script text | Controlled textarea or rich text editor |
| **Controls Panel** | Play/pause, manual scroll, settings | React components with state actions |

## Recommended Project Structure

```
src/
├── components/           # UI components
│   ├── TeleprompterDisplay/
│   │   ├── index.tsx           # Main display component
│   │   ├── ScrollContainer.tsx # GPU-accelerated scroll wrapper
│   │   └── HighlightedText.tsx # Current position indicator
│   ├── ScriptEditor/
│   │   └── index.tsx           # Script input component
│   └── ControlPanel/
│       └── index.tsx           # Play/pause/settings controls
│
├── services/             # Business logic (isolated from UI)
│   ├── speechRecognition.ts    # Web Speech API wrapper
│   ├── textMatcher.ts          # Fuzzy/semantic matching logic
│   ├── scrollController.ts     # Scroll decision state machine
│   └── scriptProcessor.ts      # Parse script into chunks/words
│
├── state/                # State management
│   ├── store.ts                # Zustand store or Redux setup
│   ├── slices/                 # State slices/reducers
│   │   ├── scriptSlice.ts      # Script content state
│   │   ├── positionSlice.ts    # Current position state
│   │   └── recognitionSlice.ts # Recognition status state
│   └── selectors.ts            # Memoized state selectors
│
├── hooks/                # Custom React hooks
│   ├── useSpeechRecognition.ts # Hook to interact with recognition service
│   ├── useScrollPosition.ts    # Hook for scroll position management
│   └── useTextMatcher.ts       # Hook for text matching logic
│
├── types/                # TypeScript definitions
│   ├── script.ts               # Script structure types
│   ├── recognition.ts          # Recognition result types
│   └── position.ts             # Position and confidence types
│
└── utils/                # Utility functions
    ├── levenshtein.ts          # Distance calculation
    ├── confidence.ts           # Confidence scoring logic
    └── smoothScroll.ts         # Scroll animation helpers
```

### Structure Rationale

- **services/**: Keep business logic independent of React. Services can be tested in isolation and potentially reused.
- **state/**: Centralized state makes it easy to debug and understand data flow. Zustand recommended for this size project.
- **hooks/**: Bridge between services and components. Hooks provide clean React integration without coupling components to implementation details.
- **components/**: Pure presentation components that receive props and render UI. Minimal logic.

## Architectural Patterns

### Pattern 1: Event-Driven Speech Recognition

**What:** Speech recognition emits events (result, interim, error) that update state, triggering downstream reactions.

**When to use:** Always for Web Speech API integration. The API is inherently event-based.

**Trade-offs:**
- **Pro:** Natural fit for the browser API, non-blocking
- **Pro:** Easy to handle multiple simultaneous concerns (UI updates, logging, analytics)
- **Con:** Can become complex with many event handlers; requires careful cleanup

**Example:**
```typescript
// services/speechRecognition.ts
class SpeechRecognitionService {
  private recognition: SpeechRecognition;
  private listeners: Map<string, Function[]> = new Map();

  constructor() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    // Configure for continuous real-time recognition
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    // Forward events to subscribers
    this.recognition.onresult = (event) => {
      this.emit('result', event.results);
    };

    this.recognition.onerror = (event) => {
      this.emit('error', event.error);
    };
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(cb => cb(data));
  }

  start() { this.recognition.start(); }
  stop() { this.recognition.stop(); }
}
```

### Pattern 2: Sliding Window Text Matching

**What:** Compare incoming speech transcripts against a sliding window of script text around the current position, not the entire script.

**When to use:** For performance with long scripts (> 1000 words). Reduces search space dramatically.

**Trade-offs:**
- **Pro:** Fast matching even with large scripts
- **Pro:** Prevents false positives from matches far from current position
- **Con:** Won't detect if user jumps to a different section (need fallback to full-script search)
- **Con:** Requires tuning window size (too small = miss jumps; too large = slow)

**Example:**
```typescript
// services/textMatcher.ts
import Levenshtein from 'fastest-levenshtein';

interface MatchResult {
  position: number;      // Character index in script
  confidence: number;    // 0-1 confidence score
  matched: string;       // What text was matched
}

class TextMatcherService {
  private windowSize = 200; // words before/after current position

  findMatch(
    transcript: string,
    script: string,
    currentPosition: number
  ): MatchResult | null {
    // Extract window around current position
    const words = script.split(/\s+/);
    const currentWordIndex = this.charToWordIndex(script, currentPosition);

    const start = Math.max(0, currentWordIndex - this.windowSize);
    const end = Math.min(words.length, currentWordIndex + this.windowSize);
    const windowWords = words.slice(start, end);
    const windowText = windowWords.join(' ');

    // Normalize both strings
    const normalizedTranscript = this.normalize(transcript);
    const transcriptWords = normalizedTranscript.split(/\s+/);

    // Slide transcript-sized window through script window
    let bestMatch: MatchResult | null = null;
    let bestDistance = Infinity;

    for (let i = 0; i <= windowWords.length - transcriptWords.length; i++) {
      const candidate = windowWords.slice(i, i + transcriptWords.length).join(' ');
      const distance = Levenshtein.distance(normalizedTranscript, candidate);

      if (distance < bestDistance) {
        bestDistance = distance;
        const confidence = 1 - (distance / Math.max(normalizedTranscript.length, candidate.length));

        if (confidence > 0.6) { // Threshold for "good enough"
          bestMatch = {
            position: this.wordToCharIndex(words, start + i),
            confidence,
            matched: candidate
          };
        }
      }
    }

    // Fallback: if no good match in window, search full script
    if (!bestMatch || bestMatch.confidence < 0.7) {
      return this.fullScriptSearch(transcript, script);
    }

    return bestMatch;
  }

  private normalize(text: string): string {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')    // Collapse whitespace
      .trim();
  }

  private charToWordIndex(text: string, charIndex: number): number {
    return text.substring(0, charIndex).split(/\s+/).length;
  }

  private wordToCharIndex(words: string[], wordIndex: number): number {
    return words.slice(0, wordIndex).join(' ').length;
  }

  private fullScriptSearch(transcript: string, script: string): MatchResult | null {
    // Fallback implementation for detecting large jumps
    // ... similar logic but over entire script
    return null;
  }
}
```

### Pattern 3: Confidence-Based Scroll State Machine

**What:** Separate scroll decision logic from matching logic. Scroll controller maintains state (scrolling/paused/jumping) and transitions based on confidence scores.

**When to use:** Always. This prevents jittery scrolling and makes behavior predictable.

**Trade-offs:**
- **Pro:** Smooth, predictable user experience
- **Pro:** Easy to tune behavior by adjusting thresholds
- **Con:** Adds complexity vs. naive "always scroll to match"

**Example:**
```typescript
// services/scrollController.ts
type ScrollState = 'idle' | 'scrolling' | 'paused' | 'jumping';

interface ScrollDecision {
  state: ScrollState;
  targetPosition: number | null;
  scrollSpeed: number; // pixels per second
}

class ScrollControllerService {
  private currentState: ScrollState = 'idle';
  private confidenceHistory: number[] = [];
  private historySize = 5; // Smooth over last N results

  // Thresholds
  private readonly SCROLL_CONFIDENCE = 0.75;
  private readonly PAUSE_CONFIDENCE = 0.5;
  private readonly JUMP_THRESHOLD = 100; // chars

  decide(
    matchPosition: number | null,
    matchConfidence: number,
    currentPosition: number
  ): ScrollDecision {
    // Update confidence history
    this.confidenceHistory.push(matchConfidence);
    if (this.confidenceHistory.length > this.historySize) {
      this.confidenceHistory.shift();
    }

    const avgConfidence = this.confidenceHistory.reduce((a, b) => a + b, 0) / this.confidenceHistory.length;

    // No match or low confidence → PAUSE
    if (!matchPosition || avgConfidence < this.PAUSE_CONFIDENCE) {
      return {
        state: 'paused',
        targetPosition: null,
        scrollSpeed: 0
      };
    }

    const distance = Math.abs(matchPosition - currentPosition);

    // Large jump detected → JUMP immediately
    if (distance > this.JUMP_THRESHOLD) {
      this.currentState = 'jumping';
      return {
        state: 'jumping',
        targetPosition: matchPosition,
        scrollSpeed: Infinity // Instant jump
      };
    }

    // High confidence and small distance → SCROLL smoothly
    if (avgConfidence >= this.SCROLL_CONFIDENCE) {
      this.currentState = 'scrolling';
      return {
        state: 'scrolling',
        targetPosition: matchPosition,
        scrollSpeed: this.calculateScrollSpeed(distance, avgConfidence)
      };
    }

    // Medium confidence → PAUSE (uncertain)
    return {
      state: 'paused',
      targetPosition: null,
      scrollSpeed: 0
    };
  }

  private calculateScrollSpeed(distance: number, confidence: number): number {
    // Faster scroll for higher confidence and larger distances
    const baseSpeed = 100; // pixels per second
    const confidenceMultiplier = confidence * 2;
    const distanceMultiplier = Math.min(distance / 50, 2);
    return baseSpeed * confidenceMultiplier * distanceMultiplier;
  }

  reset() {
    this.currentState = 'idle';
    this.confidenceHistory = [];
  }
}
```

### Pattern 4: React Hook Facade

**What:** Expose services to React components through custom hooks that handle lifecycle and state synchronization.

**When to use:** Always when using services with React. Keeps components clean and services testable.

**Trade-offs:**
- **Pro:** Clean separation of concerns
- **Pro:** Services remain framework-agnostic
- **Con:** Extra abstraction layer

**Example:**
```typescript
// hooks/useSpeechRecognition.ts
import { useEffect, useCallback } from 'react';
import { useStore } from '../state/store';
import { SpeechRecognitionService } from '../services/speechRecognition';

let recognitionService: SpeechRecognitionService | null = null;

export function useSpeechRecognition() {
  const { setRecognitionResult, setError, setStatus } = useStore();

  // Initialize service once
  useEffect(() => {
    if (!recognitionService) {
      recognitionService = new SpeechRecognitionService();

      recognitionService.on('result', (results: SpeechRecognitionResultList) => {
        const latest = results[results.length - 1];
        const transcript = latest[0].transcript;
        const confidence = latest[0].confidence;
        const isFinal = latest.isFinal;

        setRecognitionResult({ transcript, confidence, isFinal });
      });

      recognitionService.on('error', (error: string) => {
        setError(error);
        setStatus('error');
      });
    }

    return () => {
      // Cleanup on unmount
      recognitionService?.stop();
    };
  }, []);

  const start = useCallback(() => {
    recognitionService?.start();
    setStatus('listening');
  }, [setStatus]);

  const stop = useCallback(() => {
    recognitionService?.stop();
    setStatus('idle');
  }, [setStatus]);

  return { start, stop };
}
```

## Data Flow

### Real-Time Recognition Flow

```
User speaks
    ↓
[Browser Microphone] → [Web Speech API]
    ↓
SpeechRecognition emits 'result' event
    ↓
Recognition Service receives event
    ↓
    ├─→ Interim result? → Update state with low confidence
    │       ↓
    │   Text Matcher gets interim transcript
    │       ↓
    │   Returns tentative match (low confidence)
    │       ↓
    │   Scroll Controller receives match
    │       ↓
    │   Decision: PAUSE (confidence too low)
    │
    └─→ Final result? → Update state with high confidence
            ↓
        Text Matcher gets final transcript
            ↓
        Performs sliding window search
            ↓
        Returns best match with confidence score
            ↓
        Scroll Controller receives match
            ↓
        Decision: SCROLL or JUMP (based on confidence & distance)
            ↓
        State updates with new target position
            ↓
        TeleprompterDisplay re-renders
            ↓
        Smooth CSS transition or GPU-accelerated scroll
            ↓
        User sees script at correct position
```

### User Edit Flow

```
User types in Script Editor
    ↓
onChange event fires
    ↓
State updates with new script content
    ↓
Script Processor parses text into words/sentences
    ↓
State stores structured script
    ↓
TeleprompterDisplay re-renders with new text
    ↓
Text Matcher cache invalidated
    ↓
Next recognition result matches against new script
```

### Manual Jump Flow

```
User clicks word in TeleprompterDisplay
    ↓
Component calls position update action
    ↓
State updates current position directly
    ↓
Recognition Service resets (optional)
    ↓
Scroll Controller resets confidence history
    ↓
Display scrolls to clicked position
    ↓
Next speech recognition continues from new position
```

## State Management

### Recommended: Zustand (Lightweight)

For this project size, Zustand provides the right balance of simplicity and power.

```typescript
// state/store.ts
import create from 'zustand';

interface AppState {
  // Script
  scriptText: string;
  scriptWords: string[];

  // Position
  currentPosition: number;
  targetPosition: number | null;

  // Recognition
  recognitionStatus: 'idle' | 'listening' | 'error';
  currentTranscript: string;
  transcriptConfidence: number;

  // Scroll
  scrollState: 'idle' | 'scrolling' | 'paused' | 'jumping';
  scrollSpeed: number;

  // Actions
  setScriptText: (text: string) => void;
  setCurrentPosition: (position: number) => void;
  setRecognitionResult: (result: RecognitionResult) => void;
  setScrollDecision: (decision: ScrollDecision) => void;
}

export const useStore = create<AppState>((set) => ({
  // Initial state
  scriptText: '',
  scriptWords: [],
  currentPosition: 0,
  targetPosition: null,
  recognitionStatus: 'idle',
  currentTranscript: '',
  transcriptConfidence: 0,
  scrollState: 'idle',
  scrollSpeed: 0,

  // Actions
  setScriptText: (text) => set({
    scriptText: text,
    scriptWords: text.split(/\s+/)
  }),

  setCurrentPosition: (position) => set({
    currentPosition: position
  }),

  setRecognitionResult: (result) => set({
    currentTranscript: result.transcript,
    transcriptConfidence: result.confidence
  }),

  setScrollDecision: (decision) => set({
    scrollState: decision.state,
    targetPosition: decision.targetPosition,
    scrollSpeed: decision.scrollSpeed
  })
}));
```

### Alternative: Redux Toolkit (Complex Apps)

If the application grows to include features like multi-user collaboration, history/undo, or complex async workflows, Redux Toolkit provides better structure.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **MVP (single user, short scripts)** | Client-only, Web Speech API, Levenshtein matching, simple state |
| **Production (longer scripts, multiple languages)** | Add Web Workers for text matching, index script for faster search, consider AudioWorklet for lower latency |
| **Advanced (semantic matching, paraphrasing)** | Add Transformers.js with sentence embeddings (e.g., minishlab/potion-retrieval-32M), vector similarity instead of Levenshtein |
| **Enterprise (offline, privacy)** | Bundle local AI models, use AudioWorklet + Vosk for fully offline ASR, add IndexedDB for caching |

### Scaling Priorities

1. **First bottleneck: Text matching on long scripts (> 5000 words)**
   - **Fix:** Move matching to Web Worker, implement sliding window (Pattern 2), add script indexing

2. **Second bottleneck: Speech recognition latency**
   - **Fix:** Switch from Web Speech API to AudioWorklet + local ASR model (Vosk, Whisper.wasm)

3. **Third bottleneck: Semantic matching quality**
   - **Fix:** Add Transformers.js with embeddings, use cosine similarity instead of Levenshtein

## Anti-Patterns

### Anti-Pattern 1: Blocking Main Thread with Text Matching

**What people do:** Run Levenshtein distance calculation synchronously in the main thread for every interim result.

**Why it's wrong:** With long scripts and continuous interim results (multiple per second), this causes UI jank and dropped frames.

**Do this instead:**
- Debounce matching for interim results (only match every 200-300ms)
- Use Web Workers for matching on scripts > 2000 words
- Match only final results for smooth UI

### Anti-Pattern 2: Naive Full-Script Search

**What people do:** Compare every incoming transcript against the entire script from start to finish.

**Why it's wrong:** O(n) for every speech result = sluggish on long scripts. Also causes false positives when phrases repeat.

**Do this instead:** Use sliding window (Pattern 2) or index the script with a spatial data structure. Only fall back to full-script search when confidence is low (user may have jumped).

### Anti-Pattern 3: Instant Scroll on Every Match

**What people do:** Immediately scroll to matched position without smoothing or confidence checking.

**Why it's wrong:** Recognition confidence varies; low-confidence matches cause jittery, disorienting scrolling. Interim results change rapidly.

**Do this instead:** Use confidence-based state machine (Pattern 3). Smooth over recent history. Only scroll on high-confidence final results.

### Anti-Pattern 4: Tight Coupling Between Components

**What people do:** TeleprompterDisplay component directly instantiates SpeechRecognition API and handles matching logic.

**Why it's wrong:** Impossible to test, hard to change recognition strategy, can't reuse logic elsewhere.

**Do this instead:** Extract services, expose via hooks (Pattern 4). Components should be dumb presenters receiving props.

### Anti-Pattern 5: Ignoring Browser Compatibility

**What people do:** Use Web Speech API without checking for support or providing fallbacks.

**Why it's wrong:** Web Speech API support varies across browsers. Chrome has best support; Firefox/Safari are limited. Users get blank screen or errors.

**Do this instead:**
```typescript
function checkSpeechRecognitionSupport() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    return {
      supported: false,
      message: 'Speech recognition not supported in this browser. Please use Chrome.'
    };
  }

  return { supported: true };
}
```

Show clear error message and suggest Chrome if unsupported.

## Integration Points

### External APIs

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Web Speech API** | Browser native, event-based | Only use SpeechRecognition (not SpeechSynthesis for this app) |
| **Transformers.js (optional)** | NPM package, async model loading | For semantic matching upgrade; bundle size ~25MB min |
| **Vosk (advanced)** | WebSocket to local server or .wasm in browser | For offline ASR alternative |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Service ↔ State** | Direct function calls to update state | Services are stateless; all app state lives in Zustand/Redux |
| **State ↔ Components** | Hooks with selectors | Components subscribe to specific state slices, not entire state |
| **Component ↔ Component** | Via shared state only | No prop drilling; use state for cross-component communication |
| **Main Thread ↔ Web Worker** | postMessage API | Only if text matching moves to worker (performance optimization) |

## Build Order Implications

The architecture suggests a clear build order based on dependencies:

### Phase 1: Core Display (no voice)
- Script editor component
- Teleprompter display component
- Manual scroll controls
- Basic state management

**Rationale:** Get UI foundation working before adding complex speech recognition.

### Phase 2: Speech Recognition Service
- Web Speech API wrapper
- Basic event handling
- Display raw transcripts

**Rationale:** Validate speech recognition works in isolation before adding matching complexity.

### Phase 3: Basic Text Matching
- Levenshtein matching implementation
- Simple "scroll to best match" logic

**Rationale:** Prove matching concept with simplest algorithm first.

### Phase 4: Scroll Control Intelligence
- Confidence-based state machine
- Smooth scrolling
- Pause on uncertainty

**Rationale:** Polish user experience after core functionality works.

### Phase 5: Optimizations (if needed)
- Sliding window matching
- Web Workers for performance
- Semantic matching with Transformers.js

**Rationale:** Only add complexity if performance or matching quality issues appear.

## Technology Decisions

### Required Technologies
- **React**: Component-based UI (standard for web apps)
- **TypeScript**: Type safety for complex state and events
- **Web Speech API**: Free, browser-native speech recognition
- **fastest-levenshtein**: Fastest JS Levenshtein implementation (fuzzy matching)

### Recommended Technologies
- **Zustand**: Lightweight state management (simpler than Redux for this size)
- **Vite**: Fast build tool with React support
- **Tailwind CSS or Bulma**: For rapid UI development

### Optional/Advanced Technologies
- **Transformers.js**: Semantic text matching (25MB+ model size)
- **Web Workers**: Offload text matching from main thread
- **AudioWorklet**: Lower-latency audio processing
- **Vosk or Whisper.wasm**: Offline speech recognition alternative

## Sources

**Speech Recognition Architecture:**
- [Using the Web Speech API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API) - HIGH confidence (official spec)
- [Web Speech API Specification](https://webaudio.github.io/web-speech-api/) - HIGH confidence (official spec)
- [Voice-Activated Teleprompter GitHub](https://github.com/jlecomte/voice-activated-teleprompter) - MEDIUM confidence (real implementation example)
- [Top APIs and models for real-time speech recognition 2026](https://www.assemblyai.com/blog/best-api-models-for-real-time-speech-recognition-and-transcription) - MEDIUM confidence (ecosystem survey)

**Text Matching:**
- [fastest-levenshtein npm](https://www.npmjs.com/package/fastest-levenshtein) - HIGH confidence (official package)
- [Fuzzy Matching 101: A Complete Guide for 2026](https://matchdatapro.com/fuzzy-matching-101-a-complete-guide-for-2026/) - MEDIUM confidence (technique overview)
- [SemanticFinder - Transformers.js semantic search](https://github.com/do-me/SemanticFinder) - HIGH confidence (working implementation)
- [In-Browser Semantic AI Search with PGlite and Transformers.js](https://supabase.com/blog/in-browser-semantic-search-pglite) - MEDIUM confidence (implementation guide)

**Audio Processing:**
- [Background audio processing using AudioWorklet - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet) - HIGH confidence (official docs)
- [Real-Time Speech-to-Text on Edge](https://www.mdpi.com/2078-2489/16/8/685) - MEDIUM confidence (architecture research)

**State Management:**
- [State Management in 2026: Redux, Context API, and Modern Patterns](https://www.nucamp.co/blog/state-management-in-2026-redux-context-api-and-modern-patterns) - MEDIUM confidence (ecosystem survey)
- [18 Best React State Management Libraries in 2026](https://fe-tool.com/awesome-react-state-management) - LOW confidence (list compilation)

**Scroll Control:**
- [Voice Scroll: Teleprompter.com's New Auto-Scrolling Feature](https://www.teleprompter.com/blog/voice-scroll-teleprompter-app-new-feature) - LOW confidence (marketing content, but describes smooth scrolling algorithms)

---
*Architecture research for: AI voice-controlled teleprompter*
*Researched: 2026-01-22*
