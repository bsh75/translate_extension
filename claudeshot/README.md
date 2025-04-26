# Instant Translator Chrome Extension

A Chrome extension that provides instant translation of selected text using a local Ollama model.

## Features

- Translate any highlighted text on a webpage
- Display translations in a small popup next to your cursor
- Select from multiple target languages
- Uses the powerful Gemma3 language model running locally through Ollama
- Error reporting and logging for troubleshooting

## Requirements

- [Ollama](https://ollama.ai/) installed on your computer
- Gemma3 model pulled in Ollama (`ollama pull gemma3`)
- Ollama server running with CORS enabled.

**Option 1: Running Ollama Manually**

If you start Ollama manually in your terminal, you can enable CORS using an environment variable or a flag:
  ```bash
  # Using environment variable
  OLLAMA_ORIGINS='*' ollama serve
  ```
  Or:
  ```bash
  # Using command-line flag
  ollama serve --origins '*'
  ```
  *Note: Using `*` allows any origin. For better security, replace `*` with the specific Chrome extension ID (`chrome-extension://YOUR_EXTENSION_ID`) once you know it.*

**Option 2: Ollama Running as a Systemd Service (Common on Linux)**

If Ollama was installed as a system service (often the default on Linux), it might restart automatically. Running `ollama serve` manually will conflict. Instead, configure the service:

1.  **Stop the service:**
    ```bash
    sudo systemctl stop ollama
    ```
2.  **Create an override configuration file:**
    ```bash
    # Create the directory if it doesn't exist
    sudo mkdir -p /etc/systemd/system/ollama.service.d/
    # Create and edit the override file (using nano or your preferred editor)
    sudo nano /etc/systemd/system/ollama.service.d/override.conf
    ```
3.  **Add the environment variable setting to the file:**
    ```ini
    [Service]
    Environment="OLLAMA_ORIGINS=chrome-extension://*"
    ```
    *(Remember to replace `chrome-extension://*` with your actual extension ID for better security).*
    Save and close the file (Ctrl+X, then Y, then Enter in nano).

4.  **Reload systemd and restart Ollama:**
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl start ollama
    ```
5.  **(Optional) Check the status:**
    ```bash
    sudo systemctl status ollama
    ```

Now the Ollama service will run with the necessary CORS setting automatically.

## Installation

1. Clone this repository or download as ZIP
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the folder containing the extension files
5. The extension should now be installed and visible in your Chrome toolbar

## Usage

1. Make sure Ollama is running on your computer with the Gemma3 model available and CORS enabled (see Requirements)
2. Highlight any text on a webpage
3. A small popup will appear with the translation
4. Click anywhere else to dismiss the popup

## Settings

Click on the extension icon in the toolbar to access quick settings:

- Change the source and target languages
- Check Ollama connection status
- Access advanced settings

For more detailed settings and error logs, click on "Advanced Settings" in the popup menu.

## Configuration

The extension uses a central configuration file (`config.json`) to manage supported languages and translation models:

```json
{
  "version": "1.0",
  "defaultTargetLanguage": "Japanese",
  "defaultSourceLanguage": "English",
  "supportedLanguages": [
    {
      "code": "en",
      "name": "English",
      "enabled": true
    },
    {
      "code": "ja",
      "name": "Japanese",
      "enabled": true
    }
  ],
  "models": [
    {
      "id": "gemma3", // Or specify a more precise version like gemma3:9b
      "name": "Gemma3",
      "endpoint": "http://localhost:11434/api/generate", // Default Ollama endpoint
      "default": true,
      "promptTemplate": "Translate the following text from {sourceLanguage} to {targetLanguage}: \"{text}\""
    }
  ]
}
```

To add more languages or models:

1. Edit the `config.json` file
2. Add new entries to the `supportedLanguages` array with `enabled: true`
3. Configure additional models as needed

Currently, only English and Japanese are enabled, but you can easily add more languages by updating the configuration file.

## Architecture and Code Organization

The extension follows a modular architecture with clear separation of concerns:

### Core Components

- **manifest.json**: The extension configuration file that defines permissions, resources, and scripts
- **config.json**: Central configuration file for languages and models
- **background.js**: Service worker that runs persistently to handle context menus, initialization, and API status checks
- **content.js/css**: Content scripts injected into web pages to detect text selection and display translations
- **popup.html/js**: Quick settings interface accessed by clicking the extension icon
- **options.html/js**: Advanced settings and error log viewing

### Component Interactions

1. **Text Selection Flow**:
   - `content.js` detects when text is selected on a webpage
   - A popup is created and positioned near the cursor
   - The selected text is sent to the Ollama API for translation
   - The translation result is displayed in the popup

2. **Settings Management**:
   - User preferences are stored using Chrome's `storage.sync` API
   - Settings can be changed via the popup or options pages
   - Changes are applied immediately across all open tabs

3. **Error Handling**:
   - Translation errors are captured and stored for later review
   - Errors are displayed both inline (briefly) and in the options page
   - Users can troubleshoot connection issues with the API status check

4. **Configuration System**:
   - Central configuration loaded at extension startup
   - Dynamic UI elements based on configuration settings
   - Language and model selection synced across all components

### Code Design Principles

- **Progressive Enhancement**: Core functionality works with minimal permissions
- **Offline-First**: Uses local models to work without internet connectivity
- **User Privacy**: Keeps all translation data local to the user's machine
- **Responsive Design**: UI components adapt to different screen sizes and device types
- **Centralized Configuration**: Single source of truth for extension settings

## Local Model

This extension uses the Ollama API to communicate with a local language model. This approach has several benefits:

- Your data stays private and never leaves your computer
- No subscription or API fees
- Works offline once the model is downloaded
- High-quality translations from a powerful language model like Gemma3

## Troubleshooting

If translations aren't working:

1. Make sure Ollama is running with CORS enabled (see Requirements section for manual or service configuration)
2. Check that you've pulled the Gemma3 model (`ollama pull gemma3`)
3. Check the error log in Advanced Settings
4. Verify your computer's firewall isn't blocking the connection to `http://localhost:11434`

## License

MIT 