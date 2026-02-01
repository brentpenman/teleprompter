# Phase 9: Model Loading Infrastructure - Research

**Researched:** 2026-02-01
**Domain:** Browser-based large file management, IndexedDB, Web Crypto API, cross-origin isolation
**Confidence:** MEDIUM-HIGH

## Summary

Model loading infrastructure for Vosk requires coordinating several browser APIs: fetch with progress tracking for downloads, IndexedDB for caching 40MB models, Web Crypto API for SHA-256 validation, StorageManager API for quota management, and COOP/COEP headers for SharedArrayBuffer (required by Vosk WASM).

The standard approach uses native browser APIs without external dependencies. IndexedDB is the right choice for storing binary files this size (40MB), the Web Crypto API provides built-in SHA-256 hashing, and the StorageManager API enables proactive quota checking before downloads. The critical requirement is serving with COOP/COEP headers to enable SharedArrayBuffer, which Vosk's WebAssembly implementation needs for threading.

**Key challenges identified:**
- Safari iOS has tighter quota limits (500MB minimum, data eviction after 7 days without user interaction)
- Web Crypto API doesn't support streaming, requiring entire file in memory for hashing
- COOP/COEP headers must be configured correctly or SharedArrayBuffer will be unavailable
- vosk-browser package is unmaintained (last update 3 years ago) but functional

**Primary recommendation:** Use native browser APIs (IndexedDB, Web Crypto, StorageManager) with a lightweight wrapper for IndexedDB operations. Implement robust error handling for quota limits, validate cross-origin isolation before initializing Vosk, and test thoroughly on Safari iOS.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| IndexedDB API | Native | 40MB binary storage | Browser-native, designed for large files, supports offline |
| Web Crypto API | Native | SHA-256 validation | Browser-native, secure, async, no dependencies |
| Fetch API | Native | Model download with progress | Browser-native, ReadableStream for progress tracking |
| StorageManager API | Native | Quota checking | Browser-native, secure contexts only |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| idb | 8.x | IndexedDB wrapper | If team prefers promises over event handlers |
| Dexie.js | 4.x | IndexedDB wrapper | If need advanced features like migrations, reactive queries |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| IndexedDB | localStorage | 10MB limit, synchronous, not suitable for 40MB model |
| IndexedDB | OPFS | Newer API, good for very large files, less browser support |
| Native APIs | External library | Adds bundle size, IndexedDB wrappers add ~10-50KB |

**Installation:**
```bash
# Option 1: No dependencies (recommended for this phase)
# Use native browser APIs directly

# Option 2: With lightweight IndexedDB wrapper
npm install idb@^8.0.0

# Option 3: With full-featured wrapper
npm install dexie@^4.0.0
```

**Recommendation:** Start with native APIs. The complexity of IndexedDB for this use case (single object store, binary blob storage) doesn't justify a wrapper library. If transaction handling becomes cumbersome during implementation, add `idb` (8KB) rather than Dexie (50KB).

## Architecture Patterns

### Recommended Project Structure
```
src/
├── model/
│   ├── ModelLoader.js        # Orchestrates download, cache, validation
│   ├── ModelCache.js          # IndexedDB operations
│   ├── ModelDownloader.js     # Fetch with progress tracking
│   ├── ModelValidator.js      # SHA-256 hash verification
│   └── StorageQuota.js        # Quota checking and management
├── config/
│   └── modelConfig.js         # Model URL, hash, version
└── utils/
    └── crossOriginCheck.js    # Verify self.crossOriginIsolated
```

### Pattern 1: Download with Progress Tracking
**What:** Use Fetch API with ReadableStream to track download progress
**When to use:** Any large file download requiring user feedback
**Example:**
```javascript
// Source: MDN - Fetch API + javascript.info fetch-progress
async function downloadWithProgress(url, onProgress) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const contentLength = response.headers.get('content-length');
  if (!contentLength) {
    throw new Error('Content-Length header missing');
  }

  const total = parseInt(contentLength, 10);
  let loaded = 0;

  const reader = response.body.getReader();
  const chunks = [];

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;

    chunks.push(value);
    loaded += value.length;

    onProgress({
      loaded,
      total,
      percentage: Math.round((loaded / total) * 100)
    });
  }

  // Concatenate chunks into single Uint8Array
  const allChunks = new Uint8Array(loaded);
  let position = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }

  return allChunks.buffer;
}
```

**Important:** Jake Archibald noted in 2025 that fetch streams should NOT be used for upload progress (gives inaccurate results), but download progress tracking via ReadableStream is reliable.

