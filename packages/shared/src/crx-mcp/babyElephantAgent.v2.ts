// babyElephantAgent.v2.ts
// Optimized Agent: single LLM call per loop, consolidated heuristics, cleaner structure.
// Simplified version that integrates with existing CRXMCPService infrastructure

import { ChatOpenAI } from '@langchain/openai';
import { BabyAnimalPlanner, type SearchPlan } from './babyElephantAgenticRouting';

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
  extractImageUrls: () => Promise<string>;
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
  searchPlan?: SearchPlan; // Store the intelligent routing plan
}

/* ------------------------- URL Helpers ------------------------- */
async function isRelevantResultsPage(
  currentUrl: string,
  task: string,
  llm: ChatOpenAI,
): Promise<boolean> {
  const urlAnalysisPrompt = `
You are analyzing whether a URL represents a results page that would be relevant for completing a given task.

**Task:** ${task}
**Current URL:** ${currentUrl}

IMPORTANT: Determine if this URL shows results that match the content type needed for the task:

For IMAGE/PICTURE tasks:
- "true" ONLY if URL contains image-specific parameters like "images", "imgs", "tbm=isch", "iax=images"
- "false" for general web search results (even if on same domain)

For WEB/TEXT tasks:
- "true" for general search results pages
- "false" for specialized pages (images, videos, news) unless they match the task

Examples:
- Task: "find cute kitten pictures" + URL: "duckduckgo.com/?q=kittens&ia=web" → "false" (web results, need images)
- Task: "find cute kitten pictures" + URL: "duckduckgo.com/?q=kittens&iax=images&ia=images" → "true" (image results)
- Task: "search for news" + URL: "google.com/search?q=news&tbm=nws" → "true" (news results)

Respond with only "true" or "false".`;

  try {
    const response = await llm.invoke(urlAnalysisPrompt);
    const result = (response.content as string).toLowerCase().trim();
    return result === 'true';
  } catch (error) {
    console.log(`[isRelevantResultsPage] LLM error, falling back to false: ${error} #####`);
    return false;
  }
}

/* ------------------------- Search Term Extraction ------------------------- */
async function extractSearchTermFromTask(task: string, llm: ChatOpenAI): Promise<string> {
  const extractionPrompt = `
You are analyzing a user's task to extract the most relevant search term(s) for web search.

**Task:** ${task}

Extract the key search term or phrase that would be most effective for finding relevant content. Consider:
- What is the main subject/topic the user wants to find?
- What specific keywords would yield the best search results?
- Remove unnecessary words like "find", "search for", "get", "show me"

Examples:
- "Find cute baby elephant pictures" → "cute baby elephant"
- "Search for TypeScript tutorials" → "TypeScript tutorials"  
- "Get news about climate change" → "climate change news"
- "Show me reviews of iPhone 15" → "iPhone 15 reviews"

Respond with ONLY the search term/phrase, no quotes or extra text.`;

  try {
    const response = await llm.invoke(extractionPrompt);
    const searchTerm = (response.content as string).trim();
    console.log(`[extractSearchTermFromTask] LLM extracted: "${searchTerm}" from: "${task}" #####`);
    return searchTerm;
  } catch (error) {
    console.log(`[extractSearchTermFromTask] LLM error, using fallback: ${error} #####`);
    // Simple fallback: remove common action words
    const fallback =
      task
        .replace(/^(find|search for|get|show me|looking for)\s*/i, '')
        .replace(/\s+(pictures|images|photos|videos|news|articles)$/i, '')
        .trim() || 'search query';
    console.log(`[extractSearchTermFromTask] Fallback result: "${fallback}" #####`);
    return fallback;
  }
}

