// @ts-check
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load the large transcript for testing
const transcriptPath = resolve(process.cwd(), 'transcript.txt');
let LARGE_SCRIPT;
try {
  LARGE_SCRIPT = readFileSync(transcriptPath, 'utf-8');
} catch {
  LARGE_SCRIPT = Array(5000).fill('the quick brown fox jumps over the lazy dog').join(' ');
}

const SMALL_SCRIPT = 'Four score and seven years ago our fathers brought forth on this continent a new nation.';

/** Enter teleprompter mode with a given script */
async function enterTeleprompter(page, script) {
  await page.goto('/');
  await page.waitForSelector('#script-input');
  await page.fill('#script-input', script);
  await page.click('#start-button');
  await page.waitForSelector('#teleprompter-view:not(.hidden)');
}

test.describe('PRD-002: Voice Performance with Large Scripts', () => {

  test.describe('Large script loading', () => {
    test('app loads and enters teleprompter mode with 10,000+ word script', async ({ page }) => {
      await enterTeleprompter(page, LARGE_SCRIPT);

      // Teleprompter should be showing with content
      const text = page.locator('#teleprompter-text');
      await expect(text).toBeVisible();
      const content = await text.textContent();
      expect(content.length).toBeGreaterThan(1000);
    });

    test('teleprompter text is rendered correctly with large script', async ({ page }) => {
      await enterTeleprompter(page, LARGE_SCRIPT);

      // Check that the text container exists and has content
      const textContent = await page.locator('#teleprompter-text').textContent();
      // Verify it contains the beginning of the transcript
      expect(textContent).toContain('Fake');
    });
  });

  test.describe('FR-2 & FR-3: Transcript throttling behavior', () => {
    test('throttle constant is set to 150ms', async ({ page }) => {
      await page.goto('/');

      // Check that the throttle constant exists in the loaded script module
      // We test this by checking the source code was loaded properly
      const throttleValue = await page.evaluate(async () => {
        // Fetch script.js and check for the throttle constant
        const resp = await fetch('/script.js');
        const code = await resp.text();
        const match = code.match(/TRANSCRIPT_THROTTLE_MS\s*=\s*(\d+)/);
        return match ? parseInt(match[1]) : null;
      });

      expect(throttleValue).toBe(150);
    });
  });

  test.describe('FR-4: Exact match fast path in code', () => {
    test('findMatches contains exact string comparison fast path', async ({ page }) => {
      await page.goto('/');

      const hasExactPath = await page.evaluate(async () => {
        const resp = await fetch('/matching/WordMatcher.js');
        const code = await resp.text();
        // Check for exact string comparison before fuzzy fallback
        return code.includes('spokenWord === scriptWord');
      });

      expect(hasExactPath).toBe(true);
    });
  });

  test.describe('Windowed Fuse.js index (Option A)', () => {
    test('findMatches creates windowed Fuse.js index instead of using full index', async ({ page }) => {
      await page.goto('/');

      const hasWindowedIndex = await page.evaluate(async () => {
        const resp = await fetch('/matching/WordMatcher.js');
        const code = await resp.text();
        // Check for windowed slice creation
        return code.includes('windowedSlice') || code.includes('windowedFuse');
      });

      expect(hasWindowedIndex).toBe(true);
    });
  });

  test.describe('NFR-3: No lag during auto-scroll with large script', () => {
    test('auto-scroll remains smooth with 10,000+ word script loaded', async ({ page }) => {
      await enterTeleprompter(page, LARGE_SCRIPT);

      const container = page.locator('#teleprompter-container');
      const initialScroll = await container.evaluate(el => el.scrollTop);

      // Start scrolling
      await page.click('#play-pause-btn');

      // Collect scroll positions over 2 seconds to check smoothness
      const scrollPositions = await page.evaluate(async () => {
        return new Promise(resolve => {
          const positions = [];
          const container = document.getElementById('teleprompter-container');
          const interval = setInterval(() => {
            positions.push(container.scrollTop);
          }, 100);
          setTimeout(() => {
            clearInterval(interval);
            resolve(positions);
          }, 2000);
        });
      });

      // Verify scrolling happened
      expect(scrollPositions.length).toBeGreaterThan(10);

      // Verify positions are monotonically increasing (smooth scroll)
      let increasing = 0;
      for (let i = 1; i < scrollPositions.length; i++) {
        if (scrollPositions[i] > scrollPositions[i - 1]) {
          increasing++;
        }
      }
      // At least 80% of samples should show forward progress
      expect(increasing / (scrollPositions.length - 1)).toBeGreaterThan(0.8);
    });
  });

  test.describe('UI responsiveness with large script', () => {
    test('speed controls respond quickly with large script loaded', async ({ page }) => {
      await enterTeleprompter(page, LARGE_SCRIPT);
      // Show controls
      await page.mouse.move(400, 400);
      await page.waitForSelector('.controls-overlay.visible');

      // Click speed up and measure response time
      const speedBefore = await page.locator('#speed-display').textContent();
      await page.click('#speed-up');
      const speedAfter = await page.locator('#speed-display').textContent();

      expect(parseInt(speedAfter)).toBe(parseInt(speedBefore) + 10);
    });

    test('font size controls respond quickly with large script loaded', async ({ page }) => {
      await enterTeleprompter(page, LARGE_SCRIPT);
      await page.mouse.move(400, 400);
      await page.waitForSelector('.controls-overlay.visible');

      const sizeBefore = await page.locator('#size-display').textContent();
      await page.click('#size-up');
      const sizeAfter = await page.locator('#size-display').textContent();

      expect(parseInt(sizeAfter)).toBe(parseInt(sizeBefore) + 4);
    });

    test('exit button works with large script loaded', async ({ page }) => {
      await enterTeleprompter(page, LARGE_SCRIPT);
      await page.mouse.move(400, 400);
      await page.waitForSelector('.controls-overlay.visible');

      await page.click('#exit-btn');
      await page.waitForSelector('#editor-view:not(.hidden)');

      await expect(page.locator('#editor-view')).toBeVisible();
    });
  });

  test.describe('Performance: in-browser findMatches benchmarks', () => {
    test('findMatches completes in under 16ms for 5000-word script (in browser)', async ({ page }) => {
      await page.goto('/');

      const elapsed = await page.evaluate(async () => {
        // Dynamically import the module
        const { createMatcher, findMatches } = await import('/matching/WordMatcher.js');

        const vocabulary = [
          'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
          'and', 'then', 'runs', 'through', 'green', 'forest', 'while',
          'birds', 'sing', 'above', 'trees', 'grow', 'tall', 'near',
          'river', 'flows', 'down', 'mountain', 'into', 'valley', 'below'
        ];
        const words = [];
        for (let i = 0; i < 5000; i++) {
          words.push(vocabulary[i % vocabulary.length]);
        }
        const script = words.join(' ');
        const matcher = createMatcher(script);

        // Warm up
        findMatches('quick brown fox', matcher, 2500);

        // Measure
        const iterations = 10;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          findMatches('quick brown fox', matcher, 2500);
        }
        return (performance.now() - start) / iterations;
      });

      expect(elapsed).toBeLessThan(16);
    });

    test('findMatches completes in under 50ms for 10000-word script (in browser)', async ({ page }) => {
      await page.goto('/');

      const elapsed = await page.evaluate(async () => {
        const { createMatcher, findMatches } = await import('/matching/WordMatcher.js');

        const vocabulary = [
          'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
          'and', 'then', 'runs', 'through', 'green', 'forest', 'while',
          'birds', 'sing', 'above', 'trees', 'grow', 'tall', 'near',
          'river', 'flows', 'down', 'mountain', 'into', 'valley', 'below'
        ];
        const words = [];
        for (let i = 0; i < 10000; i++) {
          words.push(vocabulary[i % vocabulary.length]);
        }
        const script = words.join(' ');
        const matcher = createMatcher(script);

        // Warm up
        findMatches('quick brown fox', matcher, 5000);

        const iterations = 10;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          findMatches('quick brown fox', matcher, 5000);
        }
        return (performance.now() - start) / iterations;
      });

      expect(elapsed).toBeLessThan(50);
    });
  });
});
