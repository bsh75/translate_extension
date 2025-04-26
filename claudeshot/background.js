/**
 * background.js - Background Service Worker for Instant Translator Chrome Extension
 * 
 * This background script serves several key functions:
 * 1. Initializes default settings when the extension is first installed
 * 2. Sets up context menu items for quick translation of selected text
 * 3. Handles communication between different parts of the extension
 * 4. Performs health checks on the Ollama API to ensure it's running
 * 5. Loads and manages the central configuration file
 * 
 * The background script runs persistently in the background and maintains
 * the state of the extension even when no browser tabs are actively using it.
 * It serves as a central coordinator for the extension's functionality.
 * 
 * It uses Chrome's storage API to store and retrieve user preferences and error logs,
 * and the contextMenus API to add right-click menu options for translation.
 */

// Import the YAML parser library (ensure js-yaml.min.js is included in manifest.json)
// If js-yaml is not already globally available, you might need an import statement
// depending on how it's loaded. Assuming it's globally available for now.

/**
 * background.js - Background Service Worker for Instant Translator Chrome Extension
 * 
 * Central coordinator: Loads config, manages context menus, handles messages,
 * and delegates tasks (translation, status checks) to the active backend module.
 */

console.log('Background script loading...');

// --- Global State ---
let config = null; // Holds the parsed config.yml content
let activeBackendModule = null; // Holds the dynamically loaded backend module
let supportedLanguagesList = []; // Holds the combined list of supported languages

// Default configuration (used if loading fails)
const defaultConfig = {
  version: "1.0",
  defaultTargetLanguage: "English",
  defaultSourceLanguage: "Auto-detect",
  defaultTranslationStyle: "natural",
  supportedLanguages: [
    { code: "auto", name: "Auto-detect", enabled: true },
    { code: "en", name: "English", enabled: true },
    { code: "ja", name: "Japanese", enabled: true },
    { code: "es", name: "Spanish", enabled: true }
  ],
  disabledLanguages: [],
  activeBackend: 'ollama' // Default backend
};

// --- Initialization ---

// Load configuration and initialize backend on startup
async function initialize() {
  console.log('Initializing background script...');
  try {
    await loadAndProcessConfig();
    await loadBackendModule();
    setupListeners();
    console.log(`Initialization complete. Active backend: ${config?.activeBackend || 'unknown'}`);
  } catch (error) {
    console.error('Initialization failed:', error);
    // Use default config and attempt to load default backend if full init failed
    if (!config) config = { ...defaultConfig };
    if (!activeBackendModule) {
        console.warn('Attempting to load default backend (ollama) after initialization error...');
        config.activeBackend = 'ollama';
        try {
            await loadBackendModule();
            console.log('Successfully loaded default backend after error.');
        } catch (backendError) {
            console.error('Failed to load default backend after initialization error:', backendError);
        }
    }
    // Setup listeners even if init failed partially, maybe some parts work
    if (!chrome.runtime.onInstalled.hasListeners(onInstalledListener)) {
        setupListeners(); 
    }
  }
}

// Load and parse the config.yml file
async function loadAndProcessConfig() {
  console.log('Attempting to load config.yml...');
  try {
    const response = await fetch(chrome.runtime.getURL('config.yml'));
    if (!response.ok) {
      throw new Error(`Failed to fetch config.yml: ${response.statusText}`);
    }
    const yamlText = await response.text();
    const loadedConfig = jsyaml.load(yamlText);

    // Merge with defaults to ensure all keys exist
    config = { ...defaultConfig, ...loadedConfig };

    // Combine supported and disabled languages for internal use
    supportedLanguagesList = [...(config.supportedLanguages || [])];
    if (config.disabledLanguages) {
      config.disabledLanguages.forEach(lang => {
        if (!supportedLanguagesList.some(l => l.code === lang.code)) {
          supportedLanguagesList.push({...lang, enabled: false });
        }
      });
    }

    console.log('Configuration loaded and processed successfully:', config);

  } catch (error) {
    console.warn('Error loading or processing config.yml, using default configuration:', error);
    config = { ...defaultConfig };
    supportedLanguagesList = [...(config.supportedLanguages || [])];
     if (config.disabledLanguages) {
      config.disabledLanguages.forEach(lang => {
        if (!supportedLanguagesList.some(l => l.code === lang.code)) {
          supportedLanguagesList.push({...lang, enabled: false });
        }
      });
    }
  }
}

// Dynamically load the backend module specified in the config
async function loadBackendModule() {
  if (!config || !config.activeBackend) {
    throw new Error('Configuration or activeBackend not defined.');
  }

  const backendName = config.activeBackend;
  const backendPath = `./backends/${backendName}.js`;
  console.log(`Loading backend module: ${backendPath}`);

  try {
    // Use dynamic import to load the module
    activeBackendModule = await import(backendPath);
    console.log(`Successfully loaded backend module: ${backendName}`);
    // Optionally, call an init function on the backend module if it exists
    if (activeBackendModule.initialize) {
      console.log(`Initializing backend module: ${backendName}...`);
      await activeBackendModule.initialize(config); // Pass config if needed
    }
  } catch (error) {
    console.error(`Failed to load backend module ${backendPath}:`, error);
    activeBackendModule = null; // Ensure it's null if loading failed
    throw new Error(`Failed to load backend module: ${backendName}. Check config.yml and ensure the module exists.`);
  }
}

