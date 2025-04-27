/**
 * background.js - Background Service Worker for Instant Translator Chrome Extension
 * 
 * This background script serves several key functions:
 * 1. Initializes default settings when the extension is first installed
 * 2. Sets up context menu items for quick translation of selected text
 * 3. Handles communication between different parts of the extension
 * 4. Performs health checks on the active translation backend
 * 5. Loads and manages the central configuration file
 * 
 * The background script runs persistently in the background and maintains
 * the state of the extension even when no browser tabs are actively using it.
 * It serves as a central coordinator for the extension's functionality.
 * 
 * It uses Chrome's storage API to store and retrieve user preferences and error logs,
 * and the contextMenus API to add right-click menu options for translation.
 */

// --- ES Module Imports ---

// No longer need js-yaml import
// import { load as jsyamlLoad } from './js-yaml.min.js';

// Import all potential backend modules statically
// NOTE: These backend files (ollama.js, etc.) MUST use ES module 'export' syntax now.
import * as ollamaBackend from './backends/ollama.js';
import * as chromeApiBackend from './backends/chromeApi.js';
// Example: import * as anotherBackend from './backends/another.js';
// ... import other backends as needed ...

console.log('Background script loading (as module)...');

// Map backend names (from config) to the imported modules
const backendModules = {
  ollama: ollamaBackend,
  chromeApi: chromeApiBackend,
  // another: anotherBackend, // Add other backends here
};

/**
 * background.js - Background Service Worker for Instant Translator Chrome Extension
 * 
 * Central coordinator: Loads config, manages context menus, handles messages,
 * and delegates tasks (translation, status checks) to the active backend module.
 */

// --- Global State ---
let config = null; // Holds the parsed config.json content
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
  activeBackend: 'ollama', // Default backend
  backendSettings: {
    ollama: {
      models: [
        {
          id: "gemma3:1b",
          name: "Gemma 3 1B",
          endpoint: "http://localhost:11434/api/generate",
          default: true
        }
      ],
      fallbackModelId: "gemma3:1b"
    },
    chromeApi: {
      detectOnly: false,
      name: "Chrome Translation API",
      description: "Uses Chrome's built-in translation capabilities"
    }
  }
};

// --- Initialization ---

// Load configuration and initialize backend on startup
async function initialize() {
  console.log('Initializing background script...');
  try {
    await loadAndProcessConfig();
    await loadActiveBackend();
    setupListeners(); // Setup listeners only after successful init steps
    console.log(`Initialization complete. Active backend: ${config?.activeBackend || 'unknown'}`);
  } catch (error) {
    console.error('Initialization failed:', error);
    // Fallback logic
    if (!config) {
        console.warn('Config loading failed, using default config.');
        config = { ...defaultConfig };
        // Attempt to load default backend even if config failed
        config.activeBackend = defaultConfig.activeBackend;
    }
    // Try loading the default backend if the initial load failed
    if (!activeBackendModule && config.activeBackend) {
        console.warn(`Attempting to load default backend (${config.activeBackend}) after initialization error...`);
        try {
            await loadActiveBackend(); // Try again with default name
            console.log('Successfully loaded default backend after error.');
            setupListeners(); // Setup listeners if backend loaded successfully on retry
        } catch (backendError) {
            console.error('Failed to load default backend after initialization error:', backendError);
        }
    } else if (activeBackendModule) {
         // If config loaded but backend failed initially, but we have a module now
         setupListeners();
    }
  }
}

// Load and parse the config.json file
async function loadAndProcessConfig() {
  console.log('Attempting to load config.json...');
  try {
    const response = await fetch(chrome.runtime.getURL('config.json'));
    if (!response.ok) {
      throw new Error(`Failed to fetch config.json: ${response.statusText}`);
    }
    const jsonText = await response.text();
    
    // Use native JSON.parse
    const loadedConfig = JSON.parse(jsonText);

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
    // Handle potential JSON parsing errors as well
    if (error instanceof SyntaxError) {
        console.error('Error parsing config.json:', error);
    } else {
        console.error('Error loading or processing config.json, using default configuration:', error);
    }
    config = { ...defaultConfig };
    // Ensure supportedLanguagesList is populated even on error using defaults
    supportedLanguagesList = [...(config.supportedLanguages || [])];
     if (config.disabledLanguages) {
      config.disabledLanguages.forEach(lang => {
        if (!supportedLanguagesList.some(l => l.code === lang.code)) {
          supportedLanguagesList.push({...lang, enabled: false });
        }
      });
    }
    // Re-throw the error so initialize() knows config loading failed
    throw error;
  }
}

