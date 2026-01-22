# Feature Research

**Domain:** Voice-Controlled Teleprompter (Web Application)
**Researched:** 2026-01-22
**Confidence:** MEDIUM-HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Script Import/Paste | All teleprompters need content input | LOW | Support plain text paste at minimum; optional: file import (.txt, .docx, .pdf) |
| Adjustable Scroll Speed | Manual control is baseline expectation | LOW | Slider or +/- buttons to control speed |
| Text Size Control | Reading distance varies by setup | LOW | Font size adjustment (typically 20-60pt range) |
| Dark Background | Professional broadcast standard | LOW | Dark bg with light text reduces eye strain, looks professional |
| Pause/Resume Control | Users need to stop and restart | LOW | Spacebar or click to pause/resume |
| Script Persistence | Don't lose work between sessions | MEDIUM | Local storage (localStorage/IndexedDB) minimum |
| Visual Scrolling Indicator | Users need to know where they are | LOW | Current line highlight or progress markers |
| Fullscreen Mode | Maximize screen real estate | LOW | Standard browser fullscreen API |
| Text Color Customization | Personal preference varies | LOW | At least 2-3 color options (white, green, yellow) |
| Mirror/Flip Text | Hardware prompter compatibility | LOW | CSS transform for horizontal flip |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Semantic Speech Matching | **Core differentiator**: Handles paraphrasing, not just exact word matching | HIGH | This is the killer feature - distinguishes from basic voice scrolling |
| Intelligent Pause Detection | Knows when you're off-script vs just pausing | HIGH | Confidence-based: high confidence = scroll, low = wait |
| Skip-Ahead Detection | Automatically jumps when user skips sections | HIGH | Semantic matching enables this vs exact word matching |
| Visual Confidence Feedback | Shows user when AI is confident vs uncertain | MEDIUM | Color coding or indicator showing match confidence |
| Zero Configuration | Works immediately without calibration | MEDIUM | Big UX win over PromptSmart's optimization requirements |
| Graceful Degradation | Smooth behavior when recognition uncertain | MEDIUM | Doesn't freeze or jump erratically like free tools |
| Free AI Processing | No API costs passed to users | N/A (constraint) | Competitive advantage vs paid services |
| Real-time Editing While Reading | Edit script without stopping presentation | MEDIUM | Most apps require stopping to edit |
| Script Position Jump Controls | Click/tap to jump to any position | LOW | Quick navigation when reviewing sections |
| Multiple Speech Models | User can choose accuracy vs speed tradeoff | MEDIUM | Different models for different use cases |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Perfect Word-for-Word Tracking | Seems like "better accuracy" | Forces robotic delivery; breaks on any deviation; high cognitive load | Semantic matching with confidence bands - allows natural speech |
| Cloud Script Sync | "I want my scripts everywhere" | Adds auth, backend, costs; against free constraint; privacy concerns | Local storage + export/import; or use browser sync (no backend needed) |
| Video Recording Integration | "All-in-one solution" | Scope creep; browser recording permissions complex; many better dedicated tools exist | Focus on being best prompter; use with OBS/recording software |
| Multi-User Collaboration | "Teams need to share scripts" | Requires backend, auth, real-time sync infrastructure; massive scope increase | Single-user tool; users can copy/paste to share; or use Google Docs then import |
| Professional Hardware Integration | "Connect to HDMI monitors" | Web app can't access HDMI; requires native app or hardware | Use browser's multi-monitor support; users can drag window to external display |
| Offline Speech Recognition | "Should work without internet" | Browser speech APIs require internet; local models too large for web; conflicts with "free AI" | Require internet connection; most users creating content have internet anyway |
| Unlimited Script Length | "I have 2-hour presentations" | Long scripts = poor UX, matching degrades, memory issues | Suggest breaking into segments; warn at ~5000 words |
| Custom Wake Words | "Say 'next' to scroll" | Not a prompter use case; conflicts with reading script that might contain those words | Continuous listening and semantic matching is the right model |

## Feature Dependencies

```
[Script Input] (required first)
    └──enables──> [Speech Matching]
                       ├──enables──> [Auto Scrolling]
                       ├──enables──> [Pause Detection]
                       └──enables──> [Skip Detection]

[Speech Matching]
    └──requires──> [Microphone Permission]

[Visual Confidence Feedback]
    └──enhances──> [Speech Matching] (helps user understand behavior)

[Text Size Control] ──independent──> [Dark Background]
[Pause/Resume Control] ──independent──> [Scroll Speed]

[Export Script] ──conflicts with──> [Cloud Sync] (competing persistence models)
```

