# Driver Method Calls and Property Access Inventory

This document provides a comprehensive inventory of every method call and property accessed on the `driver` object as it's passed through the application.

## Driver Type Definition

The `driver` is of type `ChromeDriver` which extends `chromium.ChromiumWebDriver` with additional methods:

```typescript
interface ChromeDriver extends chromium.ChromiumWebDriver {
    sendAndGetDevToolsCommand(method: string, obj: any): Promise<any>;
    sendDevToolsCommand(method: string, obj: any): any;
    setNetworkConditions(): any;
    setDownloadPath(): any;
}
```

## Direct Driver Usage in MCP.ts

### Navigation Methods
- `driver.get(url)` - Navigate to a URL
- `driver.getCurrentUrl()` - Get the current page URL
- `driver.navigate().back()` - Go back in browser history
- `driver.navigate().forward()` - Go forward in browser history  
- `driver.navigate().refresh()` - Refresh the current page

### Wait and Execution Methods
- `driver.wait(async () => {...}, timeout)` - Wait for a condition with timeout
- `driver.executeScript("return document.readyState")` - Execute JavaScript to get page ready state

## Driver Usage in CDP.ts

### DevTools Command Methods
- `driver.sendAndGetDevToolsCommand("DOM.enable", {})` - Enable DOM domain
- `driver.sendAndGetDevToolsCommand("Accessibility.enable", {})` - Enable Accessibility domain
- `driver.sendAndGetDevToolsCommand("CSS.enable", {})` - Enable CSS domain
- `driver.sendAndGetDevToolsCommand("Console.enable", {})` - Enable Console domain
- `driver.sendAndGetDevToolsCommand("Network.enable", {})` - Enable Network domain
- `driver.sendAndGetDevToolsCommand("Overlay.enable", {})` - Enable Overlay domain

### CDP Connection Method
- `driver.createCDPConnection('page')` - Create CDP connection for page domain

## Driver Usage in CDP Domain Classes

### DOM.ts
- `driver.sendAndGetDevToolsCommand("DOM.describeNode", {...})` - Describe a DOM node
- `driver.sendAndGetDevToolsCommand("DOM.resolveNode", {...})` - Resolve a node to object ID
- `driver.sendAndGetDevToolsCommand("DOM.focus", {...})` - Focus a DOM element
- `driver.sendAndGetDevToolsCommand("DOM.getOuterHTML", {...})` - Get outer HTML of element
- `driver.sendAndGetDevToolsCommand("DOM.getDocument", {...})` - Get document root
- `driver.sendAndGetDevToolsCommand("DOM.querySelector", {...})` - Query selector on document
- `driver.sendAndGetDevToolsCommand("DOM.querySelectorAll", {...})` - Query selector all on document
- `driver.sendAndGetDevToolsCommand("DOM.getBoxModel", {...})` - Get box model of element

### Accessibility.ts
- `driver.sendAndGetDevToolsCommand("Accessibility.getRootAXNode", {})` - Get root accessibility node
- `driver.sendAndGetDevToolsCommand("Accessibility.getFullAXTree", {})` - Get full accessibility tree

### Console.ts
- `driver.sendAndGetDevToolsCommand("Console.clearMessages", {})` - Clear console messages

### CSS.ts
- `driver.sendAndGetDevToolsCommand("CSS.getComputedStyleForNode", {...})` - Get computed styles for node

### DOMDebugger.ts
- `driver.sendAndGetDevToolsCommand("DOMDebugger.getEventListeners", {...})` - Get event listeners for node

### DOMSnapshot.ts
- `driver.sendAndGetDevToolsCommand("DOMSnapshot.enable", {})` - Enable DOM snapshot domain
- `driver.sendAndGetDevToolsCommand("DOMSnapshot.disable", {})` - Disable DOM snapshot domain
- `driver.sendAndGetDevToolsCommand("DOMSnapshot.captureSnapshot", {...})` - Capture DOM snapshot
- `driver.sendAndGetDevToolsCommand("DOMSnapshot.getSnapshot", {...})` - Get DOM snapshot

### Input.ts
- `driver.sendAndGetDevToolsCommand("Input.dispatchKeyEvent", {...})` - Dispatch key event

### Network.ts
- No direct driver method calls (uses CDP session)

### Overlay.ts
- `driver.sendAndGetDevToolsCommand("Overlay.highlightNode", {...})` - Highlight a node

### Page.ts
- `driver.sendAndGetDevToolsCommand("Page.captureScreenshot", {...})` - Capture page screenshot

### Profiler.ts
- No direct driver method calls (uses CDP session)

### Runtime.ts
- `driver.sendAndGetDevToolsCommand("Runtime.callFunctionOn", {...})` - Call function on object

### Target.ts
- `driver.sendAndGetDevToolsCommand("Console.clearMessages", {})` - Clear console messages

## Driver Usage in DomInteractionsOperator.ts

The `DomInteractionsOperator` class stores the driver as a property but doesn't directly call driver methods. Instead, it uses the CDP domain classes (DOM, Runtime, Input) which internally use the driver.

## Commented/Unused Code

### Page.ts (Commented Methods)
The following methods are commented out but show additional driver usage patterns:
- `driver.execute_cdp_cmd("DOM.getContentQuads", {...})` - Get content quads
- `driver.execute_cdp_cmd("DOM.getBoxModel", {...})` - Get box model
- `driver.execute_cdp_cmd("Page.captureScreenshot", {...})` - Capture screenshot with clip

## Summary by Category

### Navigation & Page Control
- `get(url)`, `getCurrentUrl()`, `navigate().back()`, `navigate().forward()`, `navigate().refresh()`

### DevTools Protocol Commands
- `sendAndGetDevToolsCommand()` - Used extensively across all CDP domains
- `sendDevToolsCommand()` - Available but not used in current codebase
- `execute_cdp_cmd()` - Used in commented code

### CDP Connection
- `createCDPConnection()` - Creates WebSocket connection for CDP

### Wait & Execution
- `wait()` - Wait for conditions
- `executeScript()` - Execute JavaScript in page context

### Network & Download (Available but Unused)
- `setNetworkConditions()` - Available in interface but not used
- `setDownloadPath()` - Available in interface but not used

## Usage Patterns

1. **Direct Selenium Methods**: Used for basic browser navigation and page interaction
2. **DevTools Protocol**: Used extensively for advanced browser control and debugging
3. **CDP Session**: Used for real-time communication with browser DevTools
4. **JavaScript Execution**: Used for page state checking and DOM manipulation

The driver serves as the central interface between the application and the Chrome browser, providing both traditional Selenium WebDriver capabilities and advanced Chrome DevTools Protocol access.
