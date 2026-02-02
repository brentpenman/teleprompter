---
phase: quick-002
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - script.js
  - matching/WordMatcher.js
autonomous: true

must_haves:
  truths:
    - "Scrolling recovers within a few seconds after speech recognition misses consecutive words"
    - "Normal forward tracking (word-by-word) still works at same quality"
    - "All existing WordMatcher and PositionTracker tests still pass"
  artifacts:
    - path: "script.js"
      provides: "Updated findMatches call with expanded radius"
      contains: "radius: 100"
    - path: "matching/WordMatcher.js"
      provides: "Updated default radius from 50 to 100"
      contains: "radius = 100"
  key_links:
    - from: "script.js"
      to: "matching/WordMatcher.js"
      via: "findMatches options parameter"
      pattern: "findMatches.*radius"
---

<objective>
Expand the search/lookahead area in the teleprompter following logic so scrolling recovers faster when speech recognition misses consecutive words.

Purpose: When Vosk or Web Speech API drops several words in a row, the WordMatcher search radius (currently 50 words) may not reach far enough ahead to find where the user actually is in the script. By doubling the forward search radius to 100 words and also allowing matching with fewer transcript words, the system can reacquire position after missed words.

Output: Updated search parameters in WordMatcher defaults and script.js pipeline call.
</objective>

<execution_context>
@/Users/brent/.claude/get-shit-done/workflows/execute-plan.md
@/Users/brent/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@matching/WordMatcher.js
@matching/PositionTracker.js
@script.js (handleSpeechTranscript function, lines 380-453)
@script.js (initMatchingSystem function, lines 802-836)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand WordMatcher search radius and tune matching parameters</name>
  <files>matching/WordMatcher.js, script.js</files>
  <action>
Make the following targeted parameter changes:

1. In `matching/WordMatcher.js`, in the `findMatches` function defaults (line 136):
   - Change `radius = 50` to `radius = 100` (double the lookahead/lookbehind search window from 50 to 100 words in each direction)
   - This means the system searches 100 words ahead and 100 words behind the current position, giving it a 200-word total search window instead of 100

2. In `script.js`, in the `handleSpeechTranscript` function (line 402-406):
   - Change the `radius: 50` option to `radius: 100` in the `findMatches` call
   - This overrides the default explicitly, so it must be updated too

3. In `matching/WordMatcher.js`, in the `findMatches` function defaults (line 136):
   - Change `minConsecutive = 2` to `minConsecutive = 1` (allow single-word matches)
   - This helps recovery because after missed words, the recognition engine may only capture a single word at first. With minConsecutive=2, that recovery signal is thrown away. With minConsecutive=1, a single correctly recognized word can start the position-finding process.

   NOTE: This is safe because PositionTracker still enforces consecutive match streaks (4-5 matches) for skip detection. A single spurious match won't cause the position to jump -- it will just enter "exploring" state. The PositionTracker is the safety gate, not minConsecutive.

4. In `script.js`, in the `handleSpeechTranscript` function:
   - Remove the `minConsecutive: 2` option from the findMatches call if present (it's not currently explicitly set, so the new default of 1 will take effect automatically -- just verify it's not overridden)

Do NOT change:
- `windowSize` (keep at 3) -- the last-3-words window is fine, changing it would alter matching quality
- `distanceWeight` (keep at 0.3) -- distance penalty is well-tuned
- `threshold` (keep at 0.3) -- fuzzy matching threshold is well-tuned
- Any PositionTracker parameters (nearbyThreshold, consecutive match requirements) -- these are the safety gate preventing false jumps
  </action>
  <verify>
Run `cd /Users/brent/project && node --experimental-vm-modules node_modules/jest/bin/jest.js` -- all existing tests must pass.

Verify the specific values by checking:
- `matching/WordMatcher.js` has `radius = 100` and `minConsecutive = 1` in defaults
- `script.js` handleSpeechTranscript has `radius: 100` in findMatches call
  </verify>
  <done>
- WordMatcher default radius is 100 (was 50)
- WordMatcher default minConsecutive is 1 (was 2)
- script.js findMatches call uses radius: 100
- All 25+ existing WordMatcher and PositionTracker tests pass
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Expanded search radius from 50 to 100 words and reduced minimum consecutive match requirement from 2 to 1, allowing faster scroll recovery after missed words.</what-built>
  <how-to-verify>
1. Start the dev server: `PORT=3003 node server.js`
2. Open https://localhost:3003 in Chrome
3. Paste a multi-paragraph script (at least 200 words)
4. Click "Start Teleprompter", enable Voice mode
5. Speak normally for a few sentences -- confirm tracking works as before
6. Stay silent for 3-5 seconds (simulating missed recognition), then resume speaking
7. Observe that scrolling recovers and catches up to your position within a few words of resuming speech
8. Try speaking a sentence, then deliberately skip ahead ~50 words in the script and speak from there -- confirm it catches up within 4-5 consecutive matches at the new location
  </how-to-verify>
  <resume-signal>Type "approved" or describe any issues with scroll recovery</resume-signal>
</task>

</tasks>

<verification>
- `node --experimental-vm-modules node_modules/jest/bin/jest.js` passes all tests
- Manual testing confirms faster recovery after missed words
- Normal word-by-word tracking quality unchanged
</verification>

<success_criteria>
- Search radius doubled from 50 to 100 words (200-word total search window)
- Single-word matches allowed (minConsecutive=1) for faster recovery
- All existing tests pass without modification
- Manual verification shows noticeably faster scroll recovery after silence/missed words
</success_criteria>

<output>
After completion, create `.planning/quick/002-expand-lookahead-search-area-for-scroll-/002-SUMMARY.md`
</output>
