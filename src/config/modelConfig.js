/**
 * Model Configuration - Metadata for Vosk speech recognition model
 *
 * Defines URL, hash, size, and version for the model used in browser-based recognition.
 * The small English model is ~40MB and optimized for web use.
 */

export const modelConfig = {
  // Model identification
  id: 'vosk-model-small-en-us-0.15',
  name: 'Vosk Small English US',
  version: '0.15',
  language: 'en-US',

  // Download configuration
  // Direct URL (alphacephei.com has CORS enabled)
  // For local dev with server: use '/api/model-proxy?url=' + encodeURIComponent(directUrl)
  url: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
  size: 40 * 1024 * 1024,  // ~40MB (approximate)

  // Integrity validation
  // SHA-256 hash computed from actual model file (39.30 MB)
  // This hash is used by ModelValidator to verify download integrity
  hash: '30f26242c4eb449f948e42cb302dd7a686cb29a3423a8367f99ff41780942498',

  // Metadata
  description: 'Lightweight English model for browser-based recognition'
};
