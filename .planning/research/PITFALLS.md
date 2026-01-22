# Pitfalls Research

**Domain:** Voice-controlled teleprompter with real-time speech matching
**Researched:** 2026-01-22
**Confidence:** MEDIUM to HIGH (verified with official docs and 2026 sources)

## Critical Pitfalls

### Pitfall 1: Web Speech API Stops Unexpectedly

**What goes wrong:**
Even with `continuous = true`, the Web Speech API frequently stops listening without warning. The recognition engine halts after detecting a pause or "speech end," requiring manual restart. Users speak continuously but the teleprompter stops tracking midway through their script.

**Why it happens:**
The `speechend` event fires prematurely based on pause detection algorithms that don't match natural speaking rhythms. The browser's speech engine makes assumptions about when the user finished speaking that don't align with teleprompter use cases where continuous speech is expected.

**How to avoid:**
Implement automatic restart on `speechend` and `end` events. Build a state machine that tracks whether the user intentionally stopped (via UI action) vs. engine timeout.

```javascript
recognition.onspeechend = () => {
  // DON'T just stop - check if user still needs tracking
  if (isUserStillSpeaking) {
    recognition.start(); // Restart immediately
  }
};

recognition.onend = () => {
  // Engine stopped - restart unless user paused
  if (!userPaused) {
    setTimeout(() => recognition.start(), 100);
  }
};
```

**Warning signs:**
- Transcription stops appearing in console/UI
- No errors thrown, just silence
- Works for short phrases but fails on longer speeches
- Inconsistent behavior between test runs

**Phase to address:**
Phase 1 (Core speech tracking) - This is foundational. Without reliable continuous recognition, the entire product fails.

---

### Pitfall 2: Interim Results Create False Matches

**What goes wrong:**
With `interimResults = true`, the matching algorithm sees constantly changing transcription fragments. It matches against "I think we should..." then immediately sees "I think we should probably..." then "I think we should probably consider..." Each interim result triggers a new match attempt, causing the teleprompter to jump around erratically or thrash between positions.

**Why it happens:**
Developers enable interim results to get "responsive" UI, but interim results are unstable "best guesses" that change dramatically before final results. The speech engine rebuilds all interim results on each result event, so text that seemed confirmed suddenly changes.

**How to avoid:**
Use `interimResults = false` for position matching. Only match against final results. If you need visual feedback for responsiveness, show interim results in a separate "listening..." indicator but don't use them for scroll position decisions.

```javascript
// BAD - uses interim results for matching
recognition.interimResults = true;
recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  matchAndScroll(transcript); // Matches constantly changing text
};

// GOOD - only matches final results
recognition.interimResults = false; // or keep true but check isFinal
recognition.onresult = (event) => {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    if (event.results[i].isFinal) {
      matchAndScroll(event.results[i][0].transcript);
    }
  }
};
```

**Warning signs:**
- Teleprompter scrolls jerkily or jumps back and forth
- High CPU usage from constant re-matching
- Scroll position never settles
- Different behavior when speaking slowly vs. quickly

**Phase to address:**
Phase 1 (Core speech tracking) - Critical for basic usability. Interim result handling must be correct from the start.

---

### Pitfall 3: Semantic Matching Without Validation

**What goes wrong:**
Relying solely on LLM-based or semantic matching for paraphrase detection causes false positives. The system confidently matches "let's talk about revenue" to a script section about "discuss our earnings" even when the speaker is in a completely different part of the script. The teleprompter jumps to the wrong section, disorienting the speaker.

**Why it happens:**
Semantic similarity algorithms find matches based on meaning, not position in document. Multiple sections of a script may have semantically similar content. Without positional context or validation, the matcher picks the first/best semantic match regardless of where the speaker actually is.

**How to avoid:**
Combine semantic matching with positional context and confidence scoring:

1. **Positional bias**: Weight matches near current position higher than distant matches
2. **Sequence validation**: Require multiple consecutive matches before jumping positions
3. **Confidence thresholds**: Reject low-confidence semantic matches, fall back to exact matching
4. **Direction constraints**: Prevent backward jumps unless user explicitly rewinds

```javascript
function findMatch(transcript, currentPosition) {
  const candidates = semanticMatch(transcript);

  // Filter by proximity to current position
  const nearby = candidates.filter(c =>
    Math.abs(c.position - currentPosition) < PROXIMITY_THRESHOLD
  );

  if (nearby.length > 0) {
    return nearby[0]; // Prefer nearby matches
  }

  // Only accept distant matches if high confidence
  const highConfidence = candidates.filter(c => c.score > 0.9);
  if (highConfidence.length > 0) {
    return highConfidence[0];
  }

  return null; // No confident match - stay put
}
```

