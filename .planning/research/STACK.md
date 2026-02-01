# Stack Research — Vosk Offline Speech Recognition

**Domain:** AI voice-controlled teleprompter — Vosk integration (v1.2 milestone)
**Researched:** 2026-02-01
**Confidence:** MEDIUM

**IMPORTANT:** This is INCREMENTAL stack research for v1.2 Vosk integration. See original STACK.md (researched 2026-01-22) for validated v1.0 stack (Web Speech API, Fuse.js, Vanilla JS, etc.). This document covers ONLY additions/changes for Vosk.

## Executive Summary

**Goal:** Replace Web Speech API with Vosk to eliminate Android beep and enable offline operation.

**Key Finding:** vosk-browser package exists but is unmaintained (v0.0.8, last updated 3 years ago). However, it's the only production-ready browser Vosk integration. Alternative (Vosklet) is newer but not available on npm.

**Critical Warning:** vosk-browser still uses deprecated ScriptProcessorNode. AudioWorklet migration incomplete with Safari compatibility issues.

**Recommendation:** Use vosk-browser v0.0.8 despite maintenance concerns. It works, has 50MB models, and provides the offline capability needed. Plan migration path to Vosklet or custom WebAssembly integration if vosk-browser becomes blocking issue.

---

## Stack Additions for Vosk Integration

### Core Dependencies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **vosk-browser** | 0.0.8 | WebAssembly Vosk runtime | Only mature browser Vosk package. Unmaintained (3 years stale) but functional. Bundles Vosk WASM build, provides event-driven API. 3 projects use it on npm. |
| **HTTPS server** | (existing) | Required for SharedArrayBuffer | Vosk uses SharedArrayBuffer for WebAssembly threads. Requires HTTPS + COOP/COEP headers. Already needed for microphone access. |

**Confidence: MEDIUM** — vosk-browser verified via npm/GitHub but unmaintained status lowers confidence.

### Supporting Infrastructure

| Component | Requirement | Purpose | Implementation |
|-----------|-------------|---------|----------------|
| **IndexedDB** | Browser native | Cache 40MB model file | Use browser IndexedDB API to store vosk-model-small-en-us-0.15 after first download. Prevents re-downloading on page refresh. |
| **Model hosting** | CDN or static server | Serve .tar.gz model files | Options: (1) Bundle in /public, (2) alphacephei.com CDN, (3) ccoreilly.github.io demo CDN. Recommend: bundle for reliability. |
| **COOP/COEP headers** | HTTPS only | Enable SharedArrayBuffer | Set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for WebAssembly threads. Required by Chrome 92+ for SharedArrayBuffer. |

**Confidence: HIGH** — Browser APIs and security headers verified via MDN (Jan 2026 docs).

### Optional/Alternative Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| **Vosklet** | 1.2.1 (GitHub only) | Modern Vosk browser library | If vosk-browser blocks progress. Vosklet uses WASM workers instead of Pthreads, modern API. Not on npm — must bundle from GitHub. | LOW |
| **audioworklet-polyfill** | latest | Polyfill for AudioWorklet | NOT NEEDED — vosk-browser uses ScriptProcessor. If migrating to AudioWorklet later, use polyfill for older browsers. | MEDIUM |

**Confidence: LOW for Vosklet** — Found via WebSearch only, not in npm registry, limited production usage.

---

## Installation

### Add vosk-browser

```bash
# Core Vosk dependency
npm install vosk-browser

# No additional runtime dependencies needed
# vosk-browser bundles all WebAssembly/worker code
```

### Model File Setup

**Model:** vosk-model-small-en-us-0.15
**Size:** 39-41 MB (compressed .tar.gz)
**Source:** https://alphacephei.com/vosk/models

**Option 1: Bundle locally (recommended)**

```bash
# Download model
mkdir public/models
cd public/models
curl -LO https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.tar.gz

# Model will be served from /models/vosk-model-small-en-us-0.15.tar.gz
```

**Option 2: Use CDN (faster initial setup)**

```javascript
// Load from ccoreilly demo CDN
const modelUrl = 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz';
```

