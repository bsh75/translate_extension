/**
 * backends/ollama.js
 * 
 * Ollama backend implementation for the Instant Translator Extension.
 * Handles API calls, model selection, fallback, and status checks specific to Ollama.
 */

// --- Ollama Backend Configuration ---
const ollamaConfig = {
  models: [
    {
      id: 'gemma3:1b',
      name: 'Gemma 3 1B',
      endpoint: 'http://localhost:11434/api/generate',
      default: true,
      promptTemplates: {
        natural: "Translate the following text from {sourceLanguage} to {targetLanguage}: \"{text}\". Provide only the translation without any additional commentary.",
        literal: "Translate the following text from {sourceLanguage} to {targetLanguage} word-for-word, preserving the original structure as much as possible: \"{text}\". Focus on direct translation of each word rather than natural flow. Provide only the translation without any additional commentary."
      }
    },
    {
      id: '7shi/gemma-2-jpn-translate:2b-instruct-q8_0',
      name: 'Gemma 2 2B Japanese',
      endpoint: 'http://localhost:11434/api/generate',
      default: false,
      promptTemplates: {
        natural: 'Translate this text from {sourceLanguage} to {targetLanguage}: "{text}". Provide only the translation without any additional commentary.',
        literal: 'Translate this text from {sourceLanguage} to {targetLanguage} word-for-word: "{text}". Focus on direct translation. Provide only the translation without any additional commentary.'
      }
    }
  ],
  languagePairs: [
    {
      source: 'en',
      target: 'ja',
      preferredModel: '7shi/gemma-2-jpn-translate:2b-instruct-q8_0'
    },
    {
      source: 'ja',
      target: 'en',
      preferredModel: '7shi/gemma-2-jpn-translate:2b-instruct-q8_0'
    },
    {
      source: 'en',
      target: 'es',
      preferredModel: 'gemma3:1b'
    },
    {
      source: 'es',
      target: 'en',
      preferredModel: 'gemma3:1b'
    }
  ],
  languageDetection: [
    { pattern: '[\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FAF]', language: 'ja', preferredModel: '7shi/gemma-2-jpn-translate:2b-instruct-q8_0' },
    { pattern: '[\\u0400-\\u04FF]', language: 'ru', preferredModel: 'gemma3:1b' },
    { pattern: '[\\u0600-\\u06FF]', language: 'ar', preferredModel: 'gemma3:1b' },
    { pattern: '[\\u0900-\\u097F]', language: 'hi', preferredModel: 'gemma3:1b' },
    { pattern: '[\\u4E00-\\u9FFF]', language: 'zh', preferredModel: 'gemma3:1b' },
    { pattern: '[\\uAC00-\\uD7A3]', language: 'ko', preferredModel: 'gemma3:1b' },
    { pattern: '.*', language: 'en', preferredModel: 'gemma3:1b' } // Default
  ],
  fallbackModelId: 'gemma3:1b'
};

// Find the default model defined in the configuration
function getDefaultModel() {
  return ollamaConfig.models.find(m => m.default) || ollamaConfig.models[0] || null;
}

// Find the specified fallback model
function getFallbackModel() {
  const fallback = ollamaConfig.models.find(m => m.id === ollamaConfig.fallbackModelId);
  return fallback || getDefaultModel();
}

// Find the preferred model for a specific language pair
function getPreferredModel(sourceLangCode, targetLangCode) {
  if (!sourceLangCode || sourceLangCode === 'auto') {
    return getDefaultModel(); // Can't determine preference without source
  }

  const pair = ollamaConfig.languagePairs.find(p => p.source === sourceLangCode && p.target === targetLangCode);
  if (pair && pair.preferredModel) {
    const model = ollamaConfig.models.find(m => m.id === pair.preferredModel);
    if (model) return model;
  }
  return getDefaultModel();
}

// Format the prompt using the correct template for the model and style
function formatPrompt(model, sourceLanguage, targetLanguage, text, style) {
  const actualStyle = style || 'natural';
  let template = model.promptTemplates ? model.promptTemplates[actualStyle] : null;
  
  // Fallback to natural template or a very basic default if style/template missing
  if (!template) {
    template = model.promptTemplates ? model.promptTemplates.natural : null;
  }
  if (!template) {
    template = "Translate from {sourceLanguage} to {targetLanguage}: \"{text}\"";
    console.warn(`No suitable prompt template found for model ${model.id} and style ${actualStyle}. Using basic default.`);
  }

  // Handle auto-detect case for the prompt string
  const displaySourceLang = sourceLanguage === 'Auto-detect' || sourceLanguage === 'auto' ? 'the source language' : sourceLanguage;

  return template
    .replace('{sourceLanguage}', displaySourceLang)
    .replace('{targetLanguage}', targetLanguage)
    .replace('{text}', text);
}

