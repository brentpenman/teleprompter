# Following-Along Features

**Domain:** Voice-controlled teleprompter position tracking
**Researched:** 2026-01-24
**Confidence:** MEDIUM (verified against multiple competitor products and user reviews)

## Executive Summary

Voice-controlled teleprompters have converged on a standard behavioral model: scroll as the user speaks, pause when they stop or go off-script, resume when they return. However, the *implementation quality* varies dramatically. The primary frustrations users report are:

1. **Jumping ahead unexpectedly** - especially with repeated phrases
2. **Losing position** - the teleprompter scrolls past where the user actually is
3. **Not responding** - fails to track speech, forcing restarts

The sophisticated systems (Autoscript Voice for broadcast) use advanced pattern matching and positional context. Consumer apps (PromptSmart, Speakflow) struggle with edge cases. The key differentiator is **positional anchoring** - the best systems maintain "where you are in the script" as a strong constraint, not just "what words match."

**Key insight:** Users universally expect "never scroll ahead of where I am." This is table stakes. The challenge is *detecting* where they are when speech is ambiguous.

## Standard Teleprompter Behaviors

### Table Stakes - Expected Behaviors

| Behavior | Description | How Competitors Handle It |
|----------|-------------|---------------------------|
| **Pause-and-hold** | Stop scrolling when user stops speaking | Universal. PromptSmart: "VoiceTrack will wait patiently for you to begin reading again." |
| **Resume on return** | Continue from held position when speech resumes | Universal. Speakflow: 15-second timeout before requiring manual restart. |
| **Speed matching** | Scroll speed adapts to speaking pace | Standard. "It's actually listening to your voice and moving the text at whatever speed you're speaking." |
| **Cue indicator** | Fixed visual marker showing "read here" position | Common. Usually top 1/3 of screen. Customizable arrow, line, or highlight. |
| **Off-script tolerance** | Hold position during improvisation | Standard. Autoscript: "pause for adlibs and resume when the presenter is back on script." |

### Differentiators - Advanced Behaviors

| Behavior | Description | Who Has It |
|----------|-------------|------------|
| **Positional context awareness** | Use script position to disambiguate repeated phrases | Autoscript Voice (broadcast-grade) |
| **Multi-presenter support** | Track multiple voices, maintain separate positions | Autoscript Voice |
| **Word-level visual feedback** | Underline/highlight matched words in real-time | Speakflow: "individual words will underline to indicate that the app 'heard' you" |
| **Skip-resistant matching** | Require confirmation before large position jumps | Not found in consumer products - potential differentiator |
| **Smooth scroll interpolation** | No jarring jumps between matched positions | Teleprompter.com claims "proprietary smooth scrolling technology" |

### Anti-Features - What to Avoid

| Anti-Feature | Why It's Bad | How It Manifests |
|--------------|--------------|------------------|
| **Greedy forward matching** | Jumps to next occurrence of phrase, losing position | PromptSmart: "If you repeat a phrase within a few paragraphs, it often doesn't recognize the first one and will skip forward" |
| **No positional constraint** | Allows wild jumps across the script | User: "the script suddenly jumped back up to the beginning" |
| **Binary match/no-match** | No uncertainty handling, causes jarring behavior | User: "It frequently looses track of where I am at" |
| **Fixed scroll speed** | Doesn't adapt to user's natural pace | User: "trying to set a proper scroll speed to match my voice is the biggest ouch" |
| **Aggressive timeout** | Stops tracking too quickly on pause | Speakflow's 15-second timeout requires manual restart |

## Edge Case Handling

### Pauses

**Standard behavior:** Hold position, keep next words visible at cue indicator.

**Competitor implementations:**
- **PromptSmart:** "VoiceTrack automatically scrolls as you speak, stops when you pause or improvise, and seamlessly resumes when you return to your script."
- **Autoscript Voice:** "It will even pause for adlibs and resume scrolling when the presenter is back on script."
- **Speakflow:** "After 15 seconds of silence, the browser will automatically stop listening." (Requires manual restart.)

