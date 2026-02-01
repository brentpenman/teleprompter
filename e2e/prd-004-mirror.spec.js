// @ts-check
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SAMPLE_SCRIPT = 'Four score and seven years ago our fathers brought forth on this continent a new nation conceived in liberty and dedicated to the proposition that all men are created equal.';

/** Enter teleprompter mode with a given script */
async function enterTeleprompter(page, script = SAMPLE_SCRIPT) {
  await page.goto('/');
  await page.waitForSelector('#script-input');
  await page.fill('#script-input', script);
  await page.click('#start-button');
  await page.waitForSelector('#teleprompter-view:not(.hidden)');
  // Wait for controls to be visible initially
  await page.waitForSelector('.controls-overlay.visible');
}

test.describe('PRD-004: Mirror Text Option', () => {
  test.describe('FR-1: Mirror button toggles horizontal text mirroring', () => {
    test('mirror button exists in controls overlay', async ({ page }) => {
      await enterTeleprompter(page);
      const mirrorBtn = page.locator('#mirror-btn');
      await expect(mirrorBtn).toBeVisible();
      await expect(mirrorBtn).toHaveText('Mirror');
    });

    test('clicking mirror button applies scaleX(-1) transform', async ({ page }) => {
      await enterTeleprompter(page);
      const container = page.locator('#teleprompter-container');

      // Initially no mirrored class
      await expect(container).not.toHaveClass(/mirrored/);

      // Click mirror button
      await page.click('#mirror-btn');

      // Should have mirrored class
      await expect(container).toHaveClass(/mirrored/);

      // Verify CSS transform is applied
      const transform = await container.evaluate(el => getComputedStyle(el).transform);
      // scaleX(-1) results in matrix(-1, 0, 0, 1, 0, 0)
      expect(transform).toContain('-1');
    });

    test('clicking mirror button again removes the transform', async ({ page }) => {
      await enterTeleprompter(page);
      const container = page.locator('#teleprompter-container');

      // Toggle on
      await page.click('#mirror-btn');
      await expect(container).toHaveClass(/mirrored/);

      // Toggle off
      await page.click('#mirror-btn');
      await expect(container).not.toHaveClass(/mirrored/);
    });
  });

  test.describe('FR-2: Mirrored text is reversed on screen', () => {
    test('text container has scaleX(-1) when mirrored', async ({ page }) => {
      await enterTeleprompter(page);
      await page.click('#mirror-btn');

      const container = page.locator('#teleprompter-container');
      const transform = await container.evaluate(el => getComputedStyle(el).transform);
      // matrix(-1, 0, 0, 1, 0, 0) means horizontal flip
      expect(transform).toMatch(/matrix\(-1,\s*0,\s*0,\s*1,\s*0,\s*0\)/);
    });
  });

  test.describe('FR-3: Scrolling works in mirrored mode', () => {
    test('manual scroll still works when mirrored', async ({ page }) => {
      await enterTeleprompter(page);
      await page.click('#mirror-btn');

      const container = page.locator('#teleprompter-container');
      const initialScroll = await container.evaluate(el => el.scrollTop);

      // Start play mode scrolling
      await page.click('#play-pause-btn');
      // Wait for some scrolling to happen
      await page.waitForTimeout(1000);
      await page.click('#play-pause-btn'); // Pause

      const newScroll = await container.evaluate(el => el.scrollTop);
      expect(newScroll).toBeGreaterThan(initialScroll);
    });
  });

  test.describe('FR-4: Mirror setting persists in localStorage', () => {
    test('mirror state saves to localStorage', async ({ page }) => {
      await enterTeleprompter(page);

      // Enable mirror
      await page.click('#mirror-btn');

      // Check localStorage
      const stored = await page.evaluate(() => {
        const settings = JSON.parse(localStorage.getItem('teleprompter-settings') || '{}');
        return settings.mirrorEnabled;
      });
      expect(stored).toBe(true);
    });

    test('mirror state restores after exiting and re-entering teleprompter', async ({ page }) => {
      await enterTeleprompter(page);

      // Enable mirror
      await page.click('#mirror-btn');

      // Exit to editor
      await page.click('#exit-btn');
      await page.waitForSelector('#editor-view:not(.hidden)');

      // Re-enter teleprompter
      await page.click('#start-button');
      await page.waitForSelector('#teleprompter-view:not(.hidden)');

      // Mirror should still be on
      const container = page.locator('#teleprompter-container');
      await expect(container).toHaveClass(/mirrored/);
    });

    test('mirror state persists across page reloads', async ({ page }) => {
      await enterTeleprompter(page);

      // Enable mirror
      await page.click('#mirror-btn');

      // Reload the page
      await page.reload();
      await page.waitForSelector('#script-input');

      // Enter teleprompter again
      await page.fill('#script-input', SAMPLE_SCRIPT);
      await page.click('#start-button');
      await page.waitForSelector('#teleprompter-view:not(.hidden)');

      // Mirror should still be on from localStorage
      const container = page.locator('#teleprompter-container');
      await expect(container).toHaveClass(/mirrored/);
    });
  });

  test.describe('FR-5: Keyboard shortcut M toggles mirror mode', () => {
    test('pressing M key toggles mirror on', async ({ page }) => {
      await enterTeleprompter(page);

      await page.keyboard.press('m');

      const container = page.locator('#teleprompter-container');
      await expect(container).toHaveClass(/mirrored/);
    });

    test('pressing M key twice toggles mirror off', async ({ page }) => {
      await enterTeleprompter(page);

      await page.keyboard.press('m');
      await page.keyboard.press('m');

      const container = page.locator('#teleprompter-container');
      await expect(container).not.toHaveClass(/mirrored/);
    });
  });

  test.describe('FR-6: Mirror button visual indicator', () => {
    test('mirror button gets active class when enabled', async ({ page }) => {
      await enterTeleprompter(page);
      const btn = page.locator('#mirror-btn');

      await expect(btn).not.toHaveClass(/active/);

      await page.click('#mirror-btn');

      await expect(btn).toHaveClass(/active/);
    });
  });

  test.describe('NFR-1: Mirror toggle is instantaneous', () => {
    test('toggling mirror takes less than 50ms', async ({ page }) => {
      await enterTeleprompter(page);

      const elapsed = await page.evaluate(() => {
        const start = performance.now();
        document.getElementById('teleprompter-container').classList.toggle('mirrored', true);
        // Force layout recalc
        document.getElementById('teleprompter-container').getBoundingClientRect();
        return performance.now() - start;
      });

      expect(elapsed).toBeLessThan(50);
    });
  });

  test.describe('NFR-3: Reading marker position in mirror mode', () => {
    test('reading marker stays at ~33% from top when mirrored', async ({ page }) => {
      await enterTeleprompter(page);
      await page.click('#mirror-btn');

      const marker = page.locator('.reading-marker');
      const box = await marker.boundingBox();
      const viewportHeight = await page.evaluate(() => window.innerHeight);

      // Reading marker should be at approximately 33% from top
      const markerPercent = (box.y + box.height / 2) / viewportHeight;
      expect(markerPercent).toBeGreaterThan(0.25);
      expect(markerPercent).toBeLessThan(0.40);
    });
  });
});
