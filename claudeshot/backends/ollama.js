/**
 * backends/ollama.js
 * 
 * Ollama backend implementation for the Instant Translator Extension.
 * Handles API calls, model selection, fallback, and status checks specific to Ollama.
 */

// --- Ollama Backend Configuration ---
let ollamaConfig = {}; // Will be populated during initialize()

/**
 * Initialize the Ollama backend with configuration from the global config.
 * 
 * @param {Object} config The global configuration object
 */
export function initialize(config) {
  console.log('Initializing Ollama backend with config:', config);
  
  // Extract Ollama-specific configuration
  if (config && config.backendSettings && config.backendSettings.ollama) {
    ollamaConfig = config.backendSettings.ollama;
    console.log('Ollama configuration loaded:', ollamaConfig);
  } else {
    console.error('Failed to load Ollama configuration from global config');
    // Set minimal default config to prevent crashes
    ollamaConfig = {
      models: [],
      languagePairs: [],
      languageDetection: { patterns: [] },
      fallbackModelId: null
    };
  }
  
  // Validate the configuration
  if (!ollamaConfig.models || ollamaConfig.models.length === 0) {
    console.error('No models defined in Ollama configuration');
  }
  
  // Log available models
  console.log('Available models:', ollamaConfig.models.map(m => m.id));
  
  // Log language pairs with preferred models
  console.log('Language pairs with preferred models:', ollamaConfig.languagePairs);
  
  return { success: true };
}

// Find the default model defined in the configuration
function getDefaultModel() {
  // First try to find a model explicitly marked as default
  const defaultModel = ollamaConfig.models?.find(m => m.default === true);
  if (defaultModel) {
    console.log(`Found explicitly marked default model: ${defaultModel.id}`);
    return defaultModel;
  }
  
  // If no default is marked, use the first model
  if (ollamaConfig.models && ollamaConfig.models.length > 0) {
    console.log(`No explicitly marked default model, using first model: ${ollamaConfig.models[0].id}`);
    return ollamaConfig.models[0];
  }
  
  console.error('No models available in Ollama configuration');
  return null;
}

// Find the specified fallback model
function getFallbackModel() {
  if (!ollamaConfig.fallbackModelId) {
    console.log('No fallback model ID specified, using default model');
    return getDefaultModel();
  }
  
  const fallback = ollamaConfig.models?.find(m => m.id === ollamaConfig.fallbackModelId);
  if (fallback) {
    console.log(`Found fallback model: ${fallback.id}`);
    return fallback;
  }
  
  console.warn(`Specified fallback model '${ollamaConfig.fallbackModelId}' not found, using default model`);
  return getDefaultModel();
}

