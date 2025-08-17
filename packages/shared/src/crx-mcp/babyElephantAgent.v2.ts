// babyElephantAgent.v2.ts
// Optimized Agent: single LLM call per loop, consolidated heuristics, cleaner structure.
// Simplified version that integrates with existing CRXMCPService infrastructure

import { ChatOpenAI } from '@langchain/openai';

/* ----------------------------- Agent Types ----------------------------- */
export type AgentEvent = {
  step: number;
  phase: 'plan' | 'act' | 'finish' | 'error';
  message: string;
  details?: Record<string, unknown>;
};

export interface AgentIO {
  /** Natural-language task from the user */
  task: string;
  /** Optional: URL to start from */
  startUrl?: string;
  /** Optional: high-level guardrails */
  maxSteps?: number;
  /** Set to true to keep cheap model for plan/reflection */
  devMode?: boolean;
  /** Hook for telemetry */
  onEvent?: (e: AgentEvent) => void;
  /** OpenAI API key */
  apiKey: string;
}

export interface AgentResult {
  success: boolean;
  steps: number;
  finalResult?: string;
  error?: string;
  events: AgentEvent[];
}

/* ------------------------- Tool Interface ------------------------- */
export interface AgentTools {
  navigateTo: (url: string) => Promise<string>;
  takeScreenshot: () => Promise<string>;
  takeDomSnapshot: () => Promise<string>;
  clickElement: (selector: string) => Promise<string>;
  typeText: (selector: string, text: string) => Promise<string>;
  extractImageUrls: () => Promise<string[]>;
  getCurrentUrl: () => Promise<string>;
  clickNodeById: (backendNodeId: number) => Promise<string>;
  typeIntoNodeById: (backendNodeId: number, text: string) => Promise<string>;
}

/* ------------------------- Enhanced Agent State ------------------------- */
interface AgentHistoryItem {
  action: string;
  result: string;
}

interface AgentState {
  task: string;
  step: number;
  events: AgentEvent[];
  history: AgentHistoryItem[];
  done: boolean;
  result?: string;
  searchPhase: 'none' | 'post-search-snapshot' | 'post-search-click-images';
}

