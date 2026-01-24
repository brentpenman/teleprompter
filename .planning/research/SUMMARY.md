# Position-Tracking Rewrite Research Summary

**Project:** Voice-Controlled Teleprompter v1.1 - Position-Tracking Rewrite
**Domain:** Real-time speech-to-text alignment for voice-controlled scrolling
**Researched:** 2026-01-24
**Confidence:** HIGH

## Executive Summary

The v1.1 rewrite addresses fundamental architectural flaws in v1.0's position-tracking implementation. The core problem: v1.0 conflated matching (finding words), position management (deciding what's confirmed), and scroll control (displaying text) into tangled components with 15+ interdependent parameters. The result was "too sensitive AND not sensitive enough" - jumping ahead on repeated phrases while simultaneously failing to track natural reading.

The research reveals a clear path forward: implement a **distance-weighted scoring algorithm** combined with a **two-position model** (confirmed floor + candidate ceiling) within a **clean pipeline architecture** (WordMatcher → PositionTracker → ScrollController). This approach is grounded in established alignment algorithms (forced alignment, monotonic constraints) and validated by competitor analysis showing that professional systems (Autoscript Voice) use positional context as the primary disambiguation mechanism.

The critical insight: position tracking is a *confirmation* problem, not a *prediction* problem. When you predict where the user will be, you inevitably get ahead of them. When you confirm where they are, you stay in sync. The rewrite eliminates speculative position updates, state machine complexity, and parameter explosion in favor of reactive scrolling that follows confirmed speech only.

## Key Findings

### Recommended Algorithm

**Distance-Weighted Scoring** (from ALGORITHMS.md)

The core innovation: combine fuzzy match quality with positional proximity into a unified relevance score. This solves the "repeated phrases" problem that plagued v1.0 by making position intrinsic to match confidence rather than a post-processing filter.

```javascript
FinalScore = FuzzyScore * PositionalWeight

Where:
  FuzzyScore = 1 - (LevenshteinDistance / MaxLength)
  PositionalWeight = 1 / (1 + |distance| * DecayFactor)
```

**Key parameters:**
- `fuzzyThreshold: 0.7` - Minimum match quality to consider
- `decayFactor: 0.1` - Distance penalty (15 words away = 40% weight reduction)
- `searchRadius: 50` - How far to search (~20% of script)
- `requireConsecutive: 2` - Minimum consecutive matches for confidence

**Two-Position Model:**
- `confirmedPosition` - Highest word index where user definitely has been (monotonic, never decreases)
- `candidatePosition` - Where we think user currently is (can be speculative)
- Scroll boundary: never exceed `confirmedPosition + buffer` (typically 3 words)

This prevents the "getting ahead" problem by hard-limiting scroll position to confirmed speech regardless of candidate matches.

### Expected Features

**Must have (table stakes):**
- Pause-and-hold - Stop scrolling on silence, hold position indefinitely
- Resume on return - Automatic tracking when speech detected (no manual restart)
- Fixed cue position - Next words always at configurable screen position (default: top 1/3)
- Never scroll ahead - Cue position is hard limit, display never races past user
- Speed adaptation - Scroll speed matches observed speaking pace

**Should have (competitive advantage):**
- Positional context awareness - Use current position to disambiguate repeated phrases
- Skip confirmation - Require consecutive words before accepting large position jumps
- Visual state feedback - Clear indication of tracking vs. holding vs. paused
- Graceful off-script handling - Hold position during ad-libs, resume cleanly

**Defer (nice to have):**
- Word-level visual feedback - Underline matched words in real-time (like Speakflow)
- Confidence visualization - Subtle indicator of match quality
- Manual position override - Tap/scroll without breaking tracking
- Backward navigation - Explicit user trigger only, not automatic

**Anti-features (avoid):**
- Greedy forward matching without positional constraints
- Binary match/no-match with no uncertainty handling
- Aggressive timeouts requiring manual restart
- Fixed scroll speed that doesn't adapt to pace
- Symmetric forward/backward skip handling

### Architecture Approach

The v1.1 architecture implements a **clean separation of concerns** via a pipeline where each component has a single responsibility:

**Major components:**

1. **WordMatcher** (stateless) - Pure matching function that searches for phrase matches within a position range and returns scored candidates. No knowledge of current position or history.