**Warning signs:**
- Teleprompter frequently jumps to wrong sections
- Speaker reports "it's not following me"
- Works well for unique text, fails on repetitive content
- Testing on varied scripts shows inconsistent behavior

**Phase to address:**
Phase 2 (Smart matching) - After basic exact matching works, add semantic matching with proper validation. Don't attempt this in Phase 1.

---

### Pitfall 4: Latency Accumulation from Multiple Processing Steps

**What goes wrong:**
The system becomes sluggish and unresponsive. By the time the teleprompter scrolls, the speaker has already moved on to the next section. The delay is noticeable: speech → transcription (300ms) → semantic matching (200ms) → confidence scoring (100ms) → scroll animation (200ms) = 800ms total latency. This breaks the "follows you naturally" value proposition.

**Why it happens:**
Each processing step adds latency. Semantic matching via embeddings or LLM calls is computationally expensive. Running on every transcription result without optimization causes blocking operations that delay scroll updates.

**How to avoid:**
Optimize the critical path ruthlessly:

1. **Use exact string matching first** - Fast O(n) substring search before expensive semantic matching
2. **Debounce semantic matching** - Only run on final results, not interim
3. **Precompute embeddings** - Generate script embeddings once at load, not per-match
4. **Async processing** - Run matching in Web Worker to avoid blocking UI
5. **Smooth scroll with CSS** - Use `scroll-behavior: smooth` instead of JS animation
6. **Progressive enhancement** - Start with fast exact matching, add semantic layer only if needed

```javascript
// BAD - synchronous blocking operations
recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  const embedding = await generateEmbedding(transcript); // 200ms BLOCK
  const match = await semanticSearch(embedding); // 100ms BLOCK
  scrollTo(match.position); // Another 200ms
};

// GOOD - fast path for exact matches
recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;

  // Fast exact match (1-5ms)
  const exactMatch = scriptText.indexOf(transcript);
  if (exactMatch !== -1) {
    scrollTo(exactMatch); // Immediate feedback
    return;
  }

  // Fallback to semantic (only if exact fails)
  worker.postMessage({ type: 'semanticMatch', transcript });
};
```

**Warning signs:**
- Noticeable delay between speaking and scrolling
- CPU spikes during transcription
- Browser becomes unresponsive
- Performance degrades over time (memory leaks)
- Different performance on fast vs. slow devices

**Phase to address:**
Phase 1 (Core speech tracking) - Latency requirements must be defined early. Measure and optimize from the start, not as an afterthought.

---

### Pitfall 5: No Error Recovery Strategy

**What goes wrong:**
When speech recognition fails (network error, permission denied, language pack missing), the app becomes completely unusable with no way to recover except refreshing the page. Users lose their place in the script and any session state.

**Why it happens:**
Developers focus on the happy path and don't implement comprehensive error handling. Web Speech API errors are inconsistent across browsers, making them hard to test. The `error` event fires but the app doesn't know how to recover.

**How to avoid:**
Implement graceful degradation and recovery for every error type:

```javascript
recognition.onerror = (event) => {
  console.error('Speech recognition error:', event.error);

  switch(event.error) {
    case 'network':
      // Try to restart with exponential backoff
      retryWithBackoff();
      showNotification('Connection lost. Retrying...');
      break;

    case 'not-allowed':
      // Permission denied - show manual controls
      showManualScrollMode();
      showNotification('Microphone access required. Enable in settings or use manual mode.');
      break;

    case 'no-speech':
      // Timeout - restart automatically
      recognition.start();
      break;

    case 'aborted':
      // User or browser stopped it - check if intentional
      if (!userInitiatedStop) {
        recognition.start();
      }
      break;

    case 'audio-capture':
      // Microphone hardware issue
      showNotification('Microphone not found. Check hardware or use manual mode.');
      showManualScrollMode();
      break;

    case 'language-not-supported':
      // Missing language pack for on-device
      showNotification('Language pack downloading...');
      installLanguagePack().then(() => recognition.start());
      break;

    default:
      // Unknown error - fall back to manual
      showManualScrollMode();
      showNotification('Voice control unavailable. Using manual mode.');
  }
};
```

**Warning signs:**
- App breaks on permission denial
- No feedback when mic isn't working
- Errors logged to console but user sees nothing
- No way to switch to manual scrolling
- Testing only done on developer's machine (permissions already granted)

