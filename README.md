# CRX MCP over CDP Side Panel

## About

**This is a proof of concept demonstrating how to run a Model Context Protocol (MCP) server inside a Chrome Extension using Chrome DevTools Protocol (CDP) - no external server required.**

This repository showcases advanced browser automation and DOM interaction capabilities running entirely inside the browser, bringing MCP tools directly into the browser environment.

This project is a browser-native port of [browser-mcp-over-cdp](https://github.com/dumitrubogdanmihai/browser-mcp-over-cdp) by [dumitrubogdanmihai](https://github.com/dumitrubogdanmihai), adapted to run entirely within a Chrome extension environment using Chrome.debugger api.

## Demo Video

<video src="https://github.com/user-attachments/assets/a7b0bc43-7a8d-4dae-92c6-d82e09588b32" controls>
  <p>Your browser does not support the video tag. <a href="https://github.com/user-attachments/assets/a7b0bc43-7a8d-4dae-92c6-d82e09588b32">Click here to watch the demo</a></p>
</video>

### What is MCP over CDP?

Instead of running MCP servers externally, this extension runs an MCP server directly inside the browser using Chrome's extension APIs and the Chrome DevTools Protocol. This enables:

- **In-Browser Automation**: Full webpage interaction and control from within the browser
- **DOM Deep Inspection**: Access to nested iframes, shadow DOM, and enriched element details  
- **Real-Time Page Analysis**: Live accessibility trees, DOM snapshots, and visual screenshots
- **Extension Integration**: Seamless integration with Chrome extension capabilities

### Key Features

- **MCP Server in Browser**: Runs a complete MCP server inside the Chrome extension
- **CDP Integration**: Uses Chrome DevTools Protocol for deep browser control
- **Side Panel Interface**: Clean, modern UI with real-time logging and controls
- **Advanced DOM Access**: Captures nested iframes, shadow DOM, pseudo-elements, and event listeners
- **Visual & Text Snapshots**: Full-page screenshots and structured accessibility trees
- **Form Interactions**: Click, type, select, and submit form elements
- **Navigation Controls**: Browse history, reload, and tab management

## Credits

This project is based on the excellent work by [dumitrubogdanmihai](https://github.com/dumitrubogdanmihai) in the [browser-mcp-over-cdp](https://github.com/dumitrubogdanmihai/browser-mcp-over-cdp) repository. We adapted their MCP server implementation to run natively in a Chrome extension environment.

## Installation

### Prerequisites

Make sure you have [pnpm](https://pnpm.io/) installed on your system.

### Setup

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Start development:**

   ```bash
   pnpm dev
   ```

   This builds the extension with hot reloading enabled.

3. **Load the Chrome extension:**
   1. Open Chrome and navigate to `chrome://extensions/`
   2. Enable **Developer mode** in the top-right corner
   3. Click **"Load unpacked"**
   4. Select the `dist` folder from this project
   5. The extension should appear in your extensions list
   6. (Optional) Pin the extension to your toolbar for easy access

## Usage

### Opening the Side Panel

1. Click the extension icon in your Chrome toolbar
2. The side panel will open showing the MCP interface
3. The Service Console will display initialization logs

### Baby Animal Search Demo

The extension includes a built-in demonstration feature for testing MCP capabilities:

1. **Open the side panel** by clicking the extension icon
2. **Enter a search term** in the text field (e.g., "elephant")
3. **Choose your search method:**
   - Click **"Search (V1)"** for the primary search implementation
   - Click **"Search (V2)"** for the alternative search method
4. **Monitor the Service Console** below to see real-time logging of the MCP operations

The Service Console will show system messages like:

- `Side panel initialized`
- `Type "help" for available commands`

### Setting up API Keys

For AI-powered features, you'll need to configure API keys:

1. **Click the settings gear icon** (⚙️) in the top-right corner of the side panel
2. **Enter your API keys** in the configuration dialog:
   - **OpenAI (ChatGPT) API Key**: Required for ChatGPT features
   - **Google Gemini API Key**: Required for Google AI features
3. **Click "Save"** to store your credentials
4. **Click "Close"** to return to the main interface

**Note**: API keys are stored locally in your browser and are not transmitted to external servers except when making API calls to the respective services.

### Available MCP Tools

The extension provides a comprehensive set of MCP tools for browser automation:

#### Navigation Tools

- `do_navigate-to` - Navigate to any URL
- `get_current_page_url` - Get the current page URL  
- `do_go_back` / `do_go_forward` - Browser history navigation
- `do_reload` - Refresh the current page

#### Page Analysis Tools

- `get_page_snapshot_as_accessibility_tree` - Structured accessibility tree
- `get_page_snapshot_as_text` - DOM text with clickable element IDs
- `get_page_snapshot_as_jpeg_screenshoot` - Full page screenshot
- `get_page_enhanced_snapshot_as_jpeg_screenshoot` - Screenshot with interaction hints
- `get_console_logs` - Browser console messages

#### Interaction Tools

- `do_click_node_by_id` - Click elements by backend node ID
- `do_focus_node_by_id` - Focus form elements
- `do_send_keys_to_node_by_id` - Type text into elements
- `do_set_value_to_node_by_id` - Set input values directly
- `do_submit_node_by_id` - Submit forms
- `do_select_index_on_node_by_id` - Select dropdown options

#### Extension Tools

- `create_new_tab` - Create new browser tabs
- `open_landing_page` - Open the extension's landing page

### Example Usage with MCP Clients

The extension can be used with any MCP client. Here's an example configuration for Claude Desktop:

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/path/to/chrome-extension/background/index.js"]
    }
  }
}
```

## Development

### Project Structure

```text
chrome-extension/          # Main extension code
├── background/            # Background script with MCP server
├── public/               # Extension assets and manifest
└── utils/                # Build utilities

packages/
├── shared/               # Shared MCP and CDP implementations
│   └── src/crx-mcp/     # Core MCP over CDP logic
├── injected/            # Content script injections
└── dev-utils/           # Development utilities

pages/
├── side-panel/          # React-based side panel UI
├── content/             # Content scripts
└── content-main/        # Main content integration
```

### Building

- **Development build**: `pnpm dev`
- **Production build**: `pnpm build`
- **Type checking**: `pnpm type-check`
- **Linting**: `pnpm lint`

## Technology Stack

- **TypeScript** - Type-safe development
- **React** - Side panel user interface  
- **Vite** - Fast build tooling
- **Chrome Extension APIs** - Browser integration
- **Chrome DevTools Protocol** - Deep browser control
- **Model Context Protocol** - Standardized tool interface

## License

MIT License - see LICENSE file for details.

## Acknowledgments

Special thanks to [dumitrubogdanmihai](https://github.com/dumitrubogdanmihai) for creating the original [browser-mcp-over-cdp](https://github.com/dumitrubogdanmihai/browser-mcp-over-cdp) project that inspired this Chrome extension adaptation.