// Find the preferred model for a specific language pair
function getPreferredModel(sourceLangCode, targetLangCode) {
  console.log(`[getPreferredModel] Input: source=${sourceLangCode}, target=${targetLangCode}`);

  if (!sourceLangCode || sourceLangCode === 'auto') {
    console.log(`[getPreferredModel] Source is null or auto, returning default.`);
    return getDefaultModel(); // Can't determine preference without source
  }

  // Check if we have a specific language pair configuration
  const pair = ollamaConfig.languagePairs?.find(p => 
    p.source === sourceLangCode && p.target === targetLangCode
  );
  
  console.log(`[getPreferredModel] Found language pair:`, pair);

  if (pair && pair.preferredModel) {
    const preferredModelId = pair.preferredModel;
    console.log(`[getPreferredModel] Preferred model ID from pair: ${preferredModelId}`);
    
    // Find the model object for this ID
    const model = ollamaConfig.models?.find(m => m.id === preferredModelId);
    console.log(`[getPreferredModel] Found model object for ID:`, model);
    
    if (model) {
      console.log(`[getPreferredModel] Returning preferred model: ${model.id}`);
      return model;
    } else {
      console.warn(`[getPreferredModel] Preferred model ID "${preferredModelId}" from language pair config was NOT found in the models list!`);
    }
  } else {
    console.log(`[getPreferredModel] No specific language pair found for ${sourceLangCode} -> ${targetLangCode}.`);
  }

  // If we reach here, no preferred model was found or applicable
  const defaultModel = getDefaultModel();
  console.log(`[getPreferredModel] Returning default model: ${defaultModel?.id}`);
  return defaultModel; // Fallback to default model
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
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
      throw new Error("Received empty translation from Ollama.");
    }

    return translation;
  } catch (error) {
    console.error(`Error calling Ollama API with model ${modelId}:`, error);
    throw error; // Re-throw to let the caller handle it
  }
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
  console.log(`Ollama translate called: ${sourceLangCode} -> ${targetLangCode}, style: ${style}`);
  
  // Ensure we have configuration
  if (!ollamaConfig || !ollamaConfig.models || ollamaConfig.models.length === 0) {
    return { 
      success: false, 
      error: "Ollama backend not properly initialized or no models configured." 
    };
  }

  // Get the preferred model for this language pair
  const preferredModel = getPreferredModel(sourceLangCode, targetLangCode);
  if (!preferredModel) {
    return { 
      success: false, 
      error: "No suitable Ollama model found for this language pair." 
    };
  }

  // Get the fallback model (different from preferred if possible)
  const fallbackModel = getFallbackModel();
  
  // If source is 'auto', we should ideally detect first. 
  // For now, we'll let Ollama handle it by providing a generic source language in the prompt
  const actualSourceLang = sourceLangCode === 'auto' ? 'Auto-detect' : sourceLangCode;

  // Format the prompt for the preferred model
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
  } catch (preferredError) {
    console.warn(`Translation with preferred model ${preferredModel.id} failed:`, preferredError);

    // Try fallback model if it's different from the preferred model
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
          error: `Translation failed with both preferred (${preferredModel.id}) and fallback (${fallbackModel.id}) models.`
        };
      }
    } else {
      // No fallback possible or fallback is the same as preferred
      return {
        success: false,
        error: `Translation failed with model ${preferredModel.id}. Error: ${preferredError.message}`
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
  // Ensure we have configuration
  if (!ollamaConfig || !ollamaConfig.models || ollamaConfig.models.length === 0) {
    return { 
      status: 'error', 
      message: 'Ollama backend not properly initialized or no models configured.' 
    };
  }

  const modelToCheck = getDefaultModel();
  if (!modelToCheck) {
    return { 
      status: 'error', 
      message: 'No default Ollama model configured for status check.' 
    };
  }

  try {
    // Use a simple, non-translation prompt for status check
    await callOllamaApi(modelToCheck.id, modelToCheck.endpoint, "Ping"); 
    return { 
      status: 'running',
      message: `Ollama is running with model ${modelToCheck.id}`
    };
  } catch (error) {
    console.error('Ollama status check error:', error);
    return {
      status: 'error',
      message: `Failed to connect to Ollama. Ensure Ollama is running and the model ${modelToCheck.id} exists.`
    };
  }
}

/**
 * Checks if a specific model is available in Ollama.
 * 
 * @param {string} modelId The ID of the model to check
 * @returns {Promise<object>} Promise resolving to { status: 'running' } or { status: 'error', message: string }
 */
export async function checkModelStatus(modelId) {
  console.log(`Checking status for model: ${modelId}`);
  
  // Find the model in the config
  const model = ollamaConfig.models?.find(m => m.id === modelId);
  if (!model) {
    return { 
      status: 'error', 
      message: `Model ${modelId} not found in configuration.` 
    };
  }

  try {
    // Use a simple, non-translation prompt for status check
    await callOllamaApi(modelId, model.endpoint || "http://localhost:11434/api/generate", "Ping"); 
    return { 
      status: 'running',
      message: `Model ${modelId} is available`
    };
  } catch (error) {
    console.error(`Status check error for model ${modelId}:`, error);
    return {
      status: 'error',
      message: `Model ${modelId} is not available: ${error.message}`
    };
  }
} 