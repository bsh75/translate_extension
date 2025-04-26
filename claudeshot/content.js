/**
 * content.js - Content Script for Instant Translator Chrome Extension
 * 
 * This content script runs on every web page and is responsible for:
 * 1. Detecting text selections made by the user
 * 2. Creating and positioning the translation popup
 * 3. Communicating with the Ollama API to get translations
 * 4. Displaying translation results or error messages
 * 
 * The script injects a popup element into the page's DOM which appears
 * near the mouse cursor when text is selected, shows a loading indicator
 * while translating, and then displays the translated text or an error message.
 */

// Add this at the top of your content.js file
console.log('Content script loaded');

// Global configuration (loaded from background)
let config = {};
let allLanguages = []; // Includes enabled and disabled from config

// Translation popup element
let translationPopup = null;
let selectedText = '';
let isTranslating = false;
// let lastSelectionRange = null; // Keep if needed for positioning or other features

// --- Initialization ---

// Load configuration from background script
async function loadConfigFromBackground() {
  console.log('Content script: Requesting config from background...');
  try {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getConfig' }, response => {
        if (chrome.runtime.lastError) {
          console.error('Error getting config from background:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.success && response.config && response.supportedLanguages) {
          config = response.config;
          allLanguages = response.supportedLanguages; // Get the full list
          console.log('Content script: Configuration loaded successfully', config);
          resolve();
        } else {
          console.warn('Content script: Unable to load valid config from background, using defaults.', response);
          // Use some basic defaults if loading fails
          config = { defaultTargetLanguage: "English", defaultSourceLanguage: "Auto-detect" };
          allLanguages = [{ code: "auto", name: "Auto-detect" }, { code: "en", name: "English" }];
          reject(new Error('Failed to load configuration from background.'));
        }
      });
    });
  } catch (error) {
    console.error('Content script: Error in loadConfigFromBackground:', error);
    // Fallback to basic defaults
    config = { defaultTargetLanguage: "English", defaultSourceLanguage: "Auto-detect" };
    allLanguages = [{ code: "auto", name: "Auto-detect" }, { code: "en", name: "English" }];
    throw error; // Re-throw to indicate failure
  }
}

// Initialize the content script
async function initContentScript() {
  try {
    // Load configuration first
    await loadConfigFromBackground();
    
    // Add event listeners for text selection and interaction
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('mousedown', handleMouseDown);
    // Potentially add keyup listener if needed: document.addEventListener('keyup', handleTextSelection);
    
    // Listen for messages from background (e.g., context menu click)
    chrome.runtime.onMessage.addListener(handleBackgroundMessage);

    console.log('Content script initialized.');
  } catch (error) {
    console.error('Failed to initialize content script:', error);
    // Basic functionality might still work if event listeners are attached
  }
}

// --- Event Handlers ---

// Handle messages from the background script
function handleBackgroundMessage(request, sender, sendResponse) {
    console.log('Content script received message:', request);
    if (request.action === 'translateSelectedText') {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        if (text) {
            console.log('Context menu triggered translation for:', text);
            selectedText = text;
            // lastSelectionRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            // Show loading immediately and trigger translation
            showLoadingPopup(); 
            translateText(text);
            sendResponse({ success: true }); // Acknowledge message
        } else {
            console.warn('Context menu triggered but no text selected.');
            sendResponse({ success: false, error: 'No text selected'});
        }
    } else {
        sendResponse({ success: false, error: 'Unknown action' });
    }
    // Indicate async response not needed unless we add async ops here
    return false; 
}

// Handle mouse up events to detect text selection
async function handleTextSelection(e) {
  // Check if the mouse button released is the left button
  if (e.button !== 0) return; 

  // Debounce or delay slightly to avoid triggering on simple clicks
  // Use setTimeout to wait a fraction of a second
  setTimeout(async () => {
    const currentSelection = window.getSelection();
    const newSelectedText = currentSelection.toString().trim();

    // Don't trigger if selection is empty or inside the popup itself
    const popup = document.getElementById('translation-popup');
    if (!newSelectedText || (popup && popup.contains(currentSelection.anchorNode))) {
      // If selection is cleared, hide popup (unless triggered by context menu)
      // We might need more robust logic here if context menu is used
      // if (!newSelectedText) hideTranslationPopup(); 
      return;
    }

    // Only trigger translation if the text is different from the last translation
    if (newSelectedText !== selectedText) {
      console.log('New text selected:', newSelectedText);
      selectedText = newSelectedText;
      // lastSelectionRange = currentSelection.rangeCount > 0 ? currentSelection.getRangeAt(0) : null;

      // Show loading indicator and initiate translation
      showLoadingPopup(); // Show loading immediately
      await translateText(newSelectedText);
    }
  }, 100); // Small delay (e.g., 100ms) to debounce
}

// Handle mouse down events to hide the popup when clicking outside
function handleMouseDown(e) {
  const popup = document.getElementById('translation-popup');
  // If the click is outside the popup, hide it
  if (popup && !popup.contains(e.target)) {
    hideTranslationPopup();
  }
}

// --- Translation Logic ---

// Helper to get language code from language name using the loaded list
function getLanguageCode(languageName) {
  if (!allLanguages || allLanguages.length === 0) {
      console.warn("Language list not loaded, attempting fallback mapping for:", languageName);
      const fallbackMap = { 'English': 'en', 'Japanese': 'ja', 'Spanish': 'es', 'Auto-detect': 'auto' };
      return fallbackMap[languageName] || 'auto';
  }
  const language = allLanguages.find(lang => lang.name === languageName);
  return language ? language.code : 'auto'; // Default to auto if name not found
}

