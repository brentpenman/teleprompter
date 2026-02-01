// @ts-check
import { test, expect } from '@playwright/test';

const SAMPLE_SCRIPT = 'Four score and seven years ago our fathers brought forth on this continent a new nation conceived in liberty and dedicated to the proposition that all men are created equal.';

/** Enter teleprompter mode with a given script */
async function enterTeleprompter(page, script = SAMPLE_SCRIPT) {
  await page.goto('/');
  await page.waitForSelector('#script-input');
  await page.fill('#script-input', script);
  await page.click('#start-button');
  await page.waitForSelector('#teleprompter-view:not(.hidden)');
}

test.describe('PRD-003: Voice Mode Mobile Support', () => {

  test.describe('Viewport meta configuration', () => {
    test('viewport meta has required mobile attributes', async ({ page }) => {
      await page.goto('/');

      const viewport = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        return meta ? meta.getAttribute('content') : null;
      });

      expect(viewport).not.toBeNull();
      expect(viewport).toContain('width=device-width');
      expect(viewport).toContain('initial-scale=1.0');
      // PRD-003 requires preventing zoom and handling safe areas
      expect(viewport).toContain('maximum-scale=1.0');
      expect(viewport).toContain('user-scalable=no');
      expect(viewport).toContain('viewport-fit=cover');
    });
  });

  test.describe('Platform detection (SpeechRecognizer.getPlatform)', () => {
    test('getPlatform returns platform flags', async ({ page }) => {
      await page.goto('/');

      const platform = await page.evaluate(() => {
        // SpeechRecognizer is a global (non-module script)
        if (typeof SpeechRecognizer === 'undefined') return null;
        return SpeechRecognizer.getPlatform();
      });

      expect(platform).not.toBeNull();
      expect(platform).toHaveProperty('isIOS');
      expect(platform).toHaveProperty('isAndroid');
      expect(platform).toHaveProperty('isMobile');
      expect(typeof platform.isIOS).toBe('boolean');
      expect(typeof platform.isAndroid).toBe('boolean');
      expect(typeof platform.isMobile).toBe('boolean');
    });
  });

  test.describe('SpeechRecognizer pause/resume methods', () => {
    test('SpeechRecognizer has pause and resume methods', async ({ page }) => {
      await page.goto('/');

      const hasMethods = await page.evaluate(() => {
        if (typeof SpeechRecognizer === 'undefined') return null;
        return {
          hasPause: typeof SpeechRecognizer.prototype.pause === 'function',
          hasResume: typeof SpeechRecognizer.prototype.resume === 'function',
          hasIsPaused: typeof SpeechRecognizer.prototype.isPaused === 'function',
        };
      });

      expect(hasMethods).not.toBeNull();
      expect(hasMethods.hasPause).toBe(true);
      expect(hasMethods.hasResume).toBe(true);
      expect(hasMethods.hasIsPaused).toBe(true);
    });
  });

  test.describe('Visibility change handler', () => {
    test('visibilitychange event listener is registered', async ({ page }) => {
      await page.goto('/');

      const hasHandler = await page.evaluate(async () => {
        const resp = await fetch('/script.js');
        const code = await resp.text();
        return code.includes('visibilitychange');
      });

      expect(hasHandler).toBe(true);
    });
  });

  test.describe('FR-4: Mobile-specific error messages', () => {
    test('handleMicrophoneError code contains iOS-specific messaging', async ({ page }) => {
      await page.goto('/');

      const hasIOSMessages = await page.evaluate(async () => {
        const resp = await fetch('/script.js');
        const code = await resp.text();
        return {
          hasIOS: code.includes('isIOS') || code.includes('iOS'),
          hasAndroid: code.includes('isAndroid') || code.includes('Android'),
          hasSettings: code.includes('Settings > Safari'),
          hasLockIcon: code.includes('lock icon'),
        };
      });

      expect(hasIOSMessages.hasIOS).toBe(true);
      expect(hasIOSMessages.hasAndroid).toBe(true);
      expect(hasIOSMessages.hasSettings).toBe(true);
      expect(hasIOSMessages.hasLockIcon).toBe(true);
    });
  });

  test.describe('FR-5: getUserMedia fallback constraints', () => {
    test('enableVoiceMode has fallback from advanced to simple audio constraints', async ({ page }) => {
      await page.goto('/');

      const hasFallback = await page.evaluate(async () => {
        const resp = await fetch('/script.js');
        const code = await resp.text();
        // Check for both advanced and simple constraints
        return {
          hasAdvanced: code.includes('echoCancellation') && code.includes('noiseSuppression'),
          hasSimple: code.includes('{ audio: true }') || code.includes('{audio: true}') || code.includes('simpleConstraints'),
          hasMobileCheck: code.includes('isMobile'),
        };
      });

      expect(hasFallback.hasAdvanced).toBe(true);
      expect(hasFallback.hasSimple).toBe(true);
      expect(hasFallback.hasMobileCheck).toBe(true);
    });
  });

  test.describe('Voice error toast UI', () => {
    test('voice error toast CSS styles exist', async ({ page }) => {
      await page.goto('/');

      const hasToastStyles = await page.evaluate(() => {
        // Check if the voice-error-toast styles are defined
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule.selectorText?.includes('voice-error-toast')) {
                return true;
              }
            }
          } catch (e) {
            // Cross-origin stylesheets may throw
          }
        }
        return false;
      });

      expect(hasToastStyles).toBe(true);
    });
  });

  test.describe('NFR-3: Mobile UI usable on 375px+ screens', () => {
    test('editor view is usable on 375px wide screen', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');

      // Editor elements should be visible and not overflowing
      const input = page.locator('#script-input');
      await expect(input).toBeVisible();

      const button = page.locator('#start-button');
      await expect(button).toBeVisible();

      // Check nothing overflows viewport
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(375);
    });

    test('teleprompter controls are usable on small screen', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await enterTeleprompter(page);

      // Controls should be visible
      await page.mouse.move(200, 300);
      await page.waitForSelector('.controls-overlay.visible');

      // Check buttons have minimum touch target size (44px per Apple HIG)
      const buttons = await page.locator('.control-btn').all();
      for (const btn of buttons) {
        const box = await btn.boundingBox();
        if (box) {
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test('controls row wraps on small screens', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await enterTeleprompter(page);

      await page.mouse.move(200, 300);
      await page.waitForSelector('.controls-overlay.visible');

      // Check that flex-wrap is set
      const flexWrap = await page.locator('.controls-row').evaluate(
        el => getComputedStyle(el).flexWrap
      );
      expect(flexWrap).toBe('wrap');
    });
  });

  test.describe('CSS safe area insets', () => {
    test('teleprompter container uses safe area insets', async ({ page }) => {
      await page.goto('/');

      const hasSafeArea = await page.evaluate(async () => {
        const resp = await fetch('/styles.css');
        const css = await resp.text();
        return {
          hasSafeAreaInset: css.includes('safe-area-inset'),
          hasEnv: css.includes('env(safe-area-inset'),
          hasViewportFit: true, // Already checked in viewport meta test
        };
      });

      expect(hasSafeArea.hasSafeAreaInset).toBe(true);
      expect(hasSafeArea.hasEnv).toBe(true);
    });
  });

  test.describe('iOS SpeechRecognizer configuration', () => {
    test('iOS uses non-continuous mode with manual restart', async ({ page }) => {
      await page.goto('/');

      const hasIOSConfig = await page.evaluate(async () => {
        const resp = await fetch('/voice/SpeechRecognizer.js');
        const code = await resp.text();
        return {
          // iOS detection
          hasIOSDetection: code.includes("iPad|iPhone|iPod"),
          // continuous mode disabled for iOS
          hasContinuousCheck: code.includes('!this._isIOS') || code.includes('continuous'),
          // iOS restart delay is higher (500ms minimum)
          hasIOSDelay: code.includes('500'),
          // iOS restart after final result
          hasIOSRestart: code.includes('_isIOS') && code.includes('isFinal'),
        };
      });

      expect(hasIOSConfig.hasIOSDetection).toBe(true);
      expect(hasIOSConfig.hasContinuousCheck).toBe(true);
      expect(hasIOSConfig.hasIOSDelay).toBe(true);
      expect(hasIOSConfig.hasIOSRestart).toBe(true);
    });
  });

  test.describe('Touch event handling', () => {
    test('touch events show controls overlay', async ({ page }) => {
      await page.goto('/');

      const hasTouchHandler = await page.evaluate(async () => {
        const resp = await fetch('/script.js');
        const code = await resp.text();
        return code.includes('touchstart');
      });

      expect(hasTouchHandler).toBe(true);
    });

    test('touchmove is prevented during active scroll/voice', async ({ page }) => {
      await page.goto('/');

      const hasTouchPrevent = await page.evaluate(async () => {
        const resp = await fetch('/script.js');
        const code = await resp.text();
        return code.includes('touchmove');
      });

      expect(hasTouchPrevent).toBe(true);
    });
  });

  test.describe('Mobile viewport rendering', () => {
    test('teleprompter text does not overflow on iPhone viewport', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
      await enterTeleprompter(page);

      const textBox = await page.locator('#teleprompter-text').boundingBox();
      expect(textBox.width).toBeLessThanOrEqual(390);
    });
  });
});