### Pattern 2: IndexedDB Binary Storage
**What:** Store large binary files in IndexedDB without indexing the binary data
**When to use:** Caching models, assets, or any large binary content
**Example:**
```javascript
// Source: MDN IndexedDB API + Dexie.js best practices
class ModelCache {
  constructor(dbName = 'vosk-models', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('models')) {
          // Store: { id, name, version, hash, data, timestamp }
          // Only index metadata, NOT the binary data
          const store = db.createObjectStore('models', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('version', 'version', { unique: false });
          // Do NOT index 'data' field - it's 40MB binary
        }
      };
    });
  }

  async saveModel(id, name, version, hash, arrayBuffer) {
    const transaction = this.db.transaction(['models'], 'readwrite');
    const store = transaction.objectStore('models');

    const model = {
      id,
      name,
      version,
      hash,
      data: arrayBuffer,  // Store as ArrayBuffer
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const request = store.put(model);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        if (request.error.name === 'QuotaExceededError') {
          reject(new Error('Storage quota exceeded. Please free up space.'));
        } else {
          reject(request.error);
        }
      };
    });
  }

  async getModel(id) {
    const transaction = this.db.transaction(['models'], 'readonly');
    const store = transaction.objectStore('models');

    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteModel(id) {
    const transaction = this.db.transaction(['models'], 'readwrite');
    const store = transaction.objectStore('models');

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async listModels() {
    const transaction = this.db.transaction(['models'], 'readonly');
    const store = transaction.objectStore('models');

    return new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
```

**Critical:** Never index binary data itself. Only index metadata (name, version, hash). Indexing 40MB binary would cause severe performance degradation.

### Pattern 3: SHA-256 Validation
**What:** Hash downloaded model to verify integrity before caching
**When to use:** Any downloaded binary that needs integrity verification
**Example:**
```javascript
// Source: MDN SubtleCrypto.digest() + 2025 Uint8Array.toHex() update
async function validateModelHash(arrayBuffer, expectedHash) {
  // Hash the entire file (loaded into memory)
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);

  // Convert to hex string using 2025 method
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = hashArray.toHex(); // New in 2025!

  // Alternative for older browsers:
  // const hashHex = Array.from(hashArray)
  //   .map(b => b.toString(16).padStart(2, '0'))
  //   .join('');

  return hashHex === expectedHash.toLowerCase();
}
```

**Limitation:** Web Crypto API does NOT support streaming. Must load entire 40MB file into memory for hashing. This is acceptable for a 40MB model but keep in mind for larger files.

### Pattern 4: Storage Quota Management
**What:** Check available storage before downloading, handle quota errors gracefully
**When to use:** Before any large download or storage operation
**Example:**
```javascript
// Source: MDN StorageManager.estimate()
async function checkStorageQuota(requiredBytes) {
  if (!navigator.storage?.estimate) {
    // Fallback for browsers without StorageManager API
    console.warn('StorageManager API not available');
    return {
      hasSpace: true,  // Optimistic - proceed with download
      warning: 'Cannot verify storage quota on this browser'
    };
  }

  const estimate = await navigator.storage.estimate();
  const available = estimate.quota - estimate.usage;
  const percentUsed = (estimate.usage / estimate.quota) * 100;

  // Add 10% buffer for safety
  const safeRequired = requiredBytes * 1.1;

  return {
    hasSpace: available >= safeRequired,
    available,
    required: requiredBytes,
    percentUsed: Math.round(percentUsed),
    quota: estimate.quota,
    usage: estimate.usage
  };
}

// Usage before download
const MODEL_SIZE = 40 * 1024 * 1024; // 40MB
const quotaCheck = await checkStorageQuota(MODEL_SIZE);

if (!quotaCheck.hasSpace) {
  throw new Error(
    `Insufficient storage: ${quotaCheck.available / (1024*1024)}MB available, ` +
    `${MODEL_SIZE / (1024*1024)}MB required. ` +
    `Currently using ${quotaCheck.percentUsed}% of quota.`
  );
}
```

**Note:** Values from `estimate()` are imprecise due to compression and security. Add 10% buffer for safety.