### Dependency Notes

- **Speech Matching requires Script Input:** Can't match speech without a reference script loaded
- **Auto Scrolling requires Speech Matching:** The scroll automation is driven by the matching engine
- **Visual Confidence enhances Speech Matching:** Not required but makes the "magic" visible and builds trust
- **Microphone Permission gates everything:** If denied, app falls back to manual scrolling only
- **Export/Cloud Sync conflict:** Choose local-first with export, or cloud sync; hybrid adds complexity

## MVP Definition

### Launch With (v1)

Minimum viable product - what's needed to validate the concept.

- [x] **Script Input (paste text)** - Essential: can't be a prompter without content
- [x] **Basic Display (dark bg, large text, scrolling)** - Essential: core prompter functionality
- [x] **Microphone Access** - Essential: required for voice control
- [x] **Semantic Speech Matching** - Essential: the core differentiator, what makes this special
- [x] **Auto-scroll when confident** - Essential: the value proposition in action
- [x] **Pause when uncertain** - Essential: prevents bad jumps, builds trust
- [x] **Manual scroll controls (spacebar, speed)** - Essential: fallback when voice fails
- [x] **Local storage persistence** - Essential: don't lose scripts on refresh

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Visual confidence indicator** - Trigger: Users ask "why did it pause?" Helps them understand AI behavior
- [ ] **Skip-ahead detection** - Trigger: Users report "I skipped a paragraph and it got lost" - semantic matching should enable this
- [ ] **Script position jump (click to navigate)** - Trigger: Users need to review/practice specific sections
- [ ] **Text formatting options** - Trigger: Users request bigger/different colors/fonts
- [ ] **Export/Import scripts** - Trigger: Users want to save scripts outside browser
- [ ] **Multiple script management** - Trigger: Users have more than one script
- [ ] **Real-time script editing** - Trigger: Users find typos while reading

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Multi-language support** - Why defer: Complex to test; need to validate English-first
- [ ] **Speech model selection** - Why defer: Premature optimization; start with one good model
- [ ] **Keyboard shortcuts** - Why defer: Power user feature; validate with basic controls first
- [ ] **Script templates** - Why defer: Need to understand user content patterns first
- [ ] **Reading stats (WPM, time remaining)** - Why defer: Nice-to-have, not core value
- [ ] **Teleprompter hardware mode (mirroring)** - Why defer: Niche use case; validate software-only first

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Semantic speech matching | HIGH | HIGH | P1 |
| Auto-scroll on confidence | HIGH | MEDIUM | P1 |
| Pause on uncertainty | HIGH | MEDIUM | P1 |
| Script input (paste) | HIGH | LOW | P1 |
| Basic text display | HIGH | LOW | P1 |
| Manual scroll controls | HIGH | LOW | P1 |
| Local storage | HIGH | LOW | P1 |
| Visual confidence indicator | MEDIUM | MEDIUM | P2 |
| Skip-ahead detection | MEDIUM | HIGH | P2 |
| Position jump controls | MEDIUM | LOW | P2 |
| Script export/import | MEDIUM | LOW | P2 |
| Multiple script management | MEDIUM | MEDIUM | P2 |
| Real-time editing | MEDIUM | MEDIUM | P2 |
| Text formatting options | LOW | LOW | P2 |
| Reading statistics | LOW | MEDIUM | P3 |
| Keyboard shortcuts | LOW | LOW | P3 |
| Multi-language | LOW | HIGH | P3 |
| Script templates | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch - validates core value proposition
- P2: Should have, add when possible - improves experience, addresses feedback
- P3: Nice to have, future consideration - polish and power user features

## Competitor Feature Analysis

| Feature | PromptSmart | Speakflow | Teleprompter Pro | Our Approach |
|---------|-------------|-----------|------------------|--------------|
| Voice scrolling | Exact word matching (VoiceTrack) | Voice-activated | Manual only | **Semantic matching** - handles paraphrasing |
| Pause detection | Stops when you stop talking | Manual control | Manual only | **Confidence-based** - knows uncertain vs off-script |
| Skip handling | Gets confused if off-script | Manual repositioning | Manual only | **Semantic jump** - finds where you are |
| Setup required | Requires optimization/calibration | No calibration | N/A | **Zero config** - works immediately |
| Price | $9.99/month | $10/month (Pro) | $59.99/year | **Free** (no API costs) |
| Platform | iOS, Android app | Web browser | iOS, Mac app | **Web only** (proof of concept) |
| Offline | Yes (local processing) | No (cloud) | Yes | No (requires internet for speech API) |
| Script sync | Cloud sync (paid) | Cloud collaboration | iCloud sync | Local storage + export |
| Video recording | Built-in | Built-in 1080p | Built-in with effects | Not included (use external tools) |
| Multi-language | 14 languages | Limited | English focus | English only (v1) |

