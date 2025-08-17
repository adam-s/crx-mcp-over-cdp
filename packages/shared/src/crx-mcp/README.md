# Baby Elephant Agent

A simple, working agent that demonstrates browser automation for image search and scraping. This agent is built on your existing Chrome extension scaffold and uses the ChromeExtensionDriver.

## Versions

### V1 Agent (`babyElephantAgent.ts`)
The original hardcoded agent that performs specific navigation steps.

### V2 Agent (`babyElephantAgent.v2.ts` + `babyElephantAgentV2Service.ts`)
An advanced LLM-driven agent that uses planning, action, and reflection loops for dynamic web automation.

**Architecture:**
- `babyElephantAgent.v2.ts` - Core agent logic with LLM planning
- `babyElephantAgentV2Service.ts` - Service integration layer that bridges the agent with the CRXMCPService infrastructure

**Key Features:**
- Natural language task interpretation
- Dynamic strategy adaptation based on website structure
- Loop detection and circuit breakers to prevent infinite loops
- Universal image extraction that works across multiple search engines
- Graceful error handling and recovery mechanisms

## What it does

The baby elephant agent performs two main tasks:

1. **`openImagesSearch`** — Navigates directly to DuckDuckGo's **images** results for a given query (no flaky selectors or typing)
2. **`scrapeImageUrls`** — Scrapes a handful of non-data URLs from `img` tags and returns them as a list

## How to use

### Basic usage (V1)

```typescript
import { runBabyElephantAgent } from './babyElephantAgent';

// Run with default query ("baby elephants")
const result = await runBabyElephantAgent();

// Run with custom query
const result = await runBabyElephantAgent('cute puppies');

console.log(result);
// {
//   success: true,
//   urls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg', ...],
//   message: 'Found 12 image URLs for "cute puppies"'
// }
```

### Integration with CRXMCPService

The agent is integrated into the existing `CRXMCPService`:

```typescript
// In your background script or service
const crxMcpService = instantiationService.createInstance(CRXMCPService);
const result = await crxMcpService.runBabyElephantAgent('baby elephants');
```

### Demo function

```typescript
import { runDemo } from './babyElephantAgent';

// Run the demo (searches for "baby elephants" and logs results)
await runDemo();
```

## How it works

1. **Driver Initialization**: Creates a new `ChromeExtensionDriver` instance
2. **Navigation**: Uses `driver.get()` to navigate to DuckDuckGo Images with the search query
3. **DOM Scraping**: Uses `driver.executeScript()` to run JavaScript in the page context that:
   - Finds all `img` elements
   - Extracts URLs from `src`, `data-src`, or `srcset` attributes
   - Filters out data URLs (keeps only external image URLs)
   - Deduplicates and limits results
4. **Result Format**: Returns a structured result with success status, URLs array, and message

## Key Features

- **No complex dependencies**: Uses only the existing ChromeExtensionDriver
- **Robust URL extraction**: Handles multiple image source attributes
- **Error handling**: Graceful failure with descriptive error messages
- **TypeScript support**: Fully typed with strong interfaces
- **Easy integration**: Fits into existing service architecture

## Example Output

```javascript
{
  success: true,
  urls: [
    'https://images.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.com%2Fbaby-elephant-1.jpg',
    'https://images.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.com%2Fbaby-elephant-2.jpg',
    // ... more URLs
  ],
  message: 'Found 12 image URLs for "baby elephants"'
}
```

## Extending the Agent

You can easily extend this agent by:

1. **Adding more search engines**: Modify `openImagesSearch` to support Google Images, Bing, etc.
2. **Enhanced scraping**: Add support for different image attributes or lazy loading
3. **Image processing**: Add image analysis, filtering, or downloading capabilities
4. **LangChain integration**: Wrap the functions in LangChain tools for LLM orchestration

## Troubleshooting

- **No URLs found**: Check if the page has loaded completely or if images are lazy-loaded
- **Navigation errors**: Ensure the ChromeExtensionDriver has proper permissions
- **Script execution errors**: Verify the page allows script execution in the context

## Dependencies

- `ChromeExtensionDriver` (existing)
- No additional external dependencies required
