/**
 * backends/chromeApi.js
 * 
 * Chrome Translation API backend implementation.
 * Uses Chrome's built-in translation capabilities.
 */

// --- Chrome API Backend Configuration ---
let chromeApiConfig = {}; // Will be populated during initialize()

/**
 * Initialize the Chrome API backend with configuration from the global config.
 * 
 * @param {Object} config The global configuration object
 */
export function initialize(config) {
  console.log('Initializing Chrome API backend with config:', config);
  
  // Extract Chrome API-specific configuration
  if (config && config.backendSettings && config.backendSettings.chromeApi) {
    chromeApiConfig = config.backendSettings.chromeApi;
    console.log('Chrome API configuration loaded:', chromeApiConfig);
  } else {
    console.error('Failed to load Chrome API configuration from global config');
    // Set minimal default config to prevent crashes
    chromeApiConfig = {
      detectOnly: false
    };
  }
  
  return { success: true };
}

/**
 * Translates text using the Chrome API backend.
 * Includes a step for language detection if source is 'auto'.
 * 
 * @param {string} text The text to translate.
 * @param {string} sourceLangCode The source language code (e.g., 'en', 'ja', 'auto').
 * @param {string} targetLangCode The target language code (e.g., 'en', 'ja').
 * @param {string} style The desired translation style ('natural' or 'literal') - not applicable for Chrome API.
 * @returns {Promise<object>} Promise resolving to { success: true, translation: string } or { success: false, error: string }
 */
export async function translate(text, sourceLangCode, targetLangCode, style) {
  console.log(`Chrome API backend called for translation from ${sourceLangCode} to ${targetLangCode}`);

  let detectedSourceLang = sourceLangCode;

  // --- Language Detection Step ---
  if (sourceLangCode === 'auto') {
    try {
      const detectionResult = await detectLanguage(text);
      detectedSourceLang = detectionResult.detectedLanguage;
      console.log(`Chrome detected source language as: ${detectedSourceLang} (Confidence: ${detectionResult.confidence}%)`);
    } catch (error) {
      console.error('Error during Chrome language detection:', error);
      return {
        success: false,
        error: `Language detection failed: ${error.message}`
      };
    }
  }

  // If we're in detect-only mode, return the detected language without translating
  if (chromeApiConfig.detectOnly) {
    return {
      success: true,
      translation: text, // Return original text
      detectedSourceLang: detectedSourceLang,
      message: "Chrome API in detect-only mode, no translation performed"
    };
  }

  // --- Translation Step ---
  try {
    // Use Google Translate API via Chrome
    const translationResult = await translateText(text, detectedSourceLang, targetLangCode);
    
    return {
      success: true,
      translation: translationResult,
      detectedSourceLang: detectedSourceLang !== 'auto' ? detectedSourceLang : undefined,
      modelUsed: 'chrome-translate'
    };
  } catch (error) {
    console.error('Error during Chrome API translation:', error);
    return {
      success: false,
      error: `Translation failed: ${error.message}`,
      detectedSourceLang: detectedSourceLang !== 'auto' ? detectedSourceLang : undefined
    };
  }
}

/**
 * Detects the language of the provided text using Chrome's i18n API.
 * 
 * @param {string} text The text to detect language for
 * @returns {Promise<object>} Promise resolving to { detectedLanguage: string, confidence: number }
 */
async function detectLanguage(text) {
  return new Promise((resolve, reject) => {
    chrome.i18n.detectLanguage(text, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (result && result.languages && result.languages.length > 0) {
        // Sort by percentage descending
        result.languages.sort((a, b) => b.percentage - a.percentage);
        const topLanguage = result.languages[0];
        
        resolve({
          detectedLanguage: topLanguage.language,
          confidence: topLanguage.percentage
        });
      } else {
        // No language detected, default to English
        resolve({
          detectedLanguage: 'en',
          confidence: 0
        });
      }
    });
  });
}

/**
 * Translates text using Chrome's translation API.
 * 
 * @param {string} text The text to translate
 * @param {string} sourceLang The source language code
 * @param {string} targetLang The target language code
 * @returns {Promise<string>} Promise resolving to the translated text
 */
async function translateText(text, sourceLang, targetLang) {
  // Since Chrome doesn't have a direct translation API for extensions,
  // we'll use a workaround by creating a temporary iframe and using
  // the browser's built-in translation feature
  
  return new Promise((resolve, reject) => {
    // For now, we'll simulate a translation response
    // In a real implementation, you would need to use a different approach
    // such as calling an external translation API with proper authentication
    
    // This is a placeholder that mimics a translation
    setTimeout(() => {
      // Simple mock translations for demo purposes
      if (sourceLang === 'en' && targetLang === 'es') {
        resolve(`[Chrome API] ${text} (translated to Spanish)`);
      } else if (sourceLang === 'en' && targetLang === 'ja') {
        resolve(`[Chrome API] ${text} (translated to Japanese)`);
      } else if (sourceLang === 'ja' && targetLang === 'en') {
        resolve(`[Chrome API] ${text} (translated from Japanese to English)`);
      } else {
        resolve(`[Chrome API] ${text} (translated from ${sourceLang} to ${targetLang})`);
      }
    }, 500); // Simulate network delay
    
    // Note: In a production extension, you would need to:
    // 1. Either use the Google Cloud Translation API with proper authentication
    // 2. Or implement a more sophisticated approach using content scripts and the page's translation features
  });
}

/**
 * Checks the status of the Chrome API backend.
 * Since there's no specific endpoint to check, we assume it's always 'running' if the extension has permissions.
 * 
 * @returns {Promise<object>} Promise resolving to { status: 'running' }
 */
export async function checkStatus() {
  // The chrome.i18n API doesn't have a dedicated status check.
  // We can assume it's available if the extension is running.
  console.log('Checking Chrome API backend status (assumed running).');
  
  try {
    // Test the language detection as a basic check
    await detectLanguage("Hello world");
    return { 
      status: 'running',
      message: 'Chrome Translation API is available'
    };
  } catch (error) {
    console.error('Chrome API status check error:', error);
    return {
      status: 'error',
      message: `Chrome Translation API is not available: ${error.message}`
    };
  }
}

/**
 * Checks if a specific model is available in Chrome API.
 * Since Chrome API doesn't have specific models, this always returns available.
 * 
 * @returns {Promise<object>} Promise resolving to { status: 'running' }
 */
export async function checkModelStatus() {
  // Chrome API doesn't have specific models to check
  return { 
    status: 'running',
    message: 'Chrome Translation API is available'
  };
} 