// --- Event Listeners Setup ---
function setupListeners() {
    // Remove existing listeners to prevent duplicates during potential re-initialization on error
    if (chrome.runtime.onInstalled.hasListeners(onInstalledListener)) {
        chrome.runtime.onInstalled.removeListener(onInstalledListener);
    }
    if (chrome.contextMenus.onClicked.hasListeners(onContextMenuClicked)) {
        chrome.contextMenus.onClicked.removeListener(onContextMenuClicked);
    }
    if (chrome.runtime.onMessage.hasListeners(onMessageReceived)) {
        chrome.runtime.onMessage.removeListener(onMessageReceived);
    }

    // Add listeners
    chrome.runtime.onInstalled.addListener(onInstalledListener);
    chrome.contextMenus.onClicked.addListener(onContextMenuClicked);
    chrome.runtime.onMessage.addListener(onMessageReceived);
    console.log('Event listeners set up.');
}


// --- Event Handlers ---

// Runs when the extension is first installed or updated
const onInstalledListener = (details) => {
  console.log('Extension installed or updated:', details.reason);
  // Ensure config is loaded before setting defaults
  if (!config) {
    console.warn('Config not loaded during onInstalled, attempting to load now...');
    // We run initialize which includes config loading
    initialize().then(() => {
        setDefaultSettings();
        createContextMenu();
    });
  } else {
      setDefaultSettings();
      createContextMenu();
  }
};

function setDefaultSettings() {
    // Initialize default settings in storage if they don't exist
    chrome.storage.sync.get(['targetLanguage', 'sourceLanguage', 'translationStyle'], (result) => {
        const settingsToSet = {};
        if (!result.targetLanguage && config.defaultTargetLanguage) {
            settingsToSet.targetLanguage = config.defaultTargetLanguage;
        }
        if (!result.sourceLanguage && config.defaultSourceLanguage) {
            settingsToSet.sourceLanguage = config.defaultSourceLanguage;
        }
        if (!result.translationStyle && config.defaultTranslationStyle) {
            settingsToSet.translationStyle = config.defaultTranslationStyle;
        }
        if (Object.keys(settingsToSet).length > 0) {
             chrome.storage.sync.set(settingsToSet, () => {
                 console.log('Default settings initialized in storage:', settingsToSet);
             });
        } else {
             console.log('Default settings already exist in storage.');
        }
    });
}

function createContextMenu() {
    // Create context menu for quick translation
    chrome.contextMenus.create({
        id: 'translateSelectedText',
        title: 'Translate selected text',
        contexts: ['selection']
    }, () => {
        if (chrome.runtime.lastError) {
            console.warn("Context menu already exists or failed to create:", chrome.runtime.lastError.message);
        } else {
            console.log('Context menu created successfully.');
        }
    });
}

// Handles clicks on the context menu item
const onContextMenuClicked = (info, tab) => {
  if (info.menuItemId === 'translateSelectedText' && tab) {
    console.log('Context menu clicked. Sending message to content script in tab:', tab.id);
    // Send message to content script to trigger translation of selected text
    chrome.tabs.sendMessage(tab.id, {
      action: 'translateSelectedText'
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn(`Error sending message to content script (tab ${tab.id}):`, chrome.runtime.lastError.message, "Maybe the content script isn't loaded?");
        } else {
            console.log('Message sent to content script, response:', response);
        }
    });
  }
};

// Handles messages from popup or content scripts
const onMessageReceived = (request, sender, sendResponse) => {
  console.log(`Background received message: action=${request.action}`, request);

  // Ensure the backend module is loaded before handling requests that need it
  if (!activeBackendModule && (request.action === 'translate' || request.action === 'checkBackendStatus')) {
    console.error('Backend module not loaded. Cannot handle request:', request.action);
    sendResponse({ success: false, error: 'Backend module not loaded. Initialization might have failed.' });
    return false; // Indicate sync response
  }

  switch (request.action) {
    case 'getConfig':
      // Provide the processed configuration and the full list of languages
      if (config && supportedLanguagesList) {
        sendResponse({ success: true, config: config, supportedLanguages: supportedLanguagesList });
      } else {
         console.warn('getConfig requested before config was loaded.');
         // Attempt to load config now and respond - might be too late if sync
         loadAndProcessConfig().then(() => {
             if (config && supportedLanguagesList) {
                 sendResponse({ success: true, config: config, supportedLanguages: supportedLanguagesList });
             } else {
                 sendResponse({ success: false, error: 'Configuration could not be loaded.' });
             }
         });
         return true; // Indicate async response needed
      }
      break;

    case 'checkBackendStatus':
      // Delegate status check to the active backend module
      console.log(`Delegating status check to backend: ${config.activeBackend}`);
      activeBackendModule.checkStatus()
        .then(response => sendResponse(response))
        .catch(error => {
          console.error('Error checking backend status:', error);
          sendResponse({ status: 'error', message: `Error checking status: ${error.message}` });
        });
      return true; // Indicate async response

    case 'translate':
      // Delegate translation to the active backend module
      console.log(`Delegating translation to backend: ${config.activeBackend}`);
      // Get necessary details from the request
      const { text, sourceLangCode, targetLangCode } = request;
      // Get style from storage (or use default)
      chrome.storage.sync.get('translationStyle', (result) => {
        const style = result.translationStyle || config?.defaultTranslationStyle || 'natural';
        console.log(`Using style: ${style} for translation`);
        
        activeBackendModule.translate(text, sourceLangCode, targetLangCode, style)
          .then(response => sendResponse(response))
          .catch(error => {
            console.error('Error during backend translation:', error);
            sendResponse({ success: false, error: `Translation failed: ${error.message}` });
          });
      });
      return true; // Indicate async response

    default:
      console.warn('Received unknown message action:', request.action);
      sendResponse({ success: false, error: `Unknown action: ${request.action}` });
      break;
  }

  // Return true if sendResponse will be called asynchronously (for translate and checkBackendStatus)
  // For getConfig, it might be sync or async depending on whether config was loaded.
  return false; // Default to sync response unless handled above
};

// --- Start Initialization ---
initialize(); 