// Load the active backend module specified in the config
async function loadActiveBackend() {
  if (!config || !config.activeBackend) {
    throw new Error('Configuration or activeBackend not defined.');
  }

  const backendName = config.activeBackend;
  console.log(`Loading active backend module: ${backendName}`);

  // Select the already imported module from the map
  const newBackendModule = backendModules[backendName];

  if (!newBackendModule) {
    console.error(`Backend module "${backendName}" not found in pre-imported modules. Check config.json and static imports in background.js.`);
    throw new Error(`Backend module "${backendName}" is not registered or failed to import.`);
  }

  // If we're switching backends, clean up the old one if needed
  if (activeBackendModule && activeBackendModule !== newBackendModule && activeBackendModule.cleanup) {
    console.log(`Cleaning up previous backend module: ${config.activeBackend}`);
    try {
      await activeBackendModule.cleanup();
    } catch (error) {
      console.warn(`Error during cleanup of previous backend:`, error);
      // Continue with the switch even if cleanup fails
    }
  }

  // Set the new active backend module
  activeBackendModule = newBackendModule;
  console.log(`Successfully loaded backend module: ${backendName}`);

  // Initialize the backend module if it has an initialize function
  if (activeBackendModule.initialize) {
    console.log(`Initializing backend module: ${backendName}...`);
    try {
      await activeBackendModule.initialize(config);
      console.log(`Backend module ${backendName} initialized successfully`);
    } catch (error) {
      console.error(`Error initializing backend module ${backendName}:`, error);
      throw error; // Re-throw to signal initialization failure
    }
  }

  return true;
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

// Handle extension installation or update
function onInstalledListener(details) {
  console.log('Extension installed or updated:', details.reason);
  
  if (details.reason === 'install') {
    // First-time installation
    console.log('First-time installation, setting up default configuration');
    // Default settings are already loaded in config
  }
  
  // Set up context menu items
  setupContextMenu();
}

// Set up context menu items for translation
function setupContextMenu() {
  // Remove existing items to avoid duplicates
  chrome.contextMenus.removeAll(() => {
    // Create main translate item
    chrome.contextMenus.create({
      id: 'translate',
      title: 'Translate Selection',
      contexts: ['selection']
    });
    
    // Add language-specific items
    const enabledLanguages = supportedLanguagesList.filter(lang => 
      lang.enabled && lang.code !== 'auto'
    );
    
    enabledLanguages.forEach(lang => {
      chrome.contextMenus.create({
        id: `translate-to-${lang.code}`,
        parentId: 'translate',
        title: `to ${lang.name}`,
        contexts: ['selection']
      });
    });
    
    // Add listener for context menu clicks
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId.startsWith('translate-to-')) {
        const targetLang = info.menuItemId.replace('translate-to-', '');
        const text = info.selectionText;
        
        // Send message to content script to show translation
        chrome.tabs.sendMessage(tab.id, {
          action: 'translateSelection',
          text: text,
          targetLang: targetLang,
          sourceLang: 'auto' // Auto-detect source language
        });
      }
    });
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
  console.log('Background received message:', request.action);
  
  // Handle different message types
  switch (request.action) {
    case 'translate':
      handleTranslateRequest(request, sendResponse);
      return true; // Keep the message channel open for async response
      
    case 'checkStatus':
      handleStatusCheck(sendResponse);
      return true; // Keep the message channel open for async response
      
    case 'getConfig':
      sendResponse({
        success: true,
        config: config,
        supportedLanguages: supportedLanguagesList
      });
      return false; // No async response needed
      
    case 'updateConfig':
      handleConfigUpdate(request, sendResponse);
      return true; // Keep the message channel open for async response
      
    case 'resetConfig':
      handleConfigReset(sendResponse);
      return true; // Keep the message channel open for async response
      
    case 'switchBackend':
      handleBackendSwitch(request, sendResponse);
      return true; // Keep the message channel open for async response
      
    case 'checkModelStatus':
      handleModelStatusCheck(request, sendResponse);
      return true; // Keep the message channel open for async response
      
    default:
      console.warn('Unknown message action:', request.action);
      sendResponse({ success: false, error: 'Unknown action' });
      return false;
  }
};