// Sends text to background script for translation
async function translateText(text) {
  if (isTranslating) {
    console.log('Already translating, ignoring request');
    return;
  }
  isTranslating = true;

  console.log('Initiating translation for:', text);
  // Loading popup should already be shown by handleTextSelection or handleBackgroundMessage

  try {
    // Get the target and source languages from storage
    const settings = await chrome.storage.sync.get(['targetLanguage', 'sourceLanguage']);
    
    const targetLanguageName = settings.targetLanguage || config?.defaultTargetLanguage || 'English';
    const sourceLanguageName = settings.sourceLanguage || config?.defaultSourceLanguage || 'Auto-detect';

    const targetLangCode = getLanguageCode(targetLanguageName);
    const sourceLangCode = getLanguageCode(sourceLanguageName);

    console.log(`Requesting translation from background: ${sourceLangCode} -> ${targetLangCode}`);

    // Send request to background script
    chrome.runtime.sendMessage({
      action: 'translate',
      text: text,
      sourceLangCode: sourceLangCode,
      targetLangCode: targetLangCode
      // Style is handled by background script fetching from storage
    }, response => {
      if (chrome.runtime.lastError) {
          console.error('Error sending/receiving translation message:', chrome.runtime.lastError.message);
          showTranslationPopup(text, `Error communicating with background script.`, true);
          isTranslating = false;
          return;
      }
      
      console.log('Received translation response from background:', response);

      if (response && response.success) {
        showTranslationPopup(
          text,
          response.translation,
          false,
          response.usedFallback || false,
          response.modelUsed || null // Pass the actual model used
        );
      } else {
        const errorMessage = response && response.error ? response.error : 'Translation failed';
        console.error('Translation failed:', errorMessage);
        showTranslationPopup(text, `Error: ${errorMessage}`, true);
      }
      isTranslating = false;
    });

  } catch (error) {
    console.error('Error getting settings or sending message:', error);
    showTranslationPopup(text, `Error: ${error.message}`, true);
    isTranslating = false;
  }
}

// --- UI Management (Popup) ---

// Create and show the translation popup
function showTranslationPopup(originalText, translation, isError = false, usedFallback = false, modelUsed = null) {
  hideTranslationPopup(); // Ensure only one popup exists

  translationPopup = document.createElement('div');
  translationPopup.id = 'translation-popup';
  translationPopup.className = `translation-popup ${isError ? 'error' : ''}`;

  // Close button
  const closeBtn = document.createElement('span');
  closeBtn.className = 'close-btn';
  closeBtn.textContent = '×';
  closeBtn.onclick = hideTranslationPopup; // Use direct assignment for simplicity
  translationPopup.appendChild(closeBtn);

  // Content
  const contentDiv = document.createElement('div');
  contentDiv.className = 'content';
  contentDiv.textContent = translation;
  translationPopup.appendChild(contentDiv);

  // Fallback/Model Info
  if (!isError && modelUsed) {
    const infoDiv = document.createElement('div');
    infoDiv.className = 'fallback-info'; // Use existing class
    infoDiv.textContent = usedFallback 
        ? `(Using fallback: ${modelUsed})` 
        : `(Using: ${modelUsed.split('/').pop()})`; // Show model name, maybe shorten it
    translationPopup.appendChild(infoDiv);
  }

  document.body.appendChild(translationPopup);
  positionPopupNearSelection(translationPopup);
}

// Show loading popup
function showLoadingPopup() {
  hideTranslationPopup(); // Ensure only one popup exists

  translationPopup = document.createElement('div');
  translationPopup.id = 'translation-popup';
  translationPopup.className = 'translation-popup loading'; // Add loading class

  const contentDiv = document.createElement('div');
  contentDiv.className = 'content'; // Reuse content class
  contentDiv.textContent = 'Translating...';
  translationPopup.appendChild(contentDiv);

  // Optional: Add spinner via CSS pseudo-element or create it here

  document.body.appendChild(translationPopup);
  positionPopupNearSelection(translationPopup);
}

// Hides the translation popup
function hideTranslationPopup() {
  if (translationPopup) {
    translationPopup.remove();
    translationPopup = null;
    selectedText = ''; // Reset selected text when popup hides
    isTranslating = false; // Ensure translation can be triggered again
  }
}

// Position the popup near the current text selection
function positionPopupNearSelection(popupElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Position below the selection
  let top = rect.bottom + scrollY + 5; // 5px gap
  let left = rect.left + scrollX;

  // Ensure it fits horizontally
  popupElement.style.position = 'absolute'; // Ensure correct positioning mode
  popupElement.style.left = '0px'; // Set initial position for measurement
  popupElement.style.top = '0px';
  document.body.appendChild(popupElement); // Needs to be in DOM for measurement
  const popupWidth = popupElement.offsetWidth;
  const popupHeight = popupElement.offsetHeight;
  document.body.removeChild(popupElement); // Remove temporarily

  const windowWidth = window.innerWidth;
  if (left + popupWidth > windowWidth - 10) { // 10px margin from edge
    left = windowWidth - popupWidth - 10;
  }
  if (left < 10) {
      left = 10;
  }

  // Ensure it fits vertically (try placing above if not enough space below)
  const windowHeight = window.innerHeight;
   if (top + popupHeight > scrollY + windowHeight - 10) { // Check if goes below viewport
       let topAbove = rect.top + scrollY - popupHeight - 5; // Position above
       if (topAbove > scrollY + 10) { // Check if there is space above
           top = topAbove;
       } // Otherwise, let it clip at the bottom (or adjust further)
   }

  popupElement.style.top = `${top}px`;
  popupElement.style.left = `${left}px`;

  // Re-append to body after calculating position
  document.body.appendChild(popupElement);
}


// --- Start Initialization ---
// Run init only once the document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContentScript);
} else {
  initContentScript();
} 