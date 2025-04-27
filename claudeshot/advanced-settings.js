document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const modelsContainer = document.getElementById('models-container');
  const modelsLoading = document.getElementById('models-loading');
  const modelsError = document.getElementById('models-error');
  const pairsContainer = document.getElementById('pairs-container');
  const pairsLoading = document.getElementById('pairs-loading');
  const pairsError = document.getElementById('pairs-error');
  const defaultModelSelect = document.getElementById('default-model');
  const fallbackModelSelect = document.getElementById('fallback-model');
  const saveButton = document.getElementById('save-settings');
  const resetButton = document.getElementById('reset-settings');
  const statusContainer = document.getElementById('status-container');
  
  // Add backend selection elements
  const backendSection = document.createElement('section');
  backendSection.id = 'backend-section';
  backendSection.innerHTML = `
    <h2>Translation Backend</h2>
    <div class="form-group">
      <label for="active-backend">Active Backend:</label>
      <select id="active-backend">
        <option value="ollama">Ollama (Local AI Models)</option>
        <option value="chromeApi">Chrome Translation API</option>
      </select>
    </div>
    <div id="chrome-api-settings" class="backend-specific-settings hidden">
      <div class="form-group">
        <label>
          <input type="checkbox" id="chrome-detect-only">
          Detection Only Mode (No Translation)
        </label>
        <p class="setting-description">When enabled, Chrome API will only detect languages but not perform translations.</p>
      </div>
    </div>
  `;
  
  // Insert the backend section after the header
  const header = document.querySelector('header');
  header.parentNode.insertBefore(backendSection, header.nextSibling);
  
  // Get the new elements
  const activeBackendSelect = document.getElementById('active-backend');
  const chromeApiSettings = document.getElementById('chrome-api-settings');
  const chromeDetectOnlyCheckbox = document.getElementById('chrome-detect-only');

  // Global state
  let config = {};
  let availableModels = [];
  let languagePairs = [];
  let supportedLanguages = [];
  let modelStatuses = {};

  // Initialize the page
  initialize();

  async function initialize() {
    try {
      // Load configuration
      await loadConfig();
      
      // Set up backend selection
      setupBackendSelection();
      
      // Check model statuses
      await checkModelStatuses();
      
      // Populate UI
      populateModelsList();
      populateLanguagePairs();
      populateDefaultSelects();
      
      // Setup event listeners
      setupEventListeners();
      
      showStatus('Advanced settings loaded successfully', 'success');
    } catch (error) {
      console.error('Error initializing advanced settings:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  }

  async function loadConfig() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getConfig' }, response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response && response.success && response.config) {
          config = response.config;
          supportedLanguages = response.supportedLanguages || [];
          
          // Extract Ollama-specific configuration
          if (config.backendSettings && config.backendSettings.ollama) {
            const ollamaConfig = config.backendSettings.ollama;
            availableModels = ollamaConfig.models || [];
            languagePairs = ollamaConfig.languagePairs || [];
          } else {
            console.warn('Ollama configuration not found');
            availableModels = [];
            languagePairs = [];
          }
          
          console.log('Config loaded:', config);
          console.log('Available models:', availableModels);
          console.log('Language pairs:', languagePairs);
          
          resolve();
        } else {
          reject(new Error('Failed to load configuration'));
        }
      });
    });
  }

  function setupBackendSelection() {
    // Set the active backend in the dropdown
    if (config.activeBackend) {
      activeBackendSelect.value = config.activeBackend;
    }
    
    // Show/hide backend-specific settings based on the active backend
    updateBackendSettingsVisibility();
    
    // Set Chrome API settings
    if (config.backendSettings && config.backendSettings.chromeApi) {
      chromeDetectOnlyCheckbox.checked = config.backendSettings.chromeApi.detectOnly === true;
    }
    
    // Add event listener for backend selection change
    activeBackendSelect.addEventListener('change', updateBackendSettingsVisibility);
  }
  
  function updateBackendSettingsVisibility() {
    const selectedBackend = activeBackendSelect.value;
    
    // Show/hide backend-specific settings
    if (selectedBackend === 'chromeApi') {
      chromeApiSettings.classList.remove('hidden');
      document.getElementById('models-section').classList.add('hidden');
      document.getElementById('default-settings-section').classList.add('hidden');
    } else {
      chromeApiSettings.classList.add('hidden');
      document.getElementById('models-section').classList.remove('hidden');
      document.getElementById('default-settings-section').classList.remove('hidden');
    }
    
    // Update language pairs visibility based on backend
    updateLanguagePairsForBackend(selectedBackend);
  }
  
  function updateLanguagePairsForBackend(backend) {
    // Show all language pairs for now, but in the future you might want to
    // filter based on the backend's capabilities
    document.getElementById('language-pairs-section').classList.remove('hidden');
  }

  async function checkModelStatuses() {
    if (config.activeBackend !== 'ollama') {
      // Skip model status checks for non-Ollama backends
      return;
    }
    
    modelsLoading.classList.remove('hidden');
    
    try {
      // Check each model's status
      for (const model of availableModels) {
        try {
          const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { action: 'checkModelStatus', modelId: model.id },
              (result) => resolve(result)
            );
          });
          
          modelStatuses[model.id] = response.status === 'running';
          console.log(`Model ${model.id} status:`, modelStatuses[model.id]);
        } catch (error) {
          console.error(`Error checking status for model ${model.id}:`, error);
          modelStatuses[model.id] = false;
        }
      }
    } catch (error) {
      console.error('Error checking model statuses:', error);
      showStatus('Error checking model statuses', 'error');
    } finally {
      modelsLoading.classList.add('hidden');
      modelsContainer.classList.remove('hidden');
    }
  }

  function populateModelsList() {
    modelsContainer.innerHTML = '';
    
    if (config.activeBackend !== 'ollama') {
      modelsContainer.innerHTML = '<p>Model management is only available for the Ollama backend.</p>';
      return;
    }
    
    if (availableModels.length === 0) {
      modelsContainer.innerHTML = '<p>No models configured</p>';
      return;
    }
    
    availableModels.forEach(model => {
      const isAvailable = modelStatuses[model.id] === true;
      const isDefault = model.default === true;
      
      const modelCard = document.createElement('div');
      modelCard.className = 'model-card';
      modelCard.innerHTML = `
        <div class="model-info">
          <div class="model-name">${model.name || model.id}</div>
          <div class="model-id">${model.id}</div>
          ${isDefault ? '<div class="model-default">Default Model</div>' : ''}
        </div>
        <div class="model-status ${isAvailable ? 'status-available' : 'status-unavailable'}">
          ${isAvailable ? 'Available' : 'Unavailable'}
        </div>
      `;
      
      modelsContainer.appendChild(modelCard);
    });
  }

  function populateLanguagePairs() {
    pairsContainer.innerHTML = '';
    
    // Get the appropriate language pairs based on the active backend
    let activePairs = [];
    if (config.activeBackend === 'ollama' && config.backendSettings?.ollama?.languagePairs) {
      activePairs = config.backendSettings.ollama.languagePairs;
    } else if (config.activeBackend === 'chromeApi' && config.backendSettings?.chromeApi?.languagePairs) {
      activePairs = config.backendSettings.chromeApi.languagePairs;
    }
    
    if (activePairs.length === 0) {
      pairsContainer.innerHTML = '<p>No language pairs configured</p>';
      return;
    }
    
    // Create a language pair card for each pair
    activePairs.forEach(pair => {
      const pairCard = document.createElement('div');
      pairCard.className = 'language-pair';
      
      const sourceName = getLanguageName(pair.source);
      const targetName = getLanguageName(pair.target);
      
      let modelSelectHtml = '';
      if (config.activeBackend === 'ollama') {
        // For Ollama, show model selection dropdown
        modelSelectHtml = `
          <select class="pair-model-select" data-source="${pair.source}" data-target="${pair.target}">
            ${availableModels.map(model => `
              <option value="${model.id}" ${pair.preferredModel === model.id ? 'selected' : ''}>
                ${model.name || model.id}
              </option>
            `).join('')}
          </select>
        `;
      } else {
        // For Chrome API, no model selection needed
        modelSelectHtml = `<span>Chrome Translation API</span>`;
      }
      
      pairCard.innerHTML = `
        <div class="pair-header">
          <div class="pair-languages">${sourceName} → ${targetName}</div>
          <div class="pair-model">
            ${modelSelectHtml}
          </div>
        </div>
      `;
      
      pairsContainer.appendChild(pairCard);
    });
    
    pairsLoading.classList.add('hidden');
    pairsContainer.classList.remove('hidden');
  }

  function populateDefaultSelects() {
    // Only relevant for Ollama backend
    if (config.activeBackend !== 'ollama') {
      return;
    }
    
    // Clear existing options
    defaultModelSelect.innerHTML = '';
    fallbackModelSelect.innerHTML = '';
    
    // Add options for all available models
    availableModels.forEach(model => {
      // Default model select
      const defaultOption = document.createElement('option');
      defaultOption.value = model.id;
      defaultOption.textContent = model.name || model.id;
      defaultOption.selected = model.default === true;
      defaultModelSelect.appendChild(defaultOption);
      
      // Fallback model select
      const fallbackOption = document.createElement('option');
      fallbackOption.value = model.id;
      fallbackOption.textContent = model.name || model.id;
      fallbackOption.selected = model.id === config.backendSettings?.ollama?.fallbackModelId;
      fallbackModelSelect.appendChild(fallbackOption);
    });
  }

  function setupEventListeners() {
    // Save button
    saveButton.addEventListener('click', saveSettings);
    
    // Reset button
    resetButton.addEventListener('click', resetSettings);
  }

  async function saveSettings() {
    showStatus('Saving settings...', 'info');
    
    try {
      // Get the selected backend
      const selectedBackend = activeBackendSelect.value;
      
      // Prepare the updated config
      const updatedConfig = { ...config, activeBackend: selectedBackend };
      
      // Update backend-specific settings
      if (selectedBackend === 'ollama') {
        // Collect language pair settings for Ollama
        const updatedPairs = [];
        const pairSelects = document.querySelectorAll('.pair-model-select');
        
        pairSelects.forEach(select => {
          updatedPairs.push({
            source: select.dataset.source,
            target: select.dataset.target,
            preferredModel: select.value
          });
        });
        
        // Update default and fallback models
        const defaultModelId = defaultModelSelect.value;
        const fallbackModelId = fallbackModelSelect.value;
        
        // Update models array to mark the new default
        const updatedModels = availableModels.map(model => ({
          ...model,
          default: model.id === defaultModelId
        }));
        
        // Update Ollama config
        updatedConfig.backendSettings = {
          ...updatedConfig.backendSettings,
          ollama: {
            ...updatedConfig.backendSettings.ollama,
            models: updatedModels,
            languagePairs: updatedPairs,
            fallbackModelId: fallbackModelId
          }
        };
      } else if (selectedBackend === 'chromeApi') {
        // Update Chrome API config
        updatedConfig.backendSettings = {
          ...updatedConfig.backendSettings,
          chromeApi: {
            ...updatedConfig.backendSettings.chromeApi,
            detectOnly: chromeDetectOnlyCheckbox.checked
          }
        };
      }
      
      // Send the updated config to the background script
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'updateConfig', config: updatedConfig },
          (result) => resolve(result)
        );
      });
      
      if (response && response.success) {
        showStatus('Settings saved successfully', 'success');
        // Reload the config to reflect changes
        await loadConfig();
        setupBackendSelection();
        await checkModelStatuses();
        populateModelsList();
        populateLanguagePairs();
        populateDefaultSelects();
      } else {
        throw new Error(response?.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  }

  function resetSettings() {
    if (confirm('Are you sure you want to reset all advanced settings to defaults?')) {
      chrome.runtime.sendMessage({ action: 'resetConfig' }, async (response) => {
        if (response && response.success) {
          showStatus('Settings reset to defaults', 'success');
          // Reload everything
          await loadConfig();
          setupBackendSelection();
          await checkModelStatuses();
          populateModelsList();
          populateLanguagePairs();
          populateDefaultSelects();
        } else {
          showStatus('Failed to reset settings', 'error');
        }
      });
    }
  }

  // Helper function to get language name from code
  function getLanguageName(code) {
    const language = supportedLanguages.find(lang => lang.code === code);
    return language ? language.name : code;
  }

  // Helper function to get the default model ID
  function getDefaultModelId() {
    const defaultModel = availableModels.find(model => model.default === true);
    return defaultModel ? defaultModel.id : (availableModels[0]?.id || '');
  }

  // Helper to show status messages
  function showStatus(message, type = 'info') {
    statusContainer.innerHTML = `<div class="status ${type}">${message}</div>`;
    statusContainer.classList.remove('hidden');
    
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        statusContainer.classList.add('hidden');
      }, 3000);
    }
  }
}); 