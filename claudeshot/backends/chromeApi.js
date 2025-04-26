/**
 * backends/chromeApi.js
 * 
 * Placeholder for Chrome Translation API backend implementation.
 * Currently includes language detection but translation is not implemented.
 */

// --- Chrome API Backend Configuration (Example) ---
const chromeApiConfig = {
  // Add any specific settings if needed in the future
};

// --- Exported Functions ---

/**
 * Translates text using the (currently unimplemented) Chrome API backend.
 * Includes a step for language detection if source is 'auto'.
 * 
 * @param {string} text The text to translate.
 * @param {string} sourceLangCode The source language code (e.g., 'en', 'ja', 'auto').
 * @param {string} targetLangCode The target language code (e.g., 'en', 'ja').
 * @param {string} style The desired translation style ('natural' or 'literal') - may not be applicable.
 * @returns {Promise<object>} Promise resolving to { success: false, error: string } (as translation is not implemented)
 */
export async function translate(text, sourceLangCode, targetLangCode, style) {
  console.log(`Chrome API backend called for translation from ${sourceLangCode} to ${targetLangCode}`);

  let detectedSourceLang = sourceLangCode;

  // --- Language Detection Step ---
  if (sourceLangCode === 'auto') {
    try {
      const detectionResult = await new Promise((resolve, reject) => {
        chrome.i18n.detectLanguage(text, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });

      // Find the most likely language (highest percentage)
      if (detectionResult && detectionResult.languages && detectionResult.languages.length > 0) {
        // Sort by percentage descending
        detectionResult.languages.sort((a, b) => b.percentage - a.percentage);
        detectedSourceLang = detectionResult.languages[0].language;
        console.log(`Chrome detected source language as: ${detectedSourceLang} (Confidence: ${detectionResult.languages[0].percentage}%)`);
      } else {
        console.warn('Chrome language detection returned no results.');
        // Keep 'auto' or fallback to a default? For now, keep 'auto'
      }
    } catch (error) {
      console.error('Error during Chrome language detection:', error);
      // Proceed with 'auto' or return error? Return error for now.
      return {
        success: false,
        error: `Language detection failed: ${error.message}`
      };
    }
  }

  // --- Translation Step (Not Implemented) ---
  console.warn('Chrome API translation for selected text is not currently implemented.');

  // Placeholder return value
  return {
    success: false,
    error: `Chrome API translation from ${detectedSourceLang} to ${targetLangCode} is not implemented.`,
    detectedSourceLang: detectedSourceLang !== 'auto' ? detectedSourceLang : undefined
  };
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
  return { status: 'running' };
} 