**Recommendation:** Bundle locally. CDN dependency creates availability risk. Model only downloads once (cached in IndexedDB).

### Configure Server Headers (CRITICAL)

Vosk requires SharedArrayBuffer, which requires cross-origin isolation headers.

**For development (server.js):**

```javascript
// Add to existing server.js
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});
```

**For production (Netlify, Vercel, etc.):**

```toml
# netlify.toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
```

**Confidence: HIGH** — Verified via MDN, Chrome DevRel, caniuse.com.

---

## Architecture Integration

### VoskRecognizer Class (Drop-in Replacement)

vosk-browser provides event-driven API similar to Web Speech API:

```javascript
// Existing Web Speech API pattern:
const recognition = new webkitSpeechRecognition();
recognition.onresult = (event) => { /* handle */ };
recognition.start();

// Vosk equivalent (conceptual - actual API differs):
const model = await Vosk.createModel('/models/vosk-model-small-en-us-0.15.tar.gz');
const recognizer = new model.KaldiRecognizer(sampleRate);
recognizer.on('result', (message) => { /* handle */ });
// Feed audio via AudioContext/ScriptProcessor
```

**Key Difference:** Vosk requires manual audio routing (AudioContext → ScriptProcessor → Vosk), whereas Web Speech API handles audio capture internally.

### Audio Processing Pipeline

```
Microphone
  → navigator.mediaDevices.getUserMedia()
  → AudioContext
  → ScriptProcessorNode (4096 buffer)
  → Vosk recognizer.acceptWaveform()
  → Event: 'result' / 'partial-result'
  → Your app
```

**Critical Issue:** ScriptProcessorNode is deprecated (since 2014). AudioWorklet is replacement but vosk-browser doesn't support it yet (open issues #8, #9 on GitHub).

**Mitigation:** ScriptProcessorNode still works in all browsers (2026). Plan migration to AudioWorklet when vosk-browser updates or fork to Vosklet.

**Confidence: MEDIUM** — Based on GitHub issues and WebSearch findings. ScriptProcessor deprecation verified via MDN but no removal timeline.

### IndexedDB Caching Pattern

```javascript
// First load: download model, cache in IndexedDB
async function loadModel(url) {
  const cached = await getModelFromIndexedDB();
  if (cached) return cached;

  const response = await fetch(url);
  const blob = await response.blob();
  await saveModelToIndexedDB(blob);

  return blob;
}

// Use with Vosk
const modelBlob = await loadModel('/models/vosk-model-small-en-us-0.15.tar.gz');
const model = await Vosk.createModel(modelBlob);
```

**Why:** 40MB download is acceptable once. Subsequent page loads should be instant.

**Confidence: HIGH** — IndexedDB API verified via MDN.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative | Confidence |
|-------------|-------------|-------------------------|------------|
| **vosk-browser 0.0.8** | Vosklet 1.2.1 | If vosk-browser breaks or ScriptProcessor removed from browsers. Vosklet uses modern WASM workers, active development. Must integrate from GitHub (not npm). | LOW |
| **vosk-browser** | Custom Vosk WASM build | If need full control over Vosk features. Requires C++ build toolchain, Emscripten, deep Vosk knowledge. Not recommended for this project scope. | LOW |
| **Vosk** | Whisper (transformers.js) | Already evaluated in original STACK.md. Whisper has better accuracy but 200-500ms latency vs Vosk's real-time performance. Vosk chosen for teleprompter use case (latency-sensitive). | HIGH |
| **Offline recognition** | Keep Web Speech API | Web Speech API doesn't work offline and triggers Android beep. That's why we're adding Vosk. Web Speech API remains as fallback for browsers without WASM support. | HIGH |

---

## What NOT to Use