**Workarounds users employ:**
- Adding `*pause here*` markers in script
- Using `< bracketed >` sections for non-spoken content (PromptSmart's Scroll Assist)

**Recommendation:**
- Hold position indefinitely during silence
- Keep visual feedback active (cue indicator, current position)
- Resume automatically when speech detected, no manual restart required
- Consider visual "paused" indicator so user knows state

### Skip-ahead

**The problem:** User wants to skip a section, says words from later in script.

**Competitor implementations:**
- **No competitor handles this well.** All systems match words to script position, but lack confirmation for large jumps.
- PromptSmart's workaround: "modify repetitive phrases to a shorthand so that you know what to say but the app doesn't scroll forward"
- This puts burden on user to rewrite their script - poor UX.

**What users actually want (based on user-stated requirements):**
- Require a few words of confirmation before jumping
- Use positional context: "if at position 100 saying 'It's important', stay at 100 even if phrase appears at 200"

**Recommendation:**
- Implement "confirmation window" for skip-ahead: require N consecutive matched words before jumping
- Weight matches by proximity to current position
- For large jumps (>N words ahead), require stronger confidence
- Never jump backward unless explicitly triggered

### Off-script/Paraphrasing

**Standard behavior:** Hold position, don't scroll.

**Competitor implementations:**
- **PromptSmart:** "If you ad-lib or go off-script, VoiceTrack will wait patiently for you to begin reading again."
- **Autoscript Voice:** "Voice actively monitors the production audio feed to automatically advance the script as the words are spoken. It will even pause for adlibs."

**What happens when user paraphrases:**
- System hears words not in script
- Cannot match, so holds position
- When user returns to script text, tracking resumes

**The problem:** If display scrolled ahead before user went off-script, they may be looking at wrong section.

**User's stated requirement:** "Never scroll ahead of where user actually is."

**Recommendation:**
- Maintain "confirmed position" (last high-confidence match)
- Display can show lookahead, but cue indicator stays at confirmed position
- When off-script detected, don't scroll
- When back on-script, resume from last confirmed position

### Repeated Phrases

**The core problem:** Same phrase appears multiple times in script. Which occurrence does user mean?

**Competitor failures:**
- **PromptSmart:** "If you repeat a phrase or point within a few paragraphs of where you are speaking, it often doesn't recognize the first one where you are actually at and will skip forward to the next one."
- User review: "This is a known issue that often just stalls and doesn't respond to your voice or jumps too far ahead."

**Workarounds competitors suggest:**
- "Substitute acronyms or short-hand ('FBI' vs. 'Federal Bureau of Investigation')"
- "Modify those repetitive phrases to a shorthand"
- (These put burden on user to rewrite script - poor UX)

**What actually works (Autoscript Voice approach):**
- "Real time speech recognition combined with proprietary algorithms and advanced pattern matching ensures that the script always scrolls in perfect synchronisation with the presenter."
- Tested over 3 years with NBC News for broadcast reliability.

**Technical approaches from speech alignment research:**
- **Monotonic constraint:** Position can only move forward (no backtracking)
- **Positional weighting:** Matches near current position weighted higher
- **Forced alignment algorithms (Viterbi):** Find most probable path through script
- **Dynamic time warping:** Align speech to text with warping constraints

**Recommendation:**
- Implement positional weighting: matches closer to current position score higher
- Use monotonic constraint: never match backward from confirmed position
- Require stronger confidence for matches far from current position
- Track position as a probability distribution, not a single point

## UX Patterns

### Visual Feedback Patterns

**Cue indicator (universal):**
- Fixed position marker showing "read here" point
- Usually top 1/3 of screen
- Styles: arrow, line, highlight band
- Customizable position, color, opacity
- "A cue indicator can help your reader's eyeline remain close to the camera lens"

**Word-level feedback (advanced):**
- Speakflow: "individual words will underline to indicate that the app 'heard' you"
- Shows real-time confirmation that speech recognition is working
- Helps user know when they're "in sync"

**State indicators:**
- "Recording" / "Paused" / "Listening" state
- Visual distinction between active tracking and held position

### Uncertainty Indicators (novel opportunity)

**Current state of art:** No consumer teleprompter shows uncertainty or match quality.

**Opportunity from related domains:**
- Karaoke systems show real-time scoring
- Captioning research: "confidence score above 0.7 indicates strong match"
- Research shows optimal threshold of 0.93 for high confidence

**Potential implementations:**
- Color gradient on cue indicator: green (high confidence) to yellow (uncertain)
- Subtle animation when tracking vs. holding
- Visual "anchor" showing last high-confidence match point

**Recommendation:**
- Don't show numeric scores (confusing)
- Use subtle visual cues: cue indicator style/color changes with confidence
- Show clear "holding position" state when uncertain

### Position Anchoring

**Best practice from professional teleprompters:**
- "Most anchors wanted the current line to hit the top 1/3 of the screen as they were about to say it"
- "Aim to read the script lines as they appear at the top of the screen rather than waiting for them to move towards the middle"

**Why top-third works:**
- Closer to camera lens (better eye contact)
- Gives visual preview of upcoming text
- Natural reading flow (top-to-bottom)

**User's stated requirement:** "Next words to speak always at a fixed spot on screen (near caret)"

**Recommendation:**
- Fixed cue position at user-configurable point (default: top third)
- Smooth scroll to keep current position at cue
- Never scroll past cue position (always show what's coming next)

## Anti-Patterns

### Frustrating Teleprompter Behaviors

| Anti-Pattern | User Impact | Prevalence | How to Avoid |
|--------------|-------------|------------|--------------|
| **Greedy forward matching** | Loses user's place, forces restart | Very common | Weight matches by proximity, require confirmation for jumps |
| **No recovery mechanism** | User stuck when tracking fails | Common | Manual override, tap-to-position, scroll back support |
| **Jarring scroll jumps** | Disorienting, loses reading flow | Common | Smooth interpolation, animate between positions |
| **Monotonous fixed speed** | Unnatural delivery, stress | Common | Adaptive speed matching |
| **Silent failures** | User doesn't know tracking is lost | Common | Clear visual state indicators |
| **Aggressive timeouts** | Requires manual restart after pause | Speakflow (15s) | Long/infinite hold, automatic resume |
| **Blame-the-user workarounds** | "Rewrite your script to avoid repeated phrases" | PromptSmart | Handle repeats algorithmically |
| **All-or-nothing matching** | Either perfect match or nothing | Common | Fuzzy matching, partial confidence |

### Environmental Sensitivity

**Problems:**
- "In a room with wood floors and windows, voice tracking can freeze up"
- "Stay within 5 feet of the iPad for better voice tracking"
- Background noise, echo, reverberation degrade matching

**Recommendations:**
- Graceful degradation: fall back to manual scroll
- Clear feedback when audio quality is poor
- Don't require perfect match for basic tracking

### User Expectations vs. Reality

**Users expect:** "An intelligent assistant who actually listens and adapts to your speaking style"

**Reality:** Most apps are brittle, fail on edge cases, require workarounds

**Key gap:** No consumer product handles repeated phrases well. This is the primary opportunity.

## Feature Priority for Rewrite

### Must Have (Table Stakes)

1. **Pause-and-hold** - Stop scrolling on silence, hold position
2. **Resume on return** - Automatic tracking resume when speech detected
3. **Fixed cue position** - Next words always at configurable screen position
4. **Never scroll ahead** - Cue position is hard limit, no overshooting
5. **Speed adaptation** - Match scroll speed to speech pace

### Should Have (Expected from Voice-Tracking)

1. **Positional context** - Use current position to disambiguate matches
2. **Skip confirmation** - Require multiple words before large jumps
3. **Visual state feedback** - Clear indication of tracking vs. holding
4. **Graceful off-script handling** - Hold position, resume cleanly

### Nice to Have (Differentiators)

1. **Word-level visual feedback** - Show which words were matched
2. **Confidence visualization** - Subtle indication of match quality
3. **Manual position override** - Tap/scroll to reposition without breaking tracking
4. **Backward navigation** - Allow user to go back (with explicit trigger)

## Sources

### Primary Competitors Analyzed

- [PromptSmart Pro](https://apps.apple.com/us/app/promptsmart-pro-teleprompter/id894811756) - VoiceTrack technology
- [PromptSmart Help & Optimization](https://www.tumblr.com/promptsmart/173007383876/voicetrack-101-optimization) - Detailed optimization guidance
- [Speakflow Guide](https://www.speakflow.com/guide) - Flow mode documentation
- [Autoscript Voice](https://autoscript.tv/voice/) - Broadcast-grade voice tracking
- [Teleprompter.com Voice Scroll](https://www.teleprompter.com/blog/voice-scroll-teleprompter-app-new-feature) - Voice scroll feature
- [Teleprompter Pro Cue Indicator](https://guide.teleprompterpro.com/teleprompter/cue-indicator/) - UX patterns

### User Feedback Sources

- [PromptSmart Customer Reviews](https://appcustomerservice.com/app/894811756/promptsmart-pro-teleprompter) - User complaints and issues
- [Teleprompter Pro Reviews](https://justuseapp.com/en/app/941070561/teleprompter-premium/reviews) - User frustrations
- [Common Teleprompter Troubles](https://foxcue.com/blog/common-teleprompter-issues-and-quick-resolutions/) - Industry overview

### Technical Background

- [NVIDIA Forced Alignment](https://research.nvidia.com/labs/conv-ai/blogs/2023/2023-08-forced-alignment/) - How forced alignment works
- [Monotonic Alignment Search](https://github.com/tts-hub/monotonic_alignment_search) - Alignment algorithms
- [PyTorch Forced Alignment Tutorial](https://docs.pytorch.org/audio/main/tutorials/forced_alignment_tutorial.html) - Implementation details
- [Speech-to-Text Alignment for Dysarthric Speech](https://link.springer.com/article/10.1007/s00034-020-01419-5) - Handling repetition detection
- [Confidence Scores in Speech Recognition](https://arxiv.org/html/2410.20564v1) - Using confidence for error detection
- [Microsoft Captioning Concepts](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/captioning-concepts) - Real-time alignment

### UX and Reading Position

- [Working with a Teleprompter Tips](https://thomasjfrank.com/creator/working-with-a-teleprompter/) - Reading position best practices
- [Camera and Teleprompter Positioning](https://creativecow.net/forums/thread/camera-and-teleprompter-positioning/) - Eye line considerations
- [How to Read Naturally](https://www.teleprompter.com/blog/how-to-read-a-teleprompter-naturally-and-engage-your-audience) - UX guidance