**Phase to address:**
Phase 1 (Core speech tracking) - Error handling is not optional. Must be implemented alongside the happy path.

---

### Pitfall 6: Microphone Permission UX Disaster

**What goes wrong:**
Users are immediately confronted with a browser permission dialog on page load before understanding what the app does or why it needs mic access. Many users deny permission reflexively. The app then shows an error or broken UI with no clear path forward.

**Why it happens:**
Calling `recognition.start()` immediately on page load triggers the permission prompt. Browsers show scary permission dialogs with no context from the app. Users trained to deny permissions for privacy reasons reject the request.

**How to avoid:**
Progressive permission request with clear explanation:

1. **Show onboarding first** - Explain what the app does before requesting permissions
2. **Explicit user action** - Only request permission when user clicks "Start Voice Control"
3. **Explain the ask** - Show custom UI explaining why mic access is needed
4. **Provide alternatives** - Offer manual scroll mode for users who deny permission
5. **Handle denial gracefully** - Don't break, just disable voice features

```javascript
// BAD - immediate permission request
window.addEventListener('load', () => {
  recognition.start(); // Permission dialog appears immediately
});

// GOOD - user-initiated with context
startVoiceButton.addEventListener('click', async () => {
  // Show explanation modal first
  const userConsents = await showPermissionExplanation();
  if (!userConsents) return;

  try {
    recognition.start(); // User understands why
  } catch (e) {
    if (e.name === 'NotAllowedError') {
      showPermissionDeniedHelp(); // Guide user to settings
    }
  }
});
```

**Warning signs:**
- High permission denial rate in analytics
- Users complaining app "doesn't work"
- No manual scroll fallback mode
- Permission dialog shown before app loads
- No explanation of why mic is needed

**Phase to address:**
Phase 1 (Core speech tracking) - UX pattern must be correct from MVP. Changing permission flow later is difficult.

---

### Pitfall 7: Testing Only with Clean Audio and Perfect Scripts

**What goes wrong:**
The app works perfectly in the quiet developer's home office with carefully written test scripts. In production, users encounter: background noise (HVAC, traffic, other people), mumbly speech, microphone issues, accents, and scripts with typos/formatting issues. The matching algorithm fails catastrophically in real conditions.

**Why it happens:**
Testing bias toward ideal conditions. Developers use good microphones in quiet rooms speaking clearly from well-formatted scripts. Real users present at conferences, record in bedrooms with poor acoustics, speak while nervous, and import scripts from various sources.

**How to avoid:**
Test systematically with degraded conditions:

1. **Noisy environments**: Coffee shop, construction, office with HVAC
2. **Poor microphones**: Laptop built-in, cheap headsets, phone speakers
3. **Varied speakers**: Different accents, speaking speeds, voice pitches
4. **Real scripts**: Copied from Word (formatting issues), OCR errors, typos
5. **Edge cases**: Pauses, coughing, "um" filler words, repeated words

Build in robustness:
- Normalize both script and transcription (lowercase, trim, remove punctuation)
- Implement fuzzy matching for small variations
- Handle common filler words ("um", "uh", "like")
- Detect and skip non-spoken elements (stage directions, notes)

```javascript
function normalizeForMatching(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

function isFiller(word) {
  return ['um', 'uh', 'like', 'you know'].includes(word.toLowerCase());
}
```

**Warning signs:**
- All testing done in same location
- Same person doing all test speaking
- Test scripts are pristine examples
- No testing with background noise
- Accuracy drops dramatically in demos/real usage