| Avoid | Why | Use Instead | Confidence |
|-------|-----|-------------|------------|
| **AudioWorklet with vosk-browser** | Not implemented yet. GitHub issues #8, #9 show incomplete AudioWorklet support with Safari bugs. | ScriptProcessorNode (deprecated but works). Plan migration when AudioWorklet support stabilizes. | HIGH |
| **Vosk server (Python)** | Adds backend dependency, violates "no backend" constraint. Also adds latency (WebSocket roundtrip). | vosk-browser (client-side WASM) | HIGH |
| **Large Vosk models** | vosk-model-en-us-0.22 is 1.8GB. Too large for browser download. | vosk-model-small-en-us-0.15 (40MB). Adequate accuracy for teleprompter use case. | HIGH |
| **Unbundled model loading** | Loading model from arbitrary URLs fails CORS/COEP checks. | Bundle in /public or use same-origin server. | MEDIUM |
| **COEP: credentialless** | Newer alternative to COEP: require-corp but not universally supported (Chrome 96+, Firefox/Safari partial). | COEP: require-corp (works everywhere) | MEDIUM |

---

## Browser Compatibility

### SharedArrayBuffer Requirements (Critical for Vosk)

| Browser | SharedArrayBuffer Support | COOP/COEP Required | Notes |
|---------|--------------------------|-------------------|-------|
| Chrome | ✅ 92+ | ✅ | Must set COOP: same-origin, COEP: require-corp |
| Edge | ✅ 92+ | ✅ | Chromium-based, same as Chrome |
| Safari | ✅ 15.2+ | ✅ | Partial support, may have threading issues |
| Firefox | ✅ 79+ | ✅ | Full support with headers |

**Coverage:** 95%+ of modern browsers (as of 2026).

**Confidence: HIGH** — Verified via caniuse.com, MDN compatibility tables.

### WebAssembly Support

| Feature | Chrome | Edge | Safari | Firefox | Coverage |
|---------|--------|------|--------|---------|----------|
| WASM 1.0 | ✅ 57+ | ✅ 16+ | ✅ 11+ | ✅ 52+ | 99% |
| Threads (required for Vosk) | ✅ 74+ | ✅ 79+ | ✅ 14.1+ | ✅ 79+ | 95%+ |
| SIMD (optional optimization) | ✅ 91+ | ✅ 91+ | ✅ 16.4+ | ✅ 89+ | 93% |

**Key Takeaway:** Vosk will work on all modern browsers (2020+). Older browsers fall back to Web Speech API.

**Confidence: HIGH** — Verified via WebAssembly.org feature status, caniuse.com.

---

## Performance Expectations

### Model Loading Time

- **First load (40MB download):** 2-10 seconds (depends on connection)
- **Cached load (IndexedDB):** <1 second
- **WASM initialization:** 500ms-2s (depends on device)

**Recommendation:** Show loading progress UI during first load. Model download is one-time cost.

### Recognition Latency

- **Partial results:** 200-500ms (real-time, similar to Web Speech API)
- **Final results:** After utterance complete + silence detection
- **CPU usage:** Moderate (10-20% on modern devices)

**Comparison to Web Speech API:**
- Web Speech API: <100ms interim results (server-side processing)
- Vosk: 200-500ms partial results (client-side processing)
- **Trade-off:** Vosk is 2-5x slower but works offline and no Android beep

**Confidence: MEDIUM** — Based on WebSearch findings and Vosk documentation. Actual performance depends on device.

### Memory Usage

- **Model in memory:** ~150MB (uncompressed)
- **WASM runtime:** ~50MB
- **Audio buffers:** ~10MB

**Total:** ~210MB additional RAM usage when Vosk active.

**Mobile Impact:** May cause issues on low-end Android devices (<2GB RAM). Test on target devices.

**Confidence: LOW** — Based on typical WASM model sizes. Actual usage may vary.

---

## Implementation Phases

### Phase 1: Basic Integration

**Goal:** Vosk recognizer works alongside Web Speech API.

**Stack additions:**
- `npm install vosk-browser`
- Model file bundled in /public
- COOP/COEP headers configured
- VoskRecognizer class wraps vosk-browser API

**Success criteria:**
- Vosk recognizes speech from microphone
- Results logged to console
- Model cached in IndexedDB

### Phase 2: Engine Selection