**Competitive positioning:** We compete on intelligence (semantic matching) and price (free), not features breadth. We're a focused tool that does one thing exceptionally well: following your natural speech.

## Domain-Specific Insights

### User Expectations from Research

**What users hate about traditional teleprompters:**
- Constant speed forces robotic delivery
- Manual speed adjustments break flow
- Going off-script loses position
- Skipping ahead requires manual repositioning

**What users complain about with voice teleprompters:**
- "Gets confused if I mispronounce words" (exact matching problem)
- "Stops scrolling if I pause to think" (can't distinguish pause from off-script)
- "Loses place if I rephrase anything" (can't handle natural speech variation)
- "Jumps around erratically" (poor confidence handling)
- "Requires calibration before each use" (friction)

**Our solution addresses these by:**
- Semantic matching handles mispronunciation and paraphrasing
- Confidence-based decisions distinguish pauses from problems
- Graceful degradation prevents erratic jumping
- Zero configuration removes friction

### Technical Considerations

**Speech Recognition Realities:**
- Browser Speech Recognition API (Web Speech API) available in Chrome, Edge, Safari
- Requires internet connection (cloud-based processing)
- Free to use, no API keys needed (meets constraint)
- Real-time streaming results (partial and final)
- Accuracy varies with microphone quality and background noise

**Matching Challenges:**
- Exact word matching too brittle (PromptSmart's approach)
- Need semantic similarity (embeddings, fuzzy matching)
- Balance: too sensitive = jumps around, too strict = stuck
- Sliding window approach: match recent speech to script sections
- Confidence threshold tuning critical for UX

**Performance Constraints:**
- Web Speech API has ~60-second timeout, need to restart recognition periodically
- Embedding models need to run client-side (transformers.js or similar)
- Script length affects matching performance (suggest max ~5000 words)
- Real-time processing budget: <100ms latency for smooth scrolling

## Sources

### Voice-Controlled Teleprompter Products
- [PromptSmart](https://promptsmart.com/) - Leading voice-activated teleprompter with VoiceTrack technology
- [Speakflow](https://www.speakflow.com/) - Online teleprompter with voice and remote control
- [PromptSmart Features](https://promptsmart.com/how-it-works) - VoiceTrack technical details
- [Voice-Activated Teleprompter Guide](https://telepromptermirror.com/voice-activated-teleprompter/) - Free software comparison

### Teleprompter App Reviews and Comparisons
- [Best Teleprompter Apps 2026 - Setapp](https://setapp.com/app-reviews/best-teleprompter-apps)
- [Best Teleprompter Apps - OpusClip](https://www.opus.pro/blog/best-teleprompter-apps-for-creators)
- [Teleprompter Pro Features](https://teleprompterpro.com/features)
- [10 Best Teleprompter Apps - Evelize](https://evelize.com/blog/10-best-teleprompter-apps-for-content-creators)

### Common Problems and User Feedback
- [Common Teleprompter Issues - Foxcue](https://foxcue.com/blog/common-teleprompter-issues-and-quick-resolutions/)
- [Teleprompter Troubleshooting](https://www.teleprompter.com/blog/teleprompter-troubleshooting-tips)
- [Why I Regret Buying a Teleprompter - Medium](https://medium.com/@speakingpen/why-i-regret-buying-a-teleprompter-8-shocking-reasons-378d312eb8a0)

### Technical Specifications
- [Teleprompter Display Settings Guide](https://www.teleprompter.com/blog/teleprompter-app-settings-guide-for-perfect-video-recording)
- [Text Formatting Requirements](https://guide.teleprompterpro.com/scripts/formatting/)
- [Voice Recognition Challenges - IEEE](https://ieeexplore.ieee.org/document/10417877/) - Academic research on voice-activated teleprompters

### Web-Based Teleprompters
- [Free Online Teleprompters - TeleprompterMirror](https://telepromptermirror.com/telepromptersoftware.htm)
- [CuePrompter](https://cueprompter.com) - Free web-based teleprompter
- [EasyPrompter](https://www.easyprompter.com/) - Browser-based teleprompter

---
*Feature research for: AI Voice-Controlled Teleprompter (Web Application)*
*Researched: 2026-01-22*
*Confidence: MEDIUM-HIGH (verified with multiple product sources and user feedback)*