2. **PositionTracker** (stateful core) - Maintains `confirmedPosition` as single source of truth. Receives match candidates, applies acceptance rules (proximity bias, skip limits, consecutive confirmation), updates confirmed position only when confident. Emits events on position changes.

3. **ScrollController** (reactive display) - Listens for position confirmations, calculates scroll position to place confirmed position at caret, applies smooth animation. Never scrolls ahead of confirmed position boundary.

**Data flow:**
```
Speech Input → SpeechRecognizer → WordMatcher → PositionTracker → ScrollController → DOM scroll
```

**Integration with existing code:**
- **Keep:** SpeechRecognizer, AudioVisualizer, Highlighter, textUtils, Fuse.js - all working well
- **Replace:** TextMatcher → WordMatcher (make stateless), ScrollSync → PositionTracker + ScrollController (split concerns)
- **Remove:** ConfidenceLevel.js (absorbed into PositionTracker), complex state machine, 15+ parameters

### Critical Pitfalls

Based on v1.0 failure analysis and domain research:

1. **Speculative position updates** - v1.0 updated position immediately on match, then tried to constrain scroll. Solution: Only update `confirmedPosition` on high-confidence matches; scroll never exceeds confirmed boundary.

2. **Ignoring positional context** - v1.0 searched in priority order but didn't weight matches by distance. Solution: Make distance intrinsic to match scoring via `PositionalWeight = 1 / (1 + distance * DecayFactor)`.

3. **Parameter explosion** - v1.0 accumulated 15+ tunable parameters as band-aids on fundamental model problems. Solution: Derive behavior from observed speech characteristics (pace, match quality, position) rather than expose configuration knobs.

4. **State machine complexity** - v1.0's CONFIDENT/UNCERTAIN/OFF_SCRIPT states represented system confidence, not user behavior. Solution: Simple reactive model (match found → scroll, no match → hold) without state transitions.

5. **Equal treatment of all directions** - v1.0 allowed backward skips with higher threshold, but repeated phrases still caused backward jumps. Solution: Forward movement is automatic with positional bias; backward requires explicit user action or much stronger consecutive confirmation.

## Implications for Roadmap

Based on research, suggested phase structure for the rewrite:

### Phase 1: WordMatcher (Pure Matching Foundation)

**Rationale:** Start with the stateless foundation. Extract matching logic from TextMatcher, remove all position tracking, make it a pure function. This isolates fuzzy matching concerns and provides a testable unit.