**Phase to address:**
Phase 1 (Core speech tracking) - Test with realistic conditions from the start. Phase 2 (Smart matching) - Add robustness features based on real-world testing.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using interim results for matching | Appears responsive | Jumpy scroll, high CPU, unstable matching | Never - use for visual feedback only |
| Skipping error handling | Faster development | App breaks for users, no recovery path | Never - errors are common with Web Speech API |
| LLM API for every match | Perfect paraphrase handling | Latency, API costs, rate limits | Never - use client-side embeddings or exact match first |
| No manual scroll fallback | Simpler codebase | Unusable when voice fails (10-20% of users) | Never - manual mode is critical |
| Testing only in Chrome | Single browser to test | Breaks in Safari, Firefox, mobile browsers | Only for early prototypes, must test all browsers before launch |
| Synchronous semantic matching | Easier to reason about | Blocks UI thread, sluggish performance | Only for initial prototype, must move to Web Worker |
| Keeping recognition.continuous = false | More predictable | Requires clicking after every phrase | Early prototypes only, must support continuous for real use |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Web Speech API | Assuming it works offline | Check browser, plan for server-based recognition. Consider on-device with `processLocally = true` for privacy |
| Microphone access | Requesting permission on page load | Request on user action with explanation. Provide manual fallback |
| Embedding models (for semantic matching) | Calling API on every transcription | Precompute script embeddings at load. Use local models (transformers.js) or cache API results |
| Browser compatibility | Testing only in Chrome | Web Speech API support varies. Test Chrome, Safari, Firefox, Edge. Implement feature detection |
| Language packs (on-device) | Assuming they're installed | Call `SpeechRecognition.available()` first, handle installation flow |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Matching against entire script each time | Works for short scripts | Use sliding window or index-based search. Limit search scope based on current position | Scripts > 5000 words, matching takes >100ms |
| Keeping all transcription history in memory | Easy to debug early on | Limit buffer to last N results (50-100). Clear old results | Sessions > 30 minutes, memory usage grows unbounded |
| Re-rendering entire script on every update | Simple React state | Use virtualized scrolling (react-window). Only render visible lines | Scripts > 100 lines cause frame drops |
| Regenerating embeddings on script edit | No caching needed for static scripts | Cache embeddings, only regenerate changed sections | User edits script during session |
| Running semantic matching on UI thread | Responsive for first few matches | Use Web Worker for all heavy computation | Noticeable lag after 10-20 matches |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Not using HTTPS | getUserMedia blocked in non-secure contexts | Enforce HTTPS, use localhost for dev |
| Sending audio to unknown servers | Privacy violation, Web Speech API default | Use `processLocally = true` or disclose server usage in privacy policy |
| Storing transcriptions without consent | GDPR/privacy violations | Clear user consent, provide deletion. Consider not storing audio at all |
| No Content Security Policy for mic | Malicious iframes could access mic | Set Permissions-Policy: microphone=(self) header |
| Allowing cross-origin iframe embedding | Third parties could spy via your mic permission | Disallow iframe embedding or restrict to trusted origins |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Hijacking scroll control | User loses ability to review earlier text | Allow manual scroll override. Pause voice tracking when user manually scrolls |
| No visual indicator of listening state | User doesn't know if mic is working | Show clear visual: "Listening...", "Processing...", "Paused" with mic icon animation |
| Scrolling too fast/smooth | User loses their place, gets motion sick | Match scroll speed to speaking pace. Use instant scroll for large jumps, smooth for nearby |
| No confidence feedback | User doesn't know when matching fails | Show match confidence visually: highlight matched text, dim on low confidence |
| Auto-scroll during user interaction | Scrolls away while user is reading/editing | Pause auto-scroll when user focuses on script text or uses keyboard |
| Not showing what was heard | User can't debug why matching failed | Display recent transcriptions in debug panel (can be hidden by default) |
| Requiring perfect pronunciation | Frustrating for users with accents or speech impediments | Use fuzzy matching, allow threshold adjustment, provide manual positioning |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Voice tracking:** Often missing automatic restart on `speechend` — verify continuous operation for 5+ minutes
- [ ] **Semantic matching:** Often missing positional context — verify doesn't jump to wrong similar sections
- [ ] **Error handling:** Often missing all error cases — verify handles: permission denied, no-speech, network, audio-capture, language-not-supported
- [ ] **Manual fallback:** Often missing entirely — verify keyboard/mouse scroll works when voice disabled
- [ ] **Permission flow:** Often missing explanation — verify users see why mic is needed before browser permission prompt
- [ ] **Browser compatibility:** Often missing Safari/Firefox testing — verify in all major browsers, not just Chrome
- [ ] **Noisy environment:** Often missing robustness — verify works with background noise, not just quiet studio
- [ ] **Performance:** Often missing optimization — verify smooth operation on low-end devices, long scripts, extended sessions
- [ ] **Privacy disclosure:** Often missing — verify users know if audio goes to servers (Web Speech API default behavior)
- [ ] **Visual feedback:** Often missing state indicators — verify users can see: listening status, match confidence, transcription output

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Interim results causing jumpy scroll | LOW | Disable `interimResults`, refactor to use only `isFinal` results. 1-2 hours |
| No error handling | MEDIUM | Add comprehensive error handler with fallbacks. 1 day to handle all error types |
| LLM latency breaking UX | MEDIUM | Replace API with client-side model (transformers.js) or exact matching. 2-3 days |
| No manual scroll fallback | MEDIUM | Build manual mode UI, state management for mode switching. 2-3 days |
| Matching against full script is slow | LOW | Implement sliding window search or position-based indexing. 4-8 hours |
| Web Speech API stops unexpectedly | LOW | Add restart logic in `speechend` and `end` handlers. 2-4 hours |
| Permission denied with no path forward | MEDIUM | Add permission explanation modal, manual mode, settings help. 1 day |
| Browser compatibility issues | HIGH | Requires cross-browser testing, polyfills, graceful degradation. 3-5 days |
| Semantic matching false positives | MEDIUM | Add positional bias, confidence thresholds, sequence validation. 2-3 days |
| Memory leaks in long sessions | MEDIUM | Profile with Chrome DevTools, limit buffers, clear old results. 1-2 days |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Web Speech API stops unexpectedly | Phase 1: Core speech tracking | Test continuous operation for 10+ minutes without manual intervention |
| Interim results create false matches | Phase 1: Core speech tracking | Verify scroll position stable with interim results disabled |
| No error recovery | Phase 1: Core speech tracking | Trigger each error type, verify graceful degradation |
| Permission UX disaster | Phase 1: Core speech tracking | Test with fresh browser profile (no permissions), measure acceptance rate |
| Latency accumulation | Phase 1: Core speech tracking | Measure speech-to-scroll latency < 500ms on mid-range device |
| Testing only clean conditions | Phase 1 & 2: All phases | Test matrix: 3 noise levels × 3 mic qualities × 3 speakers × 5 scripts |
| Semantic matching without validation | Phase 2: Smart matching | Test on scripts with repetitive content, verify no false jumps |
| No manual fallback | Phase 1: Core speech tracking | Verify keyboard/mouse scroll works with voice disabled |
| Browser compatibility gaps | Phase 1: Core speech tracking | Test in Chrome, Safari, Firefox, Edge on desktop + mobile |
| Performance with long scripts | Phase 3: Polish/optimization | Test with 10,000 word script, 60 fps scroll, < 200ms match time |

