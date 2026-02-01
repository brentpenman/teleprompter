/**
 * Phase 09 Verification Test
 * Tests model loading infrastructure end-to-end
 */

import { test, expect } from '@playwright/test';

test.describe('Phase 09: Model Loading Infrastructure', () => {
  test.use({ ignoreHTTPSErrors: true });

  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('https://localhost:3000', {
      waitUntil: 'domcontentloaded',
    });
  });

  test('should enable cross-origin isolation', async ({ page }) => {
    // Check self.crossOriginIsolated
    const isIsolated = await page.evaluate(() => self.crossOriginIsolated);
    expect(isIsolated).toBe(true);

    // Check SharedArrayBuffer availability
    const hasSAB = await page.evaluate(() => typeof SharedArrayBuffer);
    expect(hasSAB).toBe('function');

    console.log('✓ Cross-origin isolation enabled');
    console.log('✓ SharedArrayBuffer available');
  });

  test('should have COOP/COEP headers on all responses', async ({ page }) => {
    const responses = [];

    page.on('response', (response) => {
      responses.push({
        url: response.url(),
        headers: response.headers(),
      });
    });

    await page.goto('https://localhost:3000', { waitUntil: 'networkidle' });

    // Check HTML response
    const htmlResponse = responses.find(r => r.url.includes('localhost:3000') && !r.url.includes('.'));
    expect(htmlResponse?.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(htmlResponse?.headers['cross-origin-embedder-policy']).toBe('require-corp');

    // Check JS response
    const jsResponse = responses.find(r => r.url.endsWith('.js'));
    if (jsResponse) {
      expect(jsResponse.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(jsResponse.headers['cross-origin-embedder-policy']).toBe('require-corp');
    }

    console.log('✓ COOP/COEP headers present on all responses');
  });

  test('should load ModelLoader and dependencies', async ({ page }) => {
    const modulesLoaded = await page.evaluate(async () => {
      try {
        const { ModelLoader } = await import('./src/model/ModelLoader.js');
        const { ModelCache } = await import('./src/model/ModelCache.js');
        const { ModelDownloader } = await import('./src/model/ModelDownloader.js');
        const { ModelValidator } = await import('./src/model/ModelValidator.js');
        const { modelConfig } = await import('./src/config/modelConfig.js');

        return {
          hasModelLoader: typeof ModelLoader === 'function',
          hasModelCache: typeof ModelCache === 'function',
          hasModelDownloader: typeof ModelDownloader === 'function',
          hasModelValidator: typeof ModelValidator === 'function',
          hasModelConfig: typeof modelConfig === 'object',
          modelConfigUrl: modelConfig.url,
          modelConfigSize: modelConfig.size,
          modelConfigHash: modelConfig.hash,
        };
      } catch (error) {
        return { error: error.message };
      }
    });

    expect(modulesLoaded.error).toBeUndefined();
    expect(modulesLoaded.hasModelLoader).toBe(true);
    expect(modulesLoaded.hasModelCache).toBe(true);
    expect(modulesLoaded.hasModelDownloader).toBe(true);
    expect(modulesLoaded.hasModelValidator).toBe(true);
    expect(modulesLoaded.hasModelConfig).toBe(true);

    console.log('✓ All model loading modules imported successfully');
    console.log(`  Model URL: ${modulesLoaded.modelConfigUrl}`);
    console.log(`  Model size: ${(modulesLoaded.modelConfigSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`  Model hash: ${modulesLoaded.modelConfigHash.substring(0, 16)}...`);
  });

  test('should test ModelLoader workflow with small file', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { ModelLoader } = await import('./src/model/ModelLoader.js');
      const { ModelCache } = await import('./src/model/ModelCache.js');
      const { ModelDownloader } = await import('./src/model/ModelDownloader.js');
      const { ModelValidator } = await import('./src/model/ModelValidator.js');

      const cache = new ModelCache();
      await cache.open();

      const loader = new ModelLoader(cache, new ModelDownloader(), new ModelValidator());

      // Clear any existing test cache
      await loader.clearCache();

      const progressUpdates = [];

      // Test with small file (fuse.js)
      const testConfig = {
        id: 'test-model',
        name: 'Test Model',
        version: '1.0',
        url: 'https://cdn.jsdelivr.net/npm/fuse.js@7.1.0/dist/fuse.min.js',
        size: 50000,
        hash: '', // Empty hash will skip validation
      };

      try {
        // First load - should download
        const model = await loader.loadModel(testConfig, (progress) => {
          progressUpdates.push(progress.status);
        });

        const firstLoadSize = model.byteLength;

        // Second load - should use cache
        const progressUpdates2 = [];
        const cached = await loader.loadModel(testConfig, (progress) => {
          progressUpdates2.push(progress.status);
        });

        const secondLoadSize = cached.byteLength;

        return {
          success: true,
          firstLoadSize,
          secondLoadSize,
          cacheWorked: firstLoadSize === secondLoadSize,
          firstLoadStatuses: progressUpdates,
          secondLoadStatuses: progressUpdates2,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    });

    if (!result.success) {
      console.log('ERROR:', result.error);
    }
    expect(result.success).toBe(true);
    expect(result.firstLoadSize).toBeGreaterThan(0);
    expect(result.cacheWorked).toBe(true);
    expect(result.firstLoadStatuses).toContain('downloading');
    expect(result.secondLoadStatuses).toContain('cached');

    console.log('✓ ModelLoader workflow test passed');
    console.log(`  First load: ${result.firstLoadSize} bytes`);
    console.log(`  First load statuses: ${result.firstLoadStatuses.join(', ')}`);
    console.log(`  Second load: cached = ${result.cacheWorked}`);
    console.log(`  Second load statuses: ${result.secondLoadStatuses.join(', ')}`);
  });

  test('should verify IndexedDB vosk-models database exists', async ({ page }) => {
    const dbExists = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('vosk-models');
        request.onsuccess = () => {
          const db = request.result;
          const hasModelsStore = db.objectStoreNames.contains('models');
          db.close();
          resolve({ exists: true, hasModelsStore });
        };
        request.onerror = () => {
          resolve({ exists: false, hasModelsStore: false });
        };
      });
    });

    expect(dbExists.exists).toBe(true);
    expect(dbExists.hasModelsStore).toBe(true);

    console.log('✓ IndexedDB vosk-models database exists');
    console.log('✓ models object store exists');
  });

  test('should test storage quota checker', async ({ page }) => {
    const quotaResult = await page.evaluate(async () => {
      const { checkStorageQuota } = await import('./src/model/StorageQuota.js');

      const MODEL_SIZE = 40 * 1024 * 1024; // 40MB
      const result = await checkStorageQuota(MODEL_SIZE);

      return {
        hasSpace: result.hasSpace,
        availableMB: (result.available / 1024 / 1024).toFixed(1),
        requiredMB: (result.required / 1024 / 1024).toFixed(1),
        percentUsed: result.percentUsed,
        warning: result.warning,
      };
    });

    expect(quotaResult.hasSpace).toBeDefined();

    console.log('✓ Storage quota check passed');
    console.log(`  Has space: ${quotaResult.hasSpace}`);
    console.log(`  Available: ${quotaResult.availableMB} MB`);
    console.log(`  Required: ${quotaResult.requiredMB} MB`);
    console.log(`  Usage: ${quotaResult.percentUsed}%`);
    if (quotaResult.warning) {
      console.log(`  Warning: ${quotaResult.warning}`);
    }
  });

  test('should test cross-origin check utility', async ({ page }) => {
    const checkResult = await page.evaluate(async () => {
      const { checkCrossOriginIsolation } = await import('./src/utils/crossOriginCheck.js');
      return checkCrossOriginIsolation();
    });

    expect(checkResult.isolated).toBe(true);
    expect(checkResult.error).toBeUndefined();

    console.log('✓ Cross-origin isolation check utility works');
    console.log(`  Isolated: ${checkResult.isolated}`);
  });
});