**Delivers:**
- WordMatcher.js with `findCandidates(spokenWords, searchRange)` method
- Position-constrained search (don't search entire script)
- Distance-weighted scoring implementation
- Consecutive match requirement

**Addresses:**
- Positional context awareness (position-weighted scoring)
- Foundation for handling repeated phrases

**Avoids:**
- Mixing matching and position tracking concerns
- Fuzzy matching without boundaries

**Research needed:** None - fuzzy matching patterns are well-established (Fuse.js, Levenshtein)

### Phase 2: PositionTracker (Confirmation Logic)

**Rationale:** This is the brain of the rewrite. Implements the two-position model, acceptance rules, and confirmation logic. Must come after WordMatcher since it consumes match candidates.

**Delivers:**
- PositionTracker.js with `confirmedPosition` as single source of truth
- Two-position model (confirmed + candidate)
- Acceptance rules (proximity bias, skip limits, consecutive confirmation)
- Event emission on position changes
- SkipDetector integrated (consecutive-word confirmation for large jumps)

**Addresses:**
- Never scroll ahead (hard boundary at confirmedPosition + buffer)
- Skip confirmation (require N consecutive matches for jumps > threshold)
- Monotonic forward constraint (confirmedPosition only increases)

**Avoids:**
- Speculative position updates
- State machine complexity
- Predictive vs. reactive scrolling pitfall

**Research needed:** Minimal - test skip confirmation timing and consecutive count thresholds with real speech

### Phase 3: ScrollController (Reactive Display)

**Rationale:** Scroll behavior is completely dependent on confirmed positions from PositionTracker. Simplify by removing all matching logic, state machines, and complex speed calculations. Just react to position changes.

**Delivers:**
- ScrollController.js that subscribes to PositionTracker events
- Scroll boundary enforcement (never exceed confirmed + buffer)
- Pace-based speed adjustment (observed words per second)
- Smooth scroll animation
- Pause/resume without state transitions

**Addresses:**
- Fixed cue position (scroll to keep confirmed position at caret)
- Speed adaptation (derive from observed pace)
- Graceful off-script handling (just hold position when no confirmations)

**Avoids:**
- Animation hiding logical problems (get position logic right first)
- Insufficient silence handling (hold position on pause, no aggressive timeout)

**Research needed:** None - scroll mechanics already working in v1.0

### Phase 4: Integration and Migration

**Rationale:** Wire up the new pipeline, remove old components, update script.js to use new architecture.

**Delivers:**
- script.js updated to use WordMatcher → PositionTracker → ScrollController pipeline
- Removal of TextMatcher.js, ScrollSync.js, ConfidenceLevel.js
- Highlighter integration via PositionTracker events
- Configuration simplified to 3-4 core parameters

**Addresses:**
- Clean component boundaries
- Event-driven communication (Observer pattern)
- Single source of truth (confirmedPosition)

**Avoids:**
- Bidirectional data flow
- Mixed concerns in one class

**Research needed:** None - integration patterns are straightforward

### Phase Ordering Rationale

**Bottom-up implementation:**
1. WordMatcher provides pure matching foundation (no dependencies)
2. PositionTracker consumes WordMatcher output (depends on Phase 1)
3. ScrollController consumes PositionTracker events (depends on Phase 2)
4. Integration wires everything together (depends on Phases 1-3)

**Why this order:**
- Each phase delivers a testable unit before moving to dependent components
- Matching logic can be unit-tested in isolation with mock transcripts
- Position tracking can be tested with mock match candidates
- Scroll behavior can be tested with mock position confirmations
- Avoids "big bang" rewrite - incremental validation at each step

**Dependency chain:** The pipeline architecture creates a natural ordering where each component has a clear input (from previous phase) and output (to next phase).

### Research Flags

**Phases with standard patterns (skip deep research):**
- **Phase 1 (WordMatcher):** Fuzzy matching is well-documented, Fuse.js patterns established
- **Phase 3 (ScrollController):** Scroll mechanics already working in v1.0
- **Phase 4 (Integration):** Event-driven patterns are standard JavaScript

**Phase needing empirical validation:**
- **Phase 2 (PositionTracker):** Acceptance rule thresholds (skip confirmation count, consecutive requirements, position decay factor) need testing with real speech. Research provides starting values but may need tuning based on observed behavior. This is NOT parameter explosion - it's validating 3-4 core algorithmic constants.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Algorithms | HIGH | Distance-weighted scoring and two-position model are well-established in alignment research; algorithms include complete pseudocode |
| Features | MEDIUM | Table stakes validated against multiple competitors; differentiators based on v1.0 gaps and user feedback; some edge cases need empirical testing |
| Architecture | HIGH | Pipeline pattern, observer pattern, separation of concerns are proven software architecture; component boundaries clearly defined; integration points documented |
| Pitfalls | HIGH | Based on v1.0 code analysis (actual implementation failures) plus domain research; failure modes well-understood from experience |

**Overall confidence:** HIGH

v1.0 provides concrete evidence of what doesn't work. Research provides established algorithms (forced alignment, monotonic constraints) and architectural patterns (pipeline, observer). The rewrite path is clear: replace speculative prediction with reactive confirmation, replace parameter explosion with derived behavior, replace tangled components with clean separation.

### Gaps to Address

**Algorithmic tuning:**
- Starting values for decayFactor (0.1), skipThreshold (10), requiredConfirmations (2) are research-based but need validation with diverse content (not just Gettysburg Address)
- Test with: speeches with numbers, technical documents, poems with repeated lines, unusual names
- Measurement: latency (<300ms target), false positive rate (<5%), false negative rate (<5%)

**Edge case validation:**
- Font size changes mid-read (express scroll targets in word positions, not pixels)
- Web Speech API timing inconsistencies (design for asynchronous, potentially contradictory input)
- Script content variations (numbers as digits vs. words, abbreviations, technical terms)

**User experience refinement:**
- Visual state feedback (tracking vs. holding vs. paused) - research suggests subtle cue indicator changes
- Confidence visualization (optional) - avoid numeric scores, use color/animation
- Manual override mechanism - needed but not specified in detail

**These gaps are manageable:**
- Algorithmic tuning is empirical validation, not research (run UAT with diverse scripts)
- Edge cases are implementation details, not architectural unknowns
- UX refinement can happen after core algorithm proves stable

## Sources

### Algorithms (HIGH confidence)

**Positional scoring:**
- [Distance matters! Cumulative proximity expansions for ranking documents](https://link.springer.com/article/10.1007/s10791-014-9243-x) - Term proximity scoring theory
- [Algolia Ranking Criteria](https://www.algolia.com/doc/guides/managing-results/relevance-overview/in-depth/ranking-criteria/) - Practical proximity ranking
- [Observable: Distance-weighted proximity score](https://observablehq.com/@abenrob/distance-weighted-proximity-score/2) - Inverse quadratic decay

**Alignment algorithms:**
- [Smith-Waterman Algorithm](https://en.wikipedia.org/wiki/Smith%E2%80%93Waterman_algorithm) - Local sequence alignment
- [Monotonic Alignment for TTS](https://arxiv.org/html/2409.07704v1) - Forward-only constraint
- [NVIDIA Forced Alignment](https://research.nvidia.com/labs/conv-ai/blogs/2023/2023-08-forced-alignment/) - Audio-text synchronization

**Fuzzy matching:**
- [Fuse.js Scoring Theory](https://www.fusejs.io/concepts/scoring-theory.html) - Fuzzy search internals
- [Hypothesis Fuzzy Anchoring](https://web.hypothes.is/blog/fuzzy-anchoring/) - Position-aware text anchoring

### Features (MEDIUM confidence)

**Competitor analysis:**
- [PromptSmart Pro](https://apps.apple.com/us/app/promptsmart-pro-teleprompter/id894811756) - VoiceTrack technology
- [PromptSmart Help](https://www.tumblr.com/promptsmart/173007383876/voicetrack-101-optimization) - Edge case workarounds
- [Speakflow Guide](https://www.speakflow.com/guide) - Flow mode documentation
- [Autoscript Voice](https://autoscript.tv/voice/) - Broadcast-grade tracking

**User feedback:**
- [PromptSmart Reviews](https://appcustomerservice.com/app/894811756/promptsmart-pro-teleprompter) - Repeated phrase failures
- [Common Teleprompter Issues](https://foxcue.com/blog/common-teleprompter-issues-and-quick-resolutions/) - Industry pain points

### Architecture (HIGH confidence)

**Patterns:**
- [Game Programming Patterns: State](https://gameprogrammingpatterns.com/state.html) - State management
- [Observer Pattern in JavaScript](https://medium.com/@artemkhrenov/the-observer-pattern-in-modern-javascript-building-reactive-systems-9337d6a27ee7) - Event-driven systems
- [Pipeline Pattern](https://dev.to/wallacefreitas/the-pipeline-pattern-streamlining-data-processing-in-software-architecture-44hn) - Data transformation chains
- [Separation of Concerns](https://www.geeksforgeeks.org/software-engineering/separation-of-concerns-soc/) - Architectural principle

### Pitfalls (HIGH confidence)

**v1.0 codebase analysis:**
- `/Users/brent/project/matching/TextMatcher.js` - Proximity search without position weighting
- `/Users/brent/project/matching/ScrollSync.js` - State machine with 15+ parameters
- `/Users/brent/project/matching/ConfidenceLevel.js` - Multi-factor confidence calculation
- `/Users/brent/project/.planning/PROJECT.md` - v1.0 failure documentation

**Domain research:**
- [Forced Alignment Challenges](https://www.futurebeeai.com/knowledge-hub/forced-alignment-speech) - Alignment fundamentals
- [Confidence Score Pitfalls](https://www.mindee.com/blog/how-use-confidence-scores-ml-models) - Threshold tuning
- [Speech Rate Estimation](https://pmc.ncbi.nlm.nih.gov/articles/PMC2860302/) - Pace calculation

---

*Research completed: 2026-01-24*
*Ready for roadmap: Yes*