## Sources

**Official Documentation (HIGH confidence):**
- [Using the Web Speech API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)
- [SpeechRecognition API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [SpeechRecognition: interimResults - MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/interimResults)
- [SpeechRecognition: continuous - MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/continuous)
- [getUserMedia() - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)

**2026 Technical Resources (MEDIUM confidence):**
- [Top APIs and models for real-time speech recognition 2026 - AssemblyAI](https://www.assemblyai.com/blog/best-api-models-for-real-time-speech-recognition-and-transcription)
- [Real-Time Speech to Text: Live Transcription Guide - AssemblyAI](https://www.assemblyai.com/blog/real-time-speech-to-text)
- [Top 7 Speech Recognition Challenges & Solutions 2026 - AIMultiple](https://research.aimultiple.com/speech-recognition-challenges/)
- [Understanding Latency in Speech Recognition - Picovoice](https://picovoice.ai/blog/latency-in-speech-recognition/)

**UX Research (MEDIUM confidence):**
- [Scrolljacking 101 - Nielsen Norman Group](https://www.nngroup.com/articles/scrolljacking-101/)
- [Avoid Scrolljacking and Smooth-scroll Effects - Beamtic](https://beamtic.com/scrolljacking-a-ux-problem)
- [The Impact of Smooth Scrolling on Accessibility - The Admin Bar](https://theadminbar.com/accessibility-weekly/watch-out-for-smooth-scroll/)
- [Scrolling Effects in Web Design 2026 - Digital Silk](https://www.digitalsilk.com/digital-trends/scrolling-effects/)

**Fuzzy/Semantic Matching (MEDIUM confidence):**
- [Fuzzy Matching and Semantic Search - iPullRank](https://ipullrank.com/fuzzy-matching-semantic-search)
- [What is Fuzzy Matching? - Redis](https://redis.io/blog/what-is-fuzzy-matching/)
- [Understanding Confidence Scores in ML - Mindee](https://www.mindee.com/blog/how-use-confidence-scores-ml-models)

**Voice Teleprompter Domain (LOW confidence - limited specific research):**
- [Voice activated teleprompter - Scripted.video](https://scripted.video/support/voice-activated-teleprompter-app/)
- [5 Teleprompter Mistakes - Voiceplace](https://voiceplace.com/teleprompter-mistakes-be-aware/)

---
*Pitfalls research for: AI voice-controlled teleprompter*
*Researched: 2026-01-22*