// Handle translation requests
async function handleTranslateRequest(request, sendResponse) {
  console.log('Translation request:', request);
  
  if (!activeBackendModule) {
    sendResponse({
      success: false,
      error: 'No active translation backend available'
    });
    return;
  }
  
  try {
    // Call the active backend's translate method
    const result = await activeBackendModule.translate(
      request.text,
      request.sourceLang || 'auto',
      request.targetLang,
      request.style || config.defaultTranslationStyle || 'natural'
    );
    
    console.log('Translation result:', result);
    sendResponse(result);
  } catch (error) {
    console.error('Translation error:', error);
    sendResponse({
      success: false,
      error: `Translation failed: ${error.message}`
    });
  }
}

// Handle backend status check
async function handleStatusCheck(sendResponse) {
  if (!activeBackendModule) {
    sendResponse({
      success: false,
      status: 'error',
      message: 'No active translation backend available'
    });
    return;
  }
  
  try {
    // Call the active backend's checkStatus method
    const status = await activeBackendModule.checkStatus();
    sendResponse({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Status check error:', error);
    sendResponse({
      success: false,
      status: 'error',
      message: `Status check failed: ${error.message}`
    });
  }
}

// Handle model status check
async function handleModelStatusCheck(request, sendResponse) {
  const modelId = request.modelId;
  
  if (!activeBackendModule || !activeBackendModule.checkModelStatus) {
    sendResponse({
      status: 'error',
      message: 'Active backend does not support model status checks'
    });
    return;
  }
  
  try {
    // Call the active backend's checkModelStatus method
    const status = await activeBackendModule.checkModelStatus(modelId);
    sendResponse(status);
  } catch (error) {
    console.error(`Error checking model status for ${modelId}:`, error);
    sendResponse({
      status: 'error',
      message: error.message
    });
  }
}

// Handle config update
async function handleConfigUpdate(request, sendResponse) {
  try {
    // Update the global config
    const oldBackend = config.activeBackend;
    config = request.config;
    
    // Save to storage for persistence
    await chrome.storage.local.set({ config: config });
    
    // Check if the backend has changed
    if (oldBackend !== config.activeBackend) {
      console.log(`Backend changed from ${oldBackend} to ${config.activeBackend}`);
      await loadActiveBackend();
    } else if (activeBackendModule && activeBackendModule.initialize) {
      // Re-initialize the active backend with the new config
      await activeBackendModule.initialize(config);
    }
    
    // Rebuild the supported languages list
    supportedLanguagesList = [...(config.supportedLanguages || [])];
    if (config.disabledLanguages) {
      config.disabledLanguages.forEach(lang => {
        if (!supportedLanguagesList.some(l => l.code === lang.code)) {
          supportedLanguagesList.push({...lang, enabled: false });
        }
      });
    }
    
    // Rebuild context menu with updated languages
    setupContextMenu();
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error updating config:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle config reset
async function handleConfigReset(sendResponse) {
  try {
    // Reset to default config
    await loadAndProcessConfig();
    
    // Re-initialize the active backend
    await loadActiveBackend();
    
    // Rebuild context menu
    setupContextMenu();
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error resetting config:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Handle backend switch
async function handleBackendSwitch(request, sendResponse) {
  try {
    const newBackend = request.backend;
    
    if (!backendModules[newBackend]) {
      throw new Error(`Backend "${newBackend}" not found`);
    }
    
    // Update config with new backend
    config.activeBackend = newBackend;
    
    // Save to storage
    await chrome.storage.local.set({ config: config });
    
    // Load the new backend
    await loadActiveBackend();
    
    sendResponse({ 
      success: true,
      message: `Switched to ${newBackend} backend successfully`
    });
  } catch (error) {
    console.error('Error switching backend:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

// --- Start Initialization ---
initialize(); 