/* ------------------------- URL Helpers ------------------------- */
const isDuckDuckGoImages = (u: string) =>
  /duckduckgo\.com\/\?[^#]*(\b(iax|iar|ia)=images\b)/i.test(u);
const isGoogleImagesResults = (u: string) =>
  /google\.[^/]+\/search\?.*\btbm=isch\b/i.test(u) ||
  (/google\.[^/]+\/search/.test(u) && u.includes('udm=2')) ||
  /images\.google\.[^/]+/.test(u);
const isBingImagesResults = (u: string) => /bing\.com\/images\/search\?.*\bq=/i.test(u);
const isAnyImageResults = (u: string) =>
  isDuckDuckGoImages(u) || isGoogleImagesResults(u) || isBingImagesResults(u);

/* ------------------------- Search Term Extraction ------------------------- */
function extractSearchTermFromTask(task: string): string {
  // Try to extract search term from common patterns
  const patterns = [
    /search for ["']([^"']+)["']/i,
    /find.*["']([^"']+)["']/i,
    /looking for ["']([^"']+)["']/i,
    /pictures of ([^,.\n]+)/i,
    /images of ([^,.\n]+)/i,
    /find ([^,.\n]+) (pictures|images)/i,
    /search.*for ([^,.\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = task.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: extract any quoted text
  const quotedMatch = task.match(/["']([^"']+)["']/);
  if (quotedMatch && quotedMatch[1]) {
    return quotedMatch[1].trim();
  }

  // Last resort: look for common words after "baby" or similar
  const babyMatch = task.match(/baby\s+(\w+)/i);
  if (babyMatch && babyMatch[1]) {
    return `baby ${babyMatch[1]}`;
  }

  // Default fallback
  return 'baby cat';
}

function buildDuckDuckGoImagesUrl(searchTerm: string): string {
  const encodedTerm = encodeURIComponent(searchTerm).replace(/%20/g, '+');
  return `https://duckduckgo.com/?q=${encodedTerm}&iax=images&ia=images`;
}

/* ------------------------- System Prompts ------------------------- */
const SYSTEM_PROMPT = `You are babyElephant agent v2, a universal web automation assistant.

Your goal is to complete the user's task by navigating and interacting with websites.

**Core Principles:**
1. **OBSERVE**: Use takeDomSnapshot() to understand the page structure
2. **PLAN**: Based on your observation and the task, choose the single best tool to use next
3. **ACT**: Execute the chosen tool
4. **ADAPT**: If a tool fails or doesn't bring you closer to the goal, analyze the result and try a different approach

**Workflow for Image Searches:**
1. Navigate to a search engine like DuckDuckGo or Google Images
2. Use takeDomSnapshot() to find the search input's backend node ID
3. Use typeIntoNodeById(id, "search term") to enter the query
4. Use clickNodeById(id) to click the search button
5. If not on an image results page, find and click the "Images" tab or filter
6. **ONLY THEN**, use extractImageUrls() to get the results

**FINISHING THE TASK:**
When you have successfully completed the task (e.g., you have extracted the image URLs), respond with "FINISH: [your summary of the result]".

Analyze the history of actions and results, the current URL, and the task to decide the next logical action.`;

/* ------------------------- Main Agent Function (Optimized) ------------------------- */
export async function runAgentV2(io: AgentIO, tools: AgentTools): Promise<AgentResult> {
  const onEvent = io.onEvent ?? (() => {});
  const maxSteps = io.maxSteps ?? 15;

  const llm = new ChatOpenAI({
    apiKey: io.apiKey,
    model: io.devMode ? 'gpt-4o-mini' : 'gpt-4o',
    temperature: 0,
  });

  const state: AgentState = {
    task: io.task,
    step: 0,
    events: [],
    history: [],
    done: false,
    searchPhase: 'none',
  };

  const addEvent = (
    phase: AgentEvent['phase'],
    message: string,
    details?: Record<string, unknown>,
  ) => {
    const event: AgentEvent = { step: state.step, phase, message, details };
    state.events.push(event);
    onEvent(event);
  };

  addEvent('plan', `Starting agent with task: ${io.task}`);

  // Initial setup
  if (io.startUrl) {
    addEvent('act', `Navigating to start URL: ${io.startUrl}`);
    const navResult = await tools.navigateTo(io.startUrl);
    state.history.push({ action: `navigateTo("${io.startUrl}")`, result: navResult });
  }

  try {
    console.log(
      `[runAgentV2.mainLoop] Starting main agent loop with maxSteps: ${maxSteps}, task: ${io.task} #####`,
    );
    // Main agent loop
    for (let step = 1; step <= maxSteps; step++) {
      state.step = step;
      console.log(
        `[runAgentV2.mainLoop] Beginning step ${step}, searchPhase: ${state.searchPhase} #####`,
      );

      const currentUrlResult = await tools.getCurrentUrl().catch(() => '');
      console.log(`[runAgentV2.mainLoop] Current URL raw result: ${currentUrlResult} #####`);

      // Extract URL from JSON object if needed
      let currentUrl = currentUrlResult;
      if (typeof currentUrlResult === 'string' && currentUrlResult.startsWith('{')) {
        try {
          const parsed = JSON.parse(currentUrlResult);
          currentUrl = parsed.url || currentUrlResult;
        } catch {
          currentUrl = currentUrlResult;
        }
      }
      console.log(`[runAgentV2.mainLoop] Current URL extracted: ${currentUrl} #####`);

      // 1. Plan the next action (incorporates reflection)
      addEvent('plan', `Planning step ${step}...`);
      console.log(
        `[runAgentV2.mainLoop] Calling getNextAction with state.searchPhase: ${state.searchPhase}, historyLength: ${state.history.length} #####`,
      );
      const nextAction = await getNextAction(state, currentUrl, llm);
      console.log(`[runAgentV2.mainLoop] getNextAction returned: ${nextAction} #####`);

      if (nextAction.startsWith('FINISH:')) {
        const finalResult = nextAction.replace('FINISH:', '').trim();
        console.log(
          `[runAgentV2.mainLoop] FINISH command detected, finalResult: ${finalResult} #####`,
        );
        state.result = finalResult;
        state.done = true;
        addEvent('finish', `Task completed: ${finalResult}`);
        break;
      }

      // 2. Execute the action
      addEvent('act', `Executing: ${nextAction}`);
      console.log(`[runAgentV2.mainLoop] About to execute action: ${nextAction} #####`);
      let actionResult: string;
      try {
        actionResult = await executeAction(nextAction, tools, state);
        console.log(
          `[runAgentV2.mainLoop] Action executed successfully, result length: ${actionResult.length} chars #####`,
        );

        // Auto-complete if extraction was successful
        if (actionResult.includes('✅ SUCCESS: Found')) {
          console.log(
            `[runAgentV2.mainLoop] SUCCESS marker detected in result, completing task #####`,
          );
          state.result = actionResult;
          state.done = true;
          addEvent('finish', `Task completed: ${actionResult}`);
          break;
        }
      } catch (error) {
        actionResult = `Error: ${(error as Error).message}`;
        console.log(`[runAgentV2.mainLoop] Action execution failed: ${actionResult} #####`);
        addEvent('error', actionResult);
      }

      // 3. Update state with the result
      state.history.push({ action: nextAction, result: actionResult });
      console.log(
        `[runAgentV2.mainLoop] Updated history, new length: ${state.history.length} #####`,
      );

      // 4. Update search phase state machine
      const lastAction = state.history.slice(-1)[0]?.action ?? '';
      const secondLastAction = state.history.slice(-2)[0]?.action ?? '';
      console.log(
        `[runAgentV2.mainLoop] State machine check - current phase: ${state.searchPhase}, lastAction: ${lastAction}, secondLastAction: ${secondLastAction} #####`,
      );

      // Check for stuck cycles and reset if needed
      const recentHistory = state.history.slice(-6);
      const hasRepeatedTypeClick =
        recentHistory.filter(
          h => h.action.includes('typeIntoNodeById') || h.action.includes('clickNodeById(2048)'),
        ).length >= 4;

      if (hasRepeatedTypeClick && state.searchPhase !== 'none') {
        console.log(
          `[runAgentV2.mainLoop] Detected stuck cycle, forcing state reset to 'none' #####`,
        );
        state.searchPhase = 'none';
      } else if (
        state.searchPhase === 'none' &&
        lastAction.includes('clickNodeById') &&
        secondLastAction.includes('typeIntoNodeById')
      ) {
        console.log(
          `[runAgentV2.mainLoop] State machine transition: none -> post-search-snapshot #####`,
        );
        state.searchPhase = 'post-search-snapshot';
      } else if (state.searchPhase === 'post-search-snapshot') {
        console.log(
          `[runAgentV2.mainLoop] State machine transition: post-search-snapshot -> post-search-click-images #####`,
        );
        state.searchPhase = 'post-search-click-images';
      } else if (state.searchPhase === 'post-search-click-images') {
        console.log(
          `[runAgentV2.mainLoop] State machine transition: post-search-click-images -> none (reset) #####`,
        );
        state.searchPhase = 'none'; // Reset after attempting to click
      }

      console.log(
        `[runAgentV2.mainLoop] Completed step ${step}, new searchPhase: ${state.searchPhase} #####`,
      );
    }

    if (!state.done) {
      console.log(`[runAgentV2.mainLoop] Agent reached maxSteps without completion #####`);
      addEvent('finish', 'Reached maximum steps without completion.');
      state.result = 'Agent timed out after reaching the maximum number of steps.';
    }

    console.log(
      `[runAgentV2.mainLoop] Returning result - success: ${state.done}, steps: ${state.step}, finalResult: ${state.result} #####`,
    );
    return {
      success: state.done,
      steps: state.step,
      finalResult: state.result,
      error: state.done ? undefined : state.result,
      events: state.events,
    };
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.log(`[runAgentV2.mainLoop] Unhandled error caught: ${errorMsg} #####`);
    addEvent('error', `Agent failed with unhandled error: ${errorMsg}`);
    return { success: false, steps: state.step, error: errorMsg, events: state.events };
  }
}

/**
 * Decides the next action to take by consulting the LLM and applying heuristics.
 */
async function getNextAction(
  state: AgentState,
  currentUrl: string,
  llm: ChatOpenAI,
): Promise<string> {
  console.log(
    `[getNextAction] Called with searchPhase: ${state.searchPhase}, currentUrl: ${currentUrl} #####`,
  );

  // ** Consolidated Heuristic Check **
  // If we are on an image results page, the best action is always to extract.
  console.log(`[getNextAction] Checking if URL is images page: ${currentUrl} #####`);
  console.log(`[getNextAction] isDuckDuckGoImages: ${isDuckDuckGoImages(currentUrl)} #####`);
  console.log(`[getNextAction] isGoogleImagesResults: ${isGoogleImagesResults(currentUrl)} #####`);
  console.log(`[getNextAction] isBingImagesResults: ${isBingImagesResults(currentUrl)} #####`);

  if (isAnyImageResults(currentUrl)) {
    // Check if we've already tried extracting multiple times with no results
    const recentExtractions = state.history
      .slice(-3)
      .filter(
        h => h.action.includes('extractImageUrls') && h.result.includes('Found 0 image URLs'),
      ).length;

    if (recentExtractions >= 2) {
      console.log(
        `[getNextAction] Multiple failed extractions detected, taking DOM snapshot for debugging #####`,
      );
      return 'takeDomSnapshot()';
    }

    console.log(`[getNextAction] Image results page detected, returning extractImageUrls() #####`);
    return 'extractImageUrls()';
  }

  // ** State Machine for Post-Search Actions **
  if (state.searchPhase === 'post-search-snapshot') {
    console.log(`[getNextAction] In post-search-snapshot phase, forcing takeDomSnapshot() #####`);
    return 'takeDomSnapshot()';
  }
  if (state.searchPhase === 'post-search-click-images') {
    console.log(
      `[getNextAction] In post-search-click-images phase, looking for last DOM snapshot #####`,
    );
    const lastDomSnapshot = state.history
      .slice()
      .reverse()
      .find(h => h.action.includes('takeDomSnapshot'))?.result;

    if (lastDomSnapshot) {
      // Check if we've already tried clicking the Images tab multiple times without success
      const recentClickImageAttempts = state.history
        .slice(-3)
        .filter(h => h.action.includes('clickNodeById(1936)')).length;

      if (recentClickImageAttempts >= 2) {
        console.log(
          `[getNextAction] Multiple failed Images tab clicks detected, trying direct navigation #####`,
        );
        const searchTerm = extractSearchTermFromTask(state.task);
        console.log(
          `[getNextAction] Extracted search term: "${searchTerm}" from task: "${state.task}" #####`,
        );
        return `navigateTo("${buildDuckDuckGoImagesUrl(searchTerm)}")`;
      }

      console.log(
        `[getNextAction] Found DOM snapshot (${lastDomSnapshot.length} chars), sending targeted prompt to LLM #####`,
      );
      const clickImagesPrompt = `
You have just performed a search and taken a DOM snapshot. Your ONLY goal now is to find and click the "Images" tab or link to see the image results.

Analyze the following DOM snapshot and find the element that corresponds to the "Images" link or tab.

**DOM Snapshot:**
${lastDomSnapshot}

Based on the snapshot, what is the exact \`clickNodeById(id)\` command to click the "Images" tab?
Your response must be ONLY the command, e.g., \`clickNodeById(123)\`. Do not add any other text.`;
      const response = await llm.invoke(clickImagesPrompt);
      const action = response.content as string;
      console.log(`[getNextAction] LLM returned action for images tab: ${action} #####`);
      return action;
    } else {
      console.log(
        `[getNextAction] No DOM snapshot found in history, fallback to general planning #####`,
      );
    }
  }

  // If we seem stuck in a loop taking snapshots, force a different action.
  const recentActions = state.history.slice(-3).map(h => h.action);
  if (recentActions.every(a => a.includes('takeDomSnapshot'))) {
    console.log(
      `[getNextAction] Snapshot loop detected, forcing navigation to DuckDuckGo Images #####`,
    );
    const searchTerm = extractSearchTermFromTask(state.task);
    console.log(
      `[getNextAction] Extracted search term: "${searchTerm}" from task: "${state.task}" #####`,
    );
    return `navigateTo("${buildDuckDuckGoImagesUrl(searchTerm)}")`;
  }

  // Detect if we're repeating the same type->click->snapshot cycle
  const recentCycles = state.history.slice(-6);
  const hasTypeClickPattern =
    recentCycles.some(h => h.action.includes('typeIntoNodeById')) &&
    recentCycles.some(h => h.action.includes('clickNodeById'));

  if (hasTypeClickPattern && state.history.length > 8) {
    console.log(
      `[getNextAction] Detected repeated type-click cycles, forcing direct navigation #####`,
    );
    const searchTerm = extractSearchTermFromTask(state.task);
    console.log(
      `[getNextAction] Extracted search term: "${searchTerm}" from task: "${state.task}" #####`,
    );
    return `navigateTo("${buildDuckDuckGoImagesUrl(searchTerm)}")`;
  }

  // ** General LLM Planning (if no specific heuristic applies) **
  console.log(
    `[getNextAction] Using general LLM planning, historyLength: ${state.history.length} #####`,
  );
  const historyText = state.history
    .slice(-5) // Use last 5 interactions
    .map(item => `Action: ${item.action}\nResult: ${item.result}`)
    .join('\n\n');

  const planPrompt = `
${SYSTEM_PROMPT}

**Task**: ${state.task}
**Current URL**: ${currentUrl || 'Unknown'}

**Recent History:**
${historyText}

Based on the history and current state, what is the single next action to perform?
Choose ONE action from the available tools: navigateTo, takeDomSnapshot, clickNodeById, typeIntoNodeById, extractImageUrls.
Your response should be ONLY the action call (e.g., takeDomSnapshot()) or a FINISH message.`;

  console.log(
    `[getNextAction] Sending general planning prompt to LLM (${planPrompt.length} chars) #####`,
  );
  const response = await llm.invoke(planPrompt);
  const action = response.content as string;
  console.log(`[getNextAction] LLM returned general action: ${action} #####`);
  return action;
}

/* ------------------------- Action Executor (Simplified) ------------------------- */
async function executeAction(
  planText: string,
  tools: AgentTools,
  state?: AgentState,
): Promise<string> {
  console.log(`[executeAction] Called with planText: ${planText} #####`);
  const cleanedPlan = planText.trim().replace(/^Action:\s*/i, '');
  const text = cleanedPlan.toLowerCase();
  console.log(`[executeAction] Cleaned plan: ${cleanedPlan}, lowercase: ${text} #####`);

  if (text.startsWith('navigateto')) {
    console.log(`[executeAction] Detected navigateTo action #####`);
    const urlMatch = cleanedPlan.match(/navigateTo\s*\(\s*["']([^"']+)["']\s*\)/i);
    if (urlMatch) {
      console.log(`[executeAction] Extracted URL: ${urlMatch[1]} #####`);
      return tools.navigateTo(urlMatch[1]);
    }
    console.log(`[executeAction] Failed to parse URL from navigateTo command #####`);
    throw new Error('Could not parse URL from navigateTo command');
  }

  if (text.startsWith('takedomsnapshot')) {
    console.log(`[executeAction] Executing takeDomSnapshot #####`);
    return tools.takeDomSnapshot();
  }

  if (text.startsWith('takescreenshot')) {
    console.log(`[executeAction] Executing takeScreenshot #####`);
    return tools.takeScreenshot();
  }

  if (text.startsWith('clicknodebyid')) {
    console.log(`[executeAction] Detected clickNodeById action #####`);
    const idMatch = cleanedPlan.match(/clickNodeById\s*\(\s*(\d+)\s*\)/i);
    if (idMatch) {
      console.log(`[executeAction] Extracted node ID: ${idMatch[1]} #####`);
      return tools.clickNodeById(parseInt(idMatch[1]));
    }
    console.log(`[executeAction] Failed to parse backend node ID from clickNodeById command #####`);
    throw new Error('Could not parse backend node ID from clickNodeById command');
  }

  if (text.startsWith('typeintonodebyid')) {
    console.log(`[executeAction] Detected typeIntoNodeById action #####`);
    const typeMatch = cleanedPlan.match(
      /typeIntoNodeById\s*\(\s*(\d+)\s*,\s*["']([^"']+)["']\s*\)/i,
    );
    if (typeMatch) {
      console.log(
        `[executeAction] Extracted node ID: ${typeMatch[1]}, text: ${typeMatch[2]} #####`,
      );
      return tools.typeIntoNodeById(parseInt(typeMatch[1]), typeMatch[2]);
    }
    console.log(
      `[executeAction] Failed to parse backend node ID and text from typeIntoNodeById command #####`,
    );
    throw new Error('Could not parse backend node ID and text from typeIntoNodeById command');
  }

  if (text.startsWith('extractimageurls')) {
    console.log(`[executeAction] Executing extractImageUrls #####`);

    // Wait a moment for images to load if we just navigated
    const lastAction = state?.history?.slice(-1)[0]?.action;
    if (lastAction && lastAction.includes('navigateTo')) {
      console.log(
        `[executeAction] Recent navigation detected, waiting 2 seconds for images to load #####`,
      );
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const urls = await tools.extractImageUrls();
    console.log(`[executeAction] extractImageUrls returned ${urls.length} URLs #####`);
    if (urls.length >= 3) {
      const result = `✅ SUCCESS: Found ${urls.length} image URLs. Preview: ${urls.slice(0, 3).join(', ')}`;
      console.log(`[executeAction] SUCCESS result: ${result} #####`);
      return result;
    }
    if (urls.length > 0) {
      const result = `Found ${urls.length} image URLs, but it's a small number. You may not be on a search results page. URLs: ${urls.join(', ')}`;
      console.log(`[executeAction] Partial result: ${result} #####`);
      return result;
    }
    const result = `Found 0 image URLs. Let me take a DOM snapshot to see what's on the page.`;
    console.log(`[executeAction] No URLs result: ${result} #####`);
    return result;
  }

  if (text.startsWith('getcurrenturl')) {
    console.log(`[executeAction] Executing getCurrentUrl #####`);
    return await tools.getCurrentUrl();
  }

  if (text.startsWith('clickelement')) {
    console.log(`[executeAction] Detected clickElement action #####`);
    const selectorMatch = cleanedPlan.match(/clickElement\s*\(\s*["']([^"']+)["']\s*\)/i);
    if (selectorMatch) {
      console.log(`[executeAction] Extracted selector: ${selectorMatch[1]} #####`);
      return tools.clickElement(selectorMatch[1]);
    }
    console.log(`[executeAction] Failed to parse selector from clickElement command #####`);
    throw new Error('Could not parse selector from clickElement command');
  }

  if (text.startsWith('typetext')) {
    console.log(`[executeAction] Detected typeText action #####`);
    const typeMatch = cleanedPlan.match(
      /typeText\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/i,
    );
    if (typeMatch) {
      console.log(
        `[executeAction] Extracted selector: ${typeMatch[1]}, text: ${typeMatch[2]} #####`,
      );
      return tools.typeText(typeMatch[1], typeMatch[2]);
    }
    console.log(`[executeAction] Failed to parse selector and text from typeText command #####`);
    throw new Error('Could not parse selector and text from typeText command');
  }

  // Fallback for unparsed or unknown actions
  if (text.startsWith('finish:')) {
    console.log(`[executeAction] Detected FINISH command, returning as-is #####`);
    return planText;
  }

  console.log(`[executeAction] Unknown or malformed action: ${cleanedPlan} #####`);
  throw new Error(`Unknown or malformed action: ${cleanedPlan}`);
}

/* ------------------------- Usage Examples ------------------------- */
// Optimized Universal Web Automation Examples:
//
// Example 1: Image search with auto-detection
// const result = await runAgentV2({
//   task: "Find 5 cute baby elephant images and give me their URLs",
//   maxSteps: 10,
//   devMode: true,
//   apiKey: "your-openai-key",
//   onEvent: console.log
// }, tools);
//
// Example 2: Reddit search
// const result = await runAgentV2({
//   task: "Search Reddit for posts about baby cats in r/cats subreddit",
//   startUrl: "https://reddit.com",
//   maxSteps: 12,
//   devMode: true,
//   apiKey: "your-openai-key"
// }, tools);
//
// Example 3: General web research
// const result = await runAgentV2({
//   task: "Find information about TypeScript best practices",
//   maxSteps: 10,
//   devMode: true,
//   apiKey: "your-openai-key"
// }, tools);