**Goal:** User can toggle between Vosk and Web Speech API.

**Stack additions:**
- UI toggle for recognition engine
- localStorage for preference persistence
- Unified SpeechRecognizer interface (abstracts Vosk vs Web Speech API)

**Success criteria:**
- Both engines work with same downstream code (WordMatcher, PositionTracker, etc.)
- Switching engines doesn't break functionality

### Phase 3: Production Polish

**Goal:** Production-ready Vosk integration.

**Stack additions:**
- Model download progress UI
- Error handling for WASM failures
- Fallback to Web Speech API on Vosk errors
- Performance monitoring

**Success criteria:**
- 40MB model download shows progress bar
- Graceful degradation on unsupported browsers
- No Android beep on Chrome/Edge

---

## Security & Privacy Considerations

### HTTPS Required

- **Microphone access:** Already requires HTTPS
- **SharedArrayBuffer:** Requires HTTPS + COOP/COEP headers
- **Service Workers (for offline):** Requires HTTPS

**Recommendation:** Development via localhost (allowed) or HTTPS dev server. Production must be HTTPS.

### Data Privacy

**Web Speech API:**
- Sends audio to Google servers (Chrome/Edge)
- Privacy concern for sensitive scripts

**Vosk:**
- 100% client-side processing
- No audio leaves device
- Better privacy for confidential content

**Trade-off:** Privacy vs recognition speed. Vosk wins on privacy.

---

## Migration Path

### From Web Speech API to Vosk

**Minimal code changes required:**

1. **SpeechRecognizer interface (existing):**
   - `start()`, `stop()`, `addEventListener('result', handler)`
   - Both Vosk and Web Speech API implement this

2. **VoskRecognizer class (new):**
   - Wraps vosk-browser API
   - Implements SpeechRecognizer interface
   - Handles AudioContext/ScriptProcessor setup

3. **Downstream code (unchanged):**
   - WordMatcher, PositionTracker, ScrollController
   - No changes needed — same result format

**Confidence: HIGH** — Pattern verified in existing codebase.

### Rollback Plan

If Vosk integration fails:

1. Keep Web Speech API as fallback (already implemented)
2. Vosk toggle defaults to OFF, user opts in
3. Feature flag: `ENABLE_VOSK=false` disables Vosk code path

**No risk to existing functionality.**

---

## Open Questions & Risks

### Risk: vosk-browser Unmaintained

**Issue:** Last update 3 years ago. May have security vulnerabilities or incompatibilities with future browsers.

**Mitigation:**
- Monitor GitHub issues for browser breakage
- Plan migration to Vosklet if vosk-browser fails
- Keep Web Speech API as permanent fallback

**Likelihood:** LOW (ScriptProcessor still works, WASM stable)
**Impact:** HIGH (offline mode breaks)
**Overall Risk:** MEDIUM

### Risk: ScriptProcessorNode Removal

**Issue:** Deprecated since 2014. Could be removed from browsers.

**Mitigation:**
- AudioWorklet is replacement (supported since Chrome 66, Safari 14.1, Firefox 76)
- Polyfill exists (audioworklet-polyfill)
- Vosklet uses modern WASM workers (no ScriptProcessor)

**Likelihood:** LOW (no removal timeline announced)
**Impact:** HIGH (Vosk stops working)
**Overall Risk:** MEDIUM

### Risk: 40MB Model Download on Mobile

**Issue:** Users on slow connections may abandon during model download.

**Mitigation:**
- Show clear progress UI
- Allow cancellation → fall back to Web Speech API
- Consider smaller model (vosk-model-small-en-us-0.15 is smallest English model)

**Likelihood:** MEDIUM
**Impact:** MEDIUM
**Overall Risk:** MEDIUM

### Risk: COOP/COEP Headers Break Embedded Usage

**Issue:** COOP/COEP prevent embedding in iframes without same headers.

**Mitigation:**
- Document requirement in deployment guide
- Provide header examples for common hosts (Netlify, Vercel, GitHub Pages)
- Note: GitHub Pages doesn't support custom headers → can't use Vosk there