### Pattern 5: Cross-Origin Isolation Check
**What:** Verify SharedArrayBuffer is available before initializing Vosk
**When to use:** Before loading any WASM module requiring SharedArrayBuffer
**Example:**
```javascript
// Source: MDN Window.crossOriginIsolated + web.dev COOP/COEP guide
function checkCrossOriginIsolation() {
  if (typeof crossOriginIsolated === 'undefined') {
    return {
      isolated: false,
      error: 'crossOriginIsolated property not available (old browser or insecure context)'
    };
  }

  if (!crossOriginIsolated) {
    return {
      isolated: false,
      error: 'Cross-origin isolation not enabled. COOP/COEP headers required for SharedArrayBuffer.'
    };
  }

  // Additional check: verify SharedArrayBuffer is actually available
  try {
    new SharedArrayBuffer(1);
    return { isolated: true };
  } catch (e) {
    return {
      isolated: false,
      error: `SharedArrayBuffer not available: ${e.message}`
    };
  }
}

// Usage at app initialization
const isolationCheck = checkCrossOriginIsolation();
if (!isolationCheck.isolated) {
  console.error('Cannot initialize Vosk:', isolationCheck.error);
  // Show user-friendly error about HTTPS and configuration
}
```

### Pattern 6: Complete Model Loader Orchestration
**What:** Coordinate download, validation, caching with proper error handling
**When to use:** High-level model loading logic
**Example:**
```javascript
class ModelLoader {
  constructor(cache, downloader, validator) {
    this.cache = cache;
    this.downloader = downloader;
    this.validator = validator;
  }

  async loadModel(modelConfig, onProgress) {
    // 1. Check if model exists in cache
    const cached = await this.cache.getModel(modelConfig.id);
    if (cached && cached.hash === modelConfig.hash) {
      console.log('Model loaded from cache');
      onProgress?.({ status: 'cached', loaded: 100, total: 100 });
      return cached.data;
    }

    // 2. Check storage quota before downloading
    onProgress?.({ status: 'checking-quota' });
    const quotaCheck = await checkStorageQuota(modelConfig.size);
    if (!quotaCheck.hasSpace) {
      throw new Error(
        `Insufficient storage. Available: ${Math.round(quotaCheck.available / (1024*1024))}MB, ` +
        `Required: ${Math.round(modelConfig.size / (1024*1024))}MB`
      );
    }

    // 3. Download model
    onProgress?.({ status: 'downloading', loaded: 0, total: modelConfig.size });
    const arrayBuffer = await this.downloader.download(
      modelConfig.url,
      (progress) => onProgress?.({
        status: 'downloading',
        ...progress
      })
    );

    // 4. Validate hash
    onProgress?.({ status: 'validating' });
    const isValid = await this.validator.validate(arrayBuffer, modelConfig.hash);
    if (!isValid) {
      throw new Error('Model validation failed: hash mismatch');
    }

    // 5. Cache model
    onProgress?.({ status: 'caching' });
    try {
      await this.cache.saveModel(
        modelConfig.id,
        modelConfig.name,
        modelConfig.version,
        modelConfig.hash,
        arrayBuffer
      );
    } catch (error) {
      if (error.message.includes('quota')) {
        // Non-fatal: model downloaded and validated, just not cached
        console.warn('Failed to cache model (quota exceeded):', error);
      } else {
        throw error;
      }
    }

    onProgress?.({ status: 'complete' });
    return arrayBuffer;
  }

  async clearCache() {
    const models = await this.cache.listModels();
    for (const id of models) {
      await this.cache.deleteModel(id);
    }
  }
}
```

### Anti-Patterns to Avoid
- **Indexing binary data:** Never create IndexedDB indexes on 40MB binary fields - performance death
- **Synchronous operations:** Don't use localStorage or synchronous file operations for large files
- **Chunked hashing workarounds:** Web Crypto doesn't support streaming; don't try to manually implement chunked SHA-256 (complex, error-prone, not worth it for 40MB)
- **Assuming quota availability:** Always check quota before downloads, even if previous downloads succeeded
- **Forgetting CORS:** Model CDN must serve `Access-Control-Allow-Origin` header or downloads fail

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 hashing | Custom hash implementation | Web Crypto API `crypto.subtle.digest()` | Browser-native, optimized, secure, async |
| IndexedDB promises | Manual promise wrappers | Native IndexedDB or `idb` library | Complex error handling, transaction lifecycle, already solved |
| Storage quota | Estimate with heuristics | StorageManager API `navigator.storage.estimate()` | Browser knows actual limits, handles compression |
| Cross-origin isolation detection | Parse headers manually | `self.crossOriginIsolated` property | Browser-native, reliable, simpler |
| Fetch progress | Custom XHR wrapper | Fetch API with ReadableStream | Modern, cleaner, handles backpressure |