/* ------------------------- LLM-Driven Search URL Generation ------------------------- */
async function generateSearchUrl(
  searchTerm: string,
  task: string,
  llm: ChatOpenAI,
): Promise<string> {
  const searchUrlPrompt = `
You are determining the best search engine and URL format for a given task and search term.

**Task:** ${task}
**Search Term:** ${searchTerm}

Based on the task type, choose the most appropriate search engine and generate the complete search URL. Consider:
- For images: Google Images, DuckDuckGo Images, Bing Images
- For news: Google News, DuckDuckGo News
- For videos: YouTube, Google Videos
- For shopping: Google Shopping, Amazon, eBay
- For academic: Google Scholar, PubMed
- For general web: Google, DuckDuckGo, Bing

Respond with ONLY the complete URL, no quotes or extra text.

Examples:
- Images on DuckDuckGo: https://duckduckgo.com/?q=cute+baby+elephant&iax=images&ia=images
- Images on Google: https://images.google.com/search?q=cute+baby+elephant&tbm=isch
- News on Google: https://news.google.com/search?q=climate+change
- Videos on YouTube: https://www.youtube.com/results?search_query=typescript+tutorial
- Shopping on Google: https://www.google.com/search?q=iphone+15&tbm=shop`;

  try {
    const response = await llm.invoke(searchUrlPrompt);
    const searchUrl = (response.content as string).trim();
    console.log(`[generateSearchUrl] LLM generated URL: "${searchUrl}" for task: "${task}" #####`);
    return searchUrl;
  } catch (error) {
    console.log(`[generateSearchUrl] LLM error, falling back to DuckDuckGo: ${error} #####`);
    // Intelligent fallback based on task analysis
    const taskLower = task.toLowerCase();
    const encodedTerm = encodeURIComponent(searchTerm).replace(/%20/g, '+');

    if (
      taskLower.includes('image') ||
      taskLower.includes('picture') ||
      taskLower.includes('photo')
    ) {
      return `https://duckduckgo.com/?q=${encodedTerm}&iax=images&ia=images`;
    } else if (taskLower.includes('news') || taskLower.includes('article')) {
      return `https://duckduckgo.com/?q=${encodedTerm}&iar=news&ia=news`;
    } else if (taskLower.includes('video') || taskLower.includes('watch')) {
      return `https://www.youtube.com/results?search_query=${encodedTerm}`;
    } else if (
      taskLower.includes('shop') ||
      taskLower.includes('buy') ||
      taskLower.includes('price')
    ) {
      return `https://www.google.com/search?q=${encodedTerm}&tbm=shop`;
    } else {
      // General web search fallback
      return `https://duckduckgo.com/?q=${encodedTerm}`;
    }
  }
}