**Likelihood:** HIGH (if deploying to GitHub Pages)
**Impact:** HIGH (SharedArrayBuffer disabled)
**Overall Risk:** HIGH for GitHub Pages deployment

---

## Deployment Considerations

### Hosting Platform Requirements

| Platform | COOP/COEP Support | Notes |
|----------|------------------|-------|
| **Netlify** | ✅ Yes | Set in netlify.toml `[[headers]]` |
| **Vercel** | ✅ Yes | Set in vercel.json `headers` |
| **GitHub Pages** | ❌ No | Cannot set custom headers. **Vosk won't work.** |
| **Cloudflare Pages** | ✅ Yes | Set in _headers file |
| **Self-hosted** | ✅ Yes | Configure in nginx/Apache/Node server |

**Recommendation:** Use Netlify or Vercel for Vosk deployment. Avoid GitHub Pages.

**Confidence: HIGH** — Verified via platform documentation.

---

## Stack Patterns by Variant

### Variant 1: Vosk Primary (Recommended for v1.2)

**Stack:**
- vosk-browser 0.0.8
- Model bundled in /public (40MB)
- COOP/COEP headers configured
- IndexedDB caching
- Web Speech API fallback (if Vosk fails)

**When:** Targeting Chrome/Edge users on Android (eliminate beep), offline use case.

### Variant 2: Web Speech API Primary (Fallback)

**Stack:**
- Existing Web Speech API integration
- Vosk available via opt-in toggle
- Model loaded on demand (not bundled)

**When:** Users on fast connections, don't care about offline mode or Android beep.

### Variant 3: Dual-Engine (Future)

**Stack:**
- Both engines active simultaneously
- Cross-validate results for accuracy
- Use consensus for higher confidence

**When:** Post-v1.2. Experimental accuracy improvement.

---

## Testing Requirements

### Manual Testing

- [ ] Model downloads and caches successfully
- [ ] Recognition works in Chrome (desktop + Android)
- [ ] Recognition works in Edge
- [ ] Recognition works in Safari (desktop + iOS)
- [ ] Recognition works in Firefox
- [ ] ScriptProcessor warning appears in console (expected)
- [ ] COOP/COEP headers present in production
- [ ] IndexedDB caches model (check DevTools → Application → IndexedDB)
- [ ] Page refresh loads cached model (no re-download)

### Automated Testing

- [ ] VoskRecognizer implements SpeechRecognizer interface
- [ ] Model loading shows progress events
- [ ] Fallback to Web Speech API on Vosk failure
- [ ] Audio pipeline routes to Vosk correctly

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| **vosk-browser 0.0.8** | Chrome 74+, Edge 79+, Safari 15.2+, Firefox 79+ | Requires SharedArrayBuffer (COOP/COEP headers). WASM threads support. |
| **IndexedDB** | All modern browsers | No version conflicts. Browser native API. |
| **ScriptProcessorNode** | All browsers (deprecated but functional) | Deprecated since 2014, no removal date. Expect console warning. |
| **SharedArrayBuffer** | Chrome 92+, Edge 92+, Safari 15.2+, Firefox 79+ (with headers) | Earlier versions require origin trial or flags. |

---

## Sources

### Official Documentation (HIGH confidence)