// Helper function to make the actual API call
async function callOllamaApi(modelId, endpoint, prompt) {
  console.log(`Calling Ollama API. Model: ${modelId}, Endpoint: ${endpoint}`);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Origin might be needed depending on CORS setup, but background script fetch usually handles it
      // 'Origin': 'chrome-extension://' + chrome.runtime.id 
    },
    body: JSON.stringify({
      model: modelId,
      prompt: prompt,
      stream: false
    })
  });

  console.log('Ollama API Response Status:', response.status, response.statusText);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Ollama API Error Body:', errorBody);
    throw new Error(`API error ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  console.log('Ollama API Parsed Response:', data);

  // Basic response cleaning
  let translation = data.response || '';
  translation = translation.replace(/^(Here's the translation:|The translation is:|Translated text:|Translation:)/i, '').trim();
  translation = translation.replace(/^["']|["']$/g, '');

  if (!translation) {
      console.warn("Received empty translation response from Ollama.");
      // Consider throwing an error or returning a specific message
      // throw new Error("Received empty translation from Ollama.");
  }

  return translation;
}

// --- Exported Functions ---

/**
 * Translates text using the Ollama backend.
 * Handles model selection (preferred/fallback) based on configuration.
 * 
 * @param {string} text The text to translate.
 * @param {string} sourceLangCode The source language code (e.g., 'en', 'ja', 'auto').
 * @param {string} targetLangCode The target language code (e.g., 'en', 'ja').
 * @param {string} style The desired translation style ('natural' or 'literal').
 * @returns {Promise<object>} Promise resolving to { success: true, translation: string, usedFallback: boolean, modelUsed: string } or { success: false, error: string }
 */
export async function translate(text, sourceLangCode, targetLangCode, style) {
  const preferredModel = getPreferredModel(sourceLangCode, targetLangCode);
  const fallbackModel = getFallbackModel();

  if (!preferredModel) {
      return { success: false, error: "No suitable Ollama model found in configuration." };
  }

  // If source is 'auto', we should ideally detect first. 
  // For now, we'll let Ollama handle it by providing a generic source language in the prompt,
  // but a dedicated detection step using chrome.i18n or another model could be added here.
  const actualSourceLang = sourceLangCode === 'auto' ? 'Auto-detect' : sourceLangCode; // Use name for prompt

  const prompt = formatPrompt(preferredModel, actualSourceLang, targetLangCode, text, style);

  try {
    console.log(`Attempting translation with preferred model: ${preferredModel.id}`);
    const translation = await callOllamaApi(preferredModel.id, preferredModel.endpoint, prompt);
    return {
      success: true,
      translation: translation,
      usedFallback: false,
      modelUsed: preferredModel.id
    };
  } catch (error) {
    console.warn(`Translation with preferred model ${preferredModel.id} failed:`, error);

    if (fallbackModel && fallbackModel.id !== preferredModel.id) {
      console.log(`Falling back to model: ${fallbackModel.id}`);
      const fallbackPrompt = formatPrompt(fallbackModel, actualSourceLang, targetLangCode, text, style);
      try {
        const fallbackTranslation = await callOllamaApi(fallbackModel.id, fallbackModel.endpoint, fallbackPrompt);
        return {
          success: true,
          translation: fallbackTranslation,
          usedFallback: true,
          modelUsed: fallbackModel.id
        };
      } catch (fallbackError) {
        console.error(`Fallback translation with ${fallbackModel.id} also failed:`, fallbackError);
        return {
          success: false,
          error: `Translation failed with preferred (${preferredModel.id}) and fallback (${fallbackModel.id}) models.`
        };
      }
    } else {
      // No fallback possible or fallback is the same as preferred
      return {
        success: false,
        error: `Translation failed with model ${preferredModel.id}. No fallback available or fallback failed.`
      };
    }
  }
}

/**
 * Checks the status of the Ollama backend.
 * 
 * @returns {Promise<object>} Promise resolving to { status: 'running' } or { status: 'error', message: string }
 */
export async function checkStatus() {
  const modelToCheck = getDefaultModel(); // Check status using the default model
  if (!modelToCheck) {
    return { status: 'error', message: 'No default Ollama model configured for status check.' };
  }

  try {
    // Use a simple, non-translation prompt for status check
    await callOllamaApi(modelToCheck.id, modelToCheck.endpoint, "Ping"); 
    return { status: 'running' };
  } catch (error) {
    console.error('Ollama status check error:', error);
    return {
      status: 'error',
      message: `Failed to connect or get response from Ollama endpoint ${modelToCheck.endpoint}. Ensure Ollama is running and the model ${modelToCheck.id} exists. Error: ${error.message}`
    };
  }
} 