/* ------------------------- System Prompts ------------------------- */
const SYSTEM_PROMPT = `You are babyElephant agent v2, a universal web automation assistant with intelligent animal search capabilities.

Your goal is to complete the user's task by navigating and interacting with websites.

**Enhanced Intelligence:**
- You have pre-analyzed the task to understand animals mentioned (e.g., "kittens" → canonical "cat")
- You know the appropriate baby animal names (cat → kitten, goat → kid, chicken → chick)
- You have intelligently selected the best search engine and constructed the optimal search URL
- Your search queries use the baby animal names (e.g., search for "kittens" even if user said "cats")

**Core Principles:**
1. **OBSERVE**: Use takeDomSnapshot() to understand the page structure
2. **PLAN**: Based on your observation and the task, choose the single best tool to use next
3. **ACT**: Execute the chosen tool
4. **ADAPT**: If a tool fails or doesn't bring you closer to the goal, analyze the result and try a different approach

**Workflow for Animal Image Searches:**
1. If not already there, navigate to the pre-planned intelligent search URL
2. Use takeDomSnapshot() to find the search input's backend node ID
3. Use typeIntoNodeById(id, "intelligent query") - the query is automatically optimized for baby animals
4. Use clickNodeById(id) to click the search button or press enter
5. **CRITICAL**: If on web search results (URL contains "&ia=web" or similar), find and click the "Images" tab/filter
6. **ONLY THEN**, use extractImageUrls() to get the results

**IMAGES TAB DETECTION:**
- Look for buttons/links with text: "Images", "imgs", "Pictures", "Photos"
- Common selectors: elements with "images" in the text, id, or class
- Navigation tabs are usually near the top of search results
- Click ANY element that will switch from web search to image search

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

  // Initialize the intelligent routing planner
  const animalPlanner = new BabyAnimalPlanner(llm);

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

  // ** PHASE 1: Intelligent Task Analysis and Planning **
  addEvent(
    'plan',
    'Analyzing task for animal detection, juvenile names, and search engine routing...',
  );
  try {
    const searchPlan = await animalPlanner.plan(io.task);
    state.searchPlan = searchPlan;

    addEvent('plan', `🧠 Animal Analysis Complete:`, {
      canonical: searchPlan.animal.canonical,
      juvenile: searchPlan.juvenile.juvenile,
      query: searchPlan.query,
      engine: searchPlan.engine.engine,
      confidence: searchPlan.animal.confidence,
    });

    console.log('🧠 Search Plan Generated:', {
      animal: `${searchPlan.animal.canonical} -> ${searchPlan.juvenile.juvenile}/${searchPlan.juvenile.plural}`,
      engine: searchPlan.engine.engine,
      query: searchPlan.query,
      url: searchPlan.url,
      reasoning: {
        animal: searchPlan.animal.reason,
        juvenile: searchPlan.juvenile.reason,
        engine: searchPlan.engine.reason,
      },
    });
  } catch (error) {
    addEvent('plan', `Warning: Task analysis failed, proceeding with default approach: ${error}`);
  }

  // Initial setup
  if (io.startUrl) {
    addEvent('act', `Navigating to start URL: ${io.startUrl}`);
    const navResult = await tools.navigateTo(io.startUrl);
    state.history.push({ action: `navigateTo("${io.startUrl}")`, result: navResult });
  } else if (state.searchPlan?.url) {
    // Use the intelligently generated search URL if no start URL provided
    addEvent('act', `Navigating to intelligent search URL: ${state.searchPlan.url}`);
    const navResult = await tools.navigateTo(state.searchPlan.url);
    state.history.push({ action: `navigateTo("${state.searchPlan.url}")`, result: navResult });
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

  // ** LLM-Driven Results Page Detection **
  console.log(`[getNextAction] Checking if URL is relevant results page: ${currentUrl} #####`);
  const isResultsPage = await isRelevantResultsPage(currentUrl, state.task, llm);
  console.log(`[getNextAction] LLM determined isRelevantResultsPage: ${isResultsPage} #####`);

  // ** Special Case: Detect if we're on web search but need images **
  const needsImagesTab =
    currentUrl &&
    (currentUrl.includes('ia=web') || currentUrl.includes('tbm=')) &&
    state.task.toLowerCase().includes('image');

  if (needsImagesTab) {
    console.log(
      `[getNextAction] On web search page but task needs images, looking for Images tab #####`,
    );

    // Check if we have a recent DOM snapshot to analyze
    const lastDomSnapshot = state.history
      .slice()
      .reverse()
      .find(h => h.action.includes('takeDomSnapshot'))?.result;

    if (lastDomSnapshot && lastDomSnapshot.length > 1000) {
      console.log(`[getNextAction] Using DOM snapshot to find Images tab #####`);
      const clickImagesPrompt = `
You are on a web search results page but need to switch to IMAGE search for the task.

**Current Task:** ${state.task}
**Current URL:** ${currentUrl}

**DOM Snapshot:**
${lastDomSnapshot}

**CRITICAL MISSION:** Find and click the "Images" tab/button to switch from web search to image search.

Look for elements containing:
- Text: "Images", "imgs", "Pictures", "Photos"  
- Navigation tabs or filter buttons
- Links that switch search types

Find the ACTUAL backend node ID from the DOM snapshot and respond with ONLY that command.
Example format: \`clickNodeById(8765)\` where 8765 is the real ID you found.

If you cannot find an Images tab, respond with: \`navigateTo("${currentUrl.replace(/[?&]ia=web/, '').replace(/[?&]tbm=[^&]*/, '')}${currentUrl.includes('?') ? '&' : '?'}iax=images&ia=images")\``;

      const response = await llm.invoke(clickImagesPrompt);
      const action = response.content as string;
      console.log(`[getNextAction] LLM suggested Images tab action: ${action} #####`);
      return action;
    } else {
      console.log(`[getNextAction] No DOM snapshot available, taking one to find Images tab #####`);
      return 'takeDomSnapshot()';
    }
  }

  if (isResultsPage) {
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

    console.log(
      `[getNextAction] Relevant results page detected, returning extractImageUrls() #####`,
    );
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
          `[getNextAction] Multiple failed Images tab clicks detected, using intelligent navigation #####`,
        );

        // Use the intelligent search plan if available
        if (state.searchPlan?.url) {
          console.log(
            `[getNextAction] Using pre-planned intelligent search URL: ${state.searchPlan.url} #####`,
          );
          return `navigateTo("${state.searchPlan.url}")`;
        } else {
          // Fallback to legacy LLM-driven search
          const searchTerm = await extractSearchTermFromTask(state.task, llm);
          console.log(
            `[getNextAction] No search plan available, using extracted term: "${searchTerm}" #####`,
          );
          const searchUrl = await generateSearchUrl(searchTerm, state.task, llm);
          return `navigateTo("${searchUrl}")`;
        }
      }

      console.log(
        `[getNextAction] Found DOM snapshot (${lastDomSnapshot.length} chars), sending targeted prompt to LLM #####`,
      );
      const clickImagesPrompt = `
You are a web automation agent helping with image search. You performed a search but need to switch to the IMAGES tab/filter.

**CRITICAL:** Your task requires finding images, but you may be on a web search results page instead of images results.

**Current Task:** ${state.task}
**Current URL:** ${currentUrl}

**DOM Snapshot:**
${lastDomSnapshot}

**PRIORITY ACTIONS:**
1. **FIRST**: Look for an "Images" tab, button, or link in the navigation area (usually near the top)
2. **IDENTIFY**: Find elements with text like "Images", "imgs", or image-related filters 
3. **CLICK**: Use clickNodeById() to click the Images tab/filter

**Common DOM patterns to look for:**
- Buttons/links with "Images" text
- Navigation tabs with data attributes
- Filter buttons for switching search types
- Elements with aria-label containing "images"

**Your response must be ONLY a single command:**
- \`clickNodeById(123)\` to click the Images tab/filter
- \`takeDomSnapshot()\` if you need to analyze the page structure again
- \`extractImageUrls()\` ONLY if you're already on an images results page

**IMPORTANT:** Look carefully for ANY element that can switch you from web search to image search. Do not extract images until you're on the actual images results page.

Response:`;
      const response = await llm.invoke(clickImagesPrompt);
      const action = response.content as string;
      console.log(`[getNextAction] LLM returned contextual action: ${action} #####`);
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
      `[getNextAction] Snapshot loop detected, using intelligent search plan if available #####`,
    );

    // Use the intelligent search plan if available
    if (state.searchPlan?.url) {
      console.log(
        `[getNextAction] Using pre-planned intelligent search URL: ${state.searchPlan.url} #####`,
      );
      return `navigateTo("${state.searchPlan.url}")`;
    } else {
      // Fallback to legacy LLM-driven search
      const searchTerm = await extractSearchTermFromTask(state.task, llm);
      console.log(
        `[getNextAction] No search plan available, using extracted term: "${searchTerm}" #####`,
      );
      const searchUrl = await generateSearchUrl(searchTerm, state.task, llm);
      return `navigateTo("${searchUrl}")`;
    }
  }

  // Detect if we're repeating navigation to the same URL (page reload loop)
  const recentNavigations = state.history.slice(-3).filter(h => h.action.includes('navigateTo'));
  if (recentNavigations.length >= 2) {
    console.log(`[getNextAction] Detected repeated navigation loop, forcing DOM analysis #####`);
    return 'takeDomSnapshot()';
  }

  // Detect click loops - if we're clicking the same element repeatedly
  const recentClicks = state.history.slice(-5).filter(h => h.action.includes('clickNodeById'));
  if (recentClicks.length >= 3) {
    const lastClickId =
      recentClicks[recentClicks.length - 1].action.match(/clickNodeById\((\d+)\)/)?.[1];
    const sameClickCount = recentClicks.filter(h =>
      h.action.includes(`clickNodeById(${lastClickId})`),
    ).length;

    if (sameClickCount >= 3) {
      console.log(
        `[getNextAction] Detected click loop on element ${lastClickId}, trying direct image search navigation #####`,
      );
      const searchTerm = state.searchPlan?.query || 'images';
      return `navigateTo("https://duckduckgo.com/?q=${encodeURIComponent(searchTerm)}&iax=images&ia=images")`;
    }
  }

  // Detect if we're repeating the same type->click->snapshot cycle WITHOUT progress
  const recentCycles = state.history.slice(-6);
  const hasTypeClickPattern =
    recentCycles.some(h => h.action.includes('typeIntoNodeById')) &&
    recentCycles.some(h => h.action.includes('clickNodeById'));

  // Only use intelligent navigation if we haven't made progress AND aren't on a search results page
  const isOnSearchResultsPage =
    currentUrl &&
    (currentUrl.includes('q=') || currentUrl.includes('search') || currentUrl.includes('query'));

  if (hasTypeClickPattern && state.history.length > 8 && !isOnSearchResultsPage) {
    console.log(
      `[getNextAction] Detected repeated type-click cycles, using intelligent navigation #####`,
    );

    // Use the intelligent search plan if available
    if (state.searchPlan?.url) {
      console.log(
        `[getNextAction] Using pre-planned intelligent search URL: ${state.searchPlan.url} #####`,
      );
      return `navigateTo("${state.searchPlan.url}")`;
    } else {
      // Fallback to legacy LLM-driven search
      const searchTerm = await extractSearchTermFromTask(state.task, llm);
      console.log(
        `[getNextAction] No search plan available, using extracted term: "${searchTerm}" #####`,
      );
      const searchUrl = await generateSearchUrl(searchTerm, state.task, llm);
      return `navigateTo("${searchUrl}")`;
    }
  }

  // ** General LLM Planning (if no specific heuristic applies) **
  console.log(
    `[getNextAction] Using general LLM planning, historyLength: ${state.history.length} #####`,
  );
  const historyText = state.history
    .slice(-5) // Use last 5 interactions
    .map(item => `Action: ${item.action}\nResult: ${item.result}`)
    .join('\n\n');

  // Include search plan context if available
  const searchPlanContext = state.searchPlan
    ? `
**Intelligent Search Plan Available:**
- Animal: ${state.searchPlan.animal.canonical} → ${state.searchPlan.juvenile.juvenile}/${state.searchPlan.juvenile.plural}
- Search Engine: ${state.searchPlan.engine.engine}
- Optimized Query: "${state.searchPlan.query}"
- Target URL: ${state.searchPlan.url}
- Reasoning: ${state.searchPlan.animal.reason}
`
    : '';

  const planPrompt = `
${SYSTEM_PROMPT}

**Task**: ${state.task}
**Current URL**: ${currentUrl || 'Unknown'}
${searchPlanContext}
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
    const idMatch = cleanedPlan.match(/clickNodeById\s*\(\s*["']?(\d+)["']?\s*\)/i);
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
      /typeIntoNodeById\s*\(\s*["']?(\d+)["']?\s*,\s*["']([^"']+)["']\s*\)/i,
    );
    if (typeMatch) {
      console.log(
        `[executeAction] Extracted node ID: ${typeMatch[1]}, text: ${typeMatch[2]} #####`,
      );

      // Use intelligent query if available and text looks like a generic search
      let textToType = typeMatch[2];
      if (
        state?.searchPlan?.query &&
        (textToType.toLowerCase().includes('search') ||
          textToType.toLowerCase().includes('query') ||
          textToType === 'baby elephant' ||
          textToType === 'cute baby elephant')
      ) {
        console.log(
          `[executeAction] Using intelligent query: "${state.searchPlan.query}" instead of: "${textToType}" #####`,
        );
        textToType = state.searchPlan.query;
      }

      return tools.typeIntoNodeById(parseInt(typeMatch[1]), textToType);
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

    const result = await tools.extractImageUrls();
    console.log(`[executeAction] extractImageUrls returned: ${result} #####`);
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