- [vosk-browser npm package](https://www.npmjs.com/package/vosk-browser) — Package version, description
- [Vosk Models - alphacephei.com](https://alphacephei.com/vosk/models) — Model sizes, download links
- [SharedArrayBuffer - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) — Security requirements (last updated Jan 2026)
- [Cross-Origin-Opener-Policy - MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy) — COOP header spec
- [Cross-Origin-Embedder-Policy - MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy) — COEP header spec
- [IndexedDB API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) — Caching large files (last updated Jan 2026)
- [WebAssembly browser support - caniuse.com](https://caniuse.com/wasm) — 99% coverage, verified Feb 2026

### GitHub Issues & Community (MEDIUM confidence)

- [vosk-browser Issue #8: AudioWorklet support](https://github.com/ccoreilly/vosk-browser/issues/8) — AudioWorklet implementation status
- [vosk-browser Issue #9: ScriptProcessor deprecation](https://github.com/ccoreilly/vosk-browser/issues/9) — ScriptProcessor warning
- [Vosklet GitHub](https://github.com/msqr1/Vosklet) — Alternative library, v1.2.1
- [vosk-browser demo](https://ccoreilly.github.io/vosk-browser/) — Live demo, 13 languages

### WebSearch Findings (LOW to MEDIUM confidence)

- **vosk-browser unmaintained:** WebSearch confirms last update 3 years ago (npm shows last publish date)
- **Model size:** 39-41 MB for vosk-model-small-en-us-0.15 (multiple sources agree: HuggingFace, SunFounder docs)
- **Vosklet vs vosk-browser:** Vosklet uses WASM workers instead of Pthreads (GitHub readme)
- **COOP/COEP requirement:** Required for SharedArrayBuffer since Chrome 92, Edge 92 (Chrome DevRel blog, MDN)

### Cross-Verified Findings (HIGH confidence)

- ✅ vosk-browser v0.0.8 is latest version (npm + GitHub releases agree)
- ✅ vosk-model-small-en-us-0.15 is ~40MB (multiple sources)
- ✅ SharedArrayBuffer requires HTTPS + COOP/COEP (MDN, caniuse.com, Chrome blog)
- ✅ ScriptProcessorNode deprecated but functional (MDN, GitHub issues)
- ✅ AudioWorklet is replacement for ScriptProcessor (MDN, Chrome blog)
- ✅ WebAssembly has 99% browser support (caniuse.com, webassembly.org)

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|-----------|--------|
| **vosk-browser package** | MEDIUM | Package exists on npm, functional, but unmaintained (3 years stale). |
| **Model hosting** | HIGH | Models available from alphacephei.com, confirmed sizes, .tar.gz format. |
| **Browser APIs** | HIGH | SharedArrayBuffer, IndexedDB, WASM all verified via MDN (Jan 2026 docs). |
| **COOP/COEP headers** | HIGH | Required for SharedArrayBuffer, verified via MDN and Chrome DevRel. |
| **Performance** | MEDIUM | Latency/memory estimates from WebSearch, not directly tested. |
| **ScriptProcessor risk** | MEDIUM | Deprecated but no removal timeline. AudioWorklet exists but vosk-browser doesn't support it. |
| **Deployment platforms** | HIGH | Netlify/Vercel header support verified via docs. GitHub Pages limitation known. |

**Overall Confidence: MEDIUM** — Core technologies verified (WASM, SharedArrayBuffer, IndexedDB), but vosk-browser maintenance status and performance estimates lower confidence.

---

## Summary for Roadmap

**Stack additions for Vosk integration:**

1. **vosk-browser 0.0.8** (npm) — Unmaintained but functional
2. **Model file:** vosk-model-small-en-us-0.15 (40MB, bundle or CDN)
3. **IndexedDB caching** — Browser native API
4. **COOP/COEP headers** — Required for SharedArrayBuffer
5. **HTTPS server** — Already required, headers added

**No new build tools or frameworks needed.** Vanilla JS integration via vosk-browser API.

**Critical dependencies:**
- HTTPS + COOP/COEP headers (breaks on GitHub Pages)
- ScriptProcessorNode (deprecated, works but prints warning)
- 40MB model download (one-time, cached)

**Risks:**
- vosk-browser unmaintained (3 years stale)
- ScriptProcessorNode could be removed (migrate to AudioWorklet or Vosklet)
- 40MB download may deter mobile users (show progress UI)

**Recommendation:** Proceed with vosk-browser. Keep Web Speech API as fallback. Plan migration to Vosklet if vosk-browser becomes blocking.

---

*Stack research for: AI voice-controlled teleprompter — Vosk offline recognition (v1.2 milestone)*
*Researched: 2026-02-01*
*Focus: Incremental additions to validated v1.0 stack*
*See: `.planning/research/STACK.md` (2026-01-22) for original research*
