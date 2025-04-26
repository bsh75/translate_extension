/**
 * popup.js - JavaScript for the Popup UI in Instant Translator Extension
 * 
 * This script handles the functionality of the extension's popup interface that appears
 * when the user clicks on the extension icon in the browser toolbar. It provides:
 * 
 * 1. Source and target language selection and persistence via Chrome's storage API
 * 2. Ollama connection status checking
 * 3. User feedback through status messages
 * 
 * The popup serves as the main settings interface for the extension, allowing users
 * to change which languages they want to translate between.
 */

// Global configuration (loaded from background)
let config = {};
let allLanguages = []; // Full list from config

document.addEventListener('DOMContentLoaded', () => {
  const sourceLanguageSelect = document.getElementById('source-language');
  const targetLanguageSelect = document.getElementById('target-language');
  const checkStatusBtn = document.getElementById('check-status');
  const statusContainer = document.getElementById('status-container');
  const translationStyleRadios = document.getElementsByName('translation-style');
  
  // Load configuration and setup UI
  loadConfigAndLanguages()
    .then(() => {
      populateLanguageDropdowns();
      loadSavedSettings();
    })
    .catch(error => {
      console.error('Error initializing popup:', error);
      showStatus('Error loading settings', 'error');
      // Populate with minimal defaults if loading failed
      populateLanguageDropdowns(); // Will use hardcoded defaults if allLanguages is empty
      loadSavedSettings();
    });
  
  // Save source language when changed
  sourceLanguageSelect.addEventListener('change', () => {
    const selectedLanguage = sourceLanguageSelect.value;
    chrome.storage.sync.set({ sourceLanguage: selectedLanguage }, () => {
      showStatus(`Source language set to ${selectedLanguage}`, 'success');
    });
  });
  
  // Save target language when changed
  targetLanguageSelect.addEventListener('change', () => {
    const selectedLanguage = targetLanguageSelect.value;
    chrome.storage.sync.set({ targetLanguage: selectedLanguage }, () => {
      showStatus(`Target language set to ${selectedLanguage}`, 'success');
    });
  });
  
  // Save translation style when changed
  translationStyleRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        chrome.storage.sync.set({ translationStyle: radio.value }, () => {
          showStatus(`Translation style set to ${radio.value === 'natural' ? 'Natural' : 'Word-for-Word'}`, 'success');
        });
      }
    });
  });
  
  // Check backend status
  checkStatusBtn.addEventListener('click', (e) => {
    e.preventDefault();
    showStatus('Checking backend status...', 'info');

    chrome.runtime.sendMessage({ action: 'checkBackendStatus' }, (response) => {
       if (chrome.runtime.lastError) {
          console.error("Error checking backend status:", chrome.runtime.lastError.message);
          showStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
          return;
       }
       
      if (response && response.status === 'running') {
        showStatus('Backend is running and ready!', 'success');
      } else {
        const errorMsg = response && response.message
          ? response.message
          : 'Could not get status from backend.';
        showStatus(`Error: ${errorMsg}`, 'error');
      }
    });
  });
  
  // Load configuration and language list from background script
  async function loadConfigAndLanguages() {
    console.log('Popup: Requesting config and languages...');
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getConfig' }, response => {
        if (chrome.runtime.lastError) {
           console.error("Error getting config/languages:", chrome.runtime.lastError.message);
           reject(new Error(chrome.runtime.lastError.message));
           return;
        }
        if (response && response.success && response.config && response.supportedLanguages) {
          config = response.config;
          allLanguages = response.supportedLanguages; // Use the full list from background
          console.log('Popup: Config and languages loaded', config, allLanguages);
          resolve();
        } else {
          console.warn('Popup: Failed to load config/languages from background', response);
          reject(new Error('Failed to load settings from background script.'));
        }
      });
    });
  }
  
  // Populate language dropdowns from the loaded language list
  function populateLanguageDropdowns() {
    // Clear existing options first
    sourceLanguageSelect.innerHTML = '';
    targetLanguageSelect.innerHTML = '';
    
    const languagesToDisplay = allLanguages && allLanguages.length > 0 ? allLanguages : [
        // Hardcoded minimal defaults if loading failed
        { code: "auto", name: "Auto-detect", enabled: true },
        { code: "en", name: "English", enabled: true },
        { code: "ja", name: "Japanese", enabled: true },
        { code: "es", name: "Spanish", enabled: true }
    ];

    if (!allLanguages || allLanguages.length === 0) {
        console.warn('Popup: Using hardcoded language list for dropdowns.');
    }

    languagesToDisplay.forEach(language => {
      if (language.enabled) {
        // Add all enabled languages (including Auto-detect) to source
        addLanguageOption(sourceLanguageSelect, language.name);

        // Add enabled languages EXCEPT Auto-detect to target
        if (language.code !== 'auto') {
          addLanguageOption(targetLanguageSelect, language.name);
        }
      }
    });
  }
  
  // Helper to add an option to a select element
  function addLanguageOption(selectElement, languageName) {
    const option = document.createElement('option');
    option.value = languageName;
    option.textContent = languageName;
    selectElement.appendChild(option);
  }
  
  // Load saved languages and style from storage and set UI elements
  function loadSavedSettings() {
    chrome.storage.sync.get(['sourceLanguage', 'targetLanguage', 'translationStyle'], (result) => {
      // Set source language dropdown
      const defaultSource = config?.defaultSourceLanguage || 'Auto-detect';
      if (result.sourceLanguage && sourceLanguageSelect.querySelector(`option[value="${result.sourceLanguage}"]`)) {
        sourceLanguageSelect.value = result.sourceLanguage;
      } else {
        sourceLanguageSelect.value = defaultSource; // Fallback to config default
      }

      // Set target language dropdown
      const defaultTarget = config?.defaultTargetLanguage || 'English';
      if (result.targetLanguage && targetLanguageSelect.querySelector(`option[value="${result.targetLanguage}"]`)) {
        targetLanguageSelect.value = result.targetLanguage;
      } else {
        targetLanguageSelect.value = defaultTarget; // Fallback to config default
      }

      // Set translation style radio button
      const defaultStyle = config?.defaultTranslationStyle || 'natural';
      const style = result.translationStyle || defaultStyle;
      translationStyleRadios.forEach(radio => {
        radio.checked = (radio.value === style);
      });
      
      console.log('Popup: Loaded settings from storage:', result);
    });
  }
  
  // Helper to show status messages in the popup
  function showStatus(message, type = 'info') {
    // Clear previous message timer if exists
    if (window.statusTimeout) {
        clearTimeout(window.statusTimeout);
    }
    
    statusContainer.innerHTML = `<div class="status ${type}">${message}</div>`;
    statusContainer.style.display = 'block'; // Make sure it's visible

    // Auto-hide success/info messages after 3 seconds
    if (type === 'success' || type === 'info') {
      window.statusTimeout = setTimeout(() => {
        statusContainer.innerHTML = '';
        statusContainer.style.display = 'none';
        window.statusTimeout = null;
      }, 3000);
    }
  }
}); 