**Key insight:** Browser APIs for storage and crypto are production-ready and well-tested. Prefer native over custom implementations or heavy libraries. The 40MB model size is well within what these APIs are designed to handle.

## Common Pitfalls

### Pitfall 1: Safari iOS Storage Eviction
**What goes wrong:** Model cached successfully but disappears after 7 days without user interaction
**Why it happens:** Safari iOS aggressively evicts script-writable storage when cross-site tracking prevention is enabled and no user interaction occurs
**How to avoid:**
- Implement "model missing" detection on every app load
- Re-download automatically in background if model missing
- Consider requesting persistent storage: `navigator.storage.persist()`
- Document to users that model may need re-download if app unused for a week
**Warning signs:** Users report "downloading model again" even though they downloaded it before

### Pitfall 2: QuotaExceededError After Successful Quota Check
**What goes wrong:** Quota check passes, but IndexedDB write throws QuotaExceededError
**Why it happens:**
- Multiple tabs writing simultaneously
- Browser compressed existing data, estimate() was imprecise
- iOS Safari has dynamic quotas that change based on available device storage
**How to avoid:**
- Add 10-20% buffer to quota checks (don't assume exact capacity)
- Wrap all IndexedDB writes in try-catch for QuotaExceededError
- Provide user-actionable error message with "Clear cache" option
- Consider showing available storage in settings
**Warning signs:** Intermittent quota errors that don't reproduce consistently

### Pitfall 3: COOP/COEP Headers Missing or Misconfigured
**What goes wrong:** Vosk initialization fails with "SharedArrayBuffer is not defined"
**Why it happens:**
- Headers not set on server
- Headers set on HTML but not on worker scripts
- Using HTTP instead of HTTPS (COOP/COEP require secure context)
**How to avoid:**
- Check `self.crossOriginIsolated === true` before loading Vosk
- Show clear error to developers: "HTTPS and COOP/COEP headers required"
- Test in production-like environment (headers often missing in dev)
- Validate headers in Network tab: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`
**Warning signs:** Works in development but fails in production, "SharedArrayBuffer is not defined" error

### Pitfall 4: Missing Content-Length Header Breaks Progress
**What goes wrong:** Download works but progress shows 0%/unknown instead of percentage
**Why it happens:** CDN or server doesn't send `Content-Length` header, often due to compression middleware
**How to avoid:**
- Verify model CDN includes `Content-Length` header
- Provide fallback UI for indeterminate progress (spinner instead of percentage)
- Document expected model size in config as fallback
- Test against actual CDN, not local server
**Warning signs:** Progress callback fires but `total` is null or 0

### Pitfall 5: CORS Errors on Model CDN
**What goes wrong:** fetch() fails with "blocked by CORS policy"
**Why it happens:** Model hosted on different origin without `Access-Control-Allow-Origin` header
**How to avoid:**
- Ensure model CDN serves `Access-Control-Allow-Origin: *` or specific origin
- Test fetch in console before implementing: `fetch('model-url').then(r => console.log(r.headers.get('access-control-allow-origin')))`
- Consider self-hosting model if CORS cannot be configured
- Document CORS requirement if users host their own models
**Warning signs:** Network tab shows OPTIONS preflight request failing

### Pitfall 6: Hash Validation Memory Spike
**What goes wrong:** Browser becomes unresponsive or crashes when hashing 40MB model
**Why it happens:** Loading entire model into memory for hashing, plus existing page memory usage
**How to avoid:**
- Perform hash validation immediately after download, before other operations
- Consider offloading to Web Worker if UI responsiveness is critical
- Monitor memory usage in dev tools during testing
- Add warning for low-memory devices
**Warning signs:** Mobile browsers crash or reload page during validation

### Pitfall 7: Model Version Mismatch
**What goes wrong:** Old cached model used with new app version, causing recognition errors
**Why it happens:** Cache check only validates hash exists, not whether it's the current version
**How to avoid:**
- Include model version in cache key (e.g., `vosk-en-small-v0.22`)
- Check both `id` and `hash` when loading from cache
- Implement cache migration strategy for version updates
- Add "Clear old models" logic when app detects version upgrade
**Warning signs:** Recognition quality degrades after app update

## Code Examples

All examples provided inline in Architecture Patterns section above.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| XMLHttpRequest for downloads | Fetch API with ReadableStream | ~2015-2017 | Cleaner async/await, progress tracking, streaming |
| Manual promise wrappers for IndexedDB | Native IndexedDB or `idb` library | ~2018-2020 | Better error handling, simpler code |
| `COEP: require-corp` only | `COEP: credentialless` option | ~2023 | Easier CORS handling, but Safari unsupported |
| Array.from().map().join() for hex | `Uint8Array.toHex()` | 2025 | Simpler, faster hash-to-string conversion |

**Deprecated/outdated:**
- **XMLHttpRequest:** Use Fetch API instead
- **localStorage for models:** 10MB limit, use IndexedDB
- **Manual chunked SHA-256:** Web Crypto doesn't support streaming anyway; just load file into memory
- **Service Worker for quota estimation:** Use StorageManager API

**Current best practices (2025):**
- Native browser APIs preferred over libraries for storage/crypto
- `COEP: credentialless` for easier CORS but fallback to `require-corp` for Safari
- Check `self.crossOriginIsolated` before initializing WASM with SharedArrayBuffer
- Request persistent storage on first use for PWA-like behavior

## Open Questions

Things that couldn't be fully resolved:

1. **vosk-browser maintenance status**
   - What we know: Package unmaintained for 3 years, last update 2021-2022
   - What's unclear: Will it work with future browser updates? Any known issues?
   - Recommendation: Monitor for issues, consider forking if critical bugs found, have migration plan

2. **Safari iOS quota behavior across devices**
   - What we know: Minimum 500MB quota, up to 80% disk on iOS 17+, 7-day eviction
   - What's unclear: Exact behavior on different iOS versions, does `persist()` help?
   - Recommendation: Test on real iOS devices, implement re-download fallback, document known limitations

3. **Optimal model serving strategy**
   - What we know: CDN needs CORS headers, GitHub releases break preflight
   - What's unclear: Best CDN provider for model hosting? Self-host vs CDN tradeoffs?
   - Recommendation: Start with self-hosting for control, migrate to CDN if bandwidth becomes issue

4. **Memory constraints on low-end mobile**
   - What we know: 40MB model + 40MB validation + page memory could be tight on 2GB devices
   - What's unclear: At what memory threshold do problems occur?
   - Recommendation: Test on low-end Android devices, add Web Worker for validation if needed

5. **COEP credentialless vs require-corp**
   - What we know: `credentialless` easier but Safari unsupported
   - What's unclear: Will Safari ever support it? What's adoption timeline?
   - Recommendation: Use `require-corp` for maximum compatibility, revisit in 6-12 months

## Sources

### Primary (HIGH confidence)
- MDN IndexedDB API - https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- MDN SubtleCrypto.digest() - https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
- MDN StorageManager.estimate() - https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
- MDN Window.crossOriginIsolated - https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated
- web.dev COOP/COEP guide - https://web.dev/articles/coop-coep (verified via WebFetch)

### Secondary (MEDIUM confidence)
- RxDB IndexedDB best practices - https://rxdb.info/articles/indexeddb-max-storage-limit.html (2025, community-driven)
- javascript.info Fetch progress - https://javascript.info/fetch-progress (tutorial, well-maintained)
- WebKit Storage Policy updates - https://webkit.org/blog/14403/updates-to-storage-policy/ (official, iOS 17+ specifics)
- Dexie.js documentation on large binary files - https://medium.com/dexie-js/keep-storing-large-images-just-dont-index-the-binary-data-itself-10b9d9c5c5d7

### Tertiary (LOW confidence - flagged for validation)
- vosk-browser API patterns - Multiple WebSearch results, npm package unmaintained
- Safari iOS 500MB quota minimum - Community reports, needs device testing
- CORS CDN configuration - General web search results, needs verification with actual CDN

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Native browser APIs well-documented, stable
- Architecture: HIGH - Patterns verified from MDN, web.dev, established practices
- Pitfalls: MEDIUM-HIGH - Most from official sources (Safari storage policy), some from community reports (need validation)
- vosk-browser specifics: LOW-MEDIUM - Package unmaintained, documentation sparse, relying on community examples

**Research date:** 2026-02-01
**Valid until:** 60 days (stable browser APIs, slow-moving domain)

**Testing priorities:**
1. Safari iOS quota and eviction behavior (HIGH - documented but needs real device testing)
2. COOP/COEP header configuration (HIGH - critical blocker if wrong)
3. Low-memory mobile devices (MEDIUM - 40MB might be tight)
4. Model CDN CORS configuration (MEDIUM - common gotcha)

**Recommended verification during planning:**
- Check current vosk-browser issues on GitHub for known problems
- Verify sha256 hash format vosk-browser expects (if any)
- Confirm model URL and expected size (40MB assumption based on requirements)
- Identify if existing HTTPS server setup already includes COOP/COEP headers
