import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ChromeExtensionDriver } from './chromeExtensionDriver';
import { CDP} from './CDP';
import { DomSnapshotTaker} from './DomSnapshotTaker';
import {DomInteractionsOperator} from './DomInteractionsOperator';
import {VisualSnapshotTaker} from './VisualSnapshotTaker';
import {A11yTreeSnapshotTaker} from './A11yTreeSnapshotTaker';

// Create a custom transport for Chrome extension environment
class ExtensionTransport {
    private messagePort?: chrome.runtime.Port;
    private server: McpServer;
    private retryCount = 0;
    private maxRetries = 3;

    constructor(server: McpServer) {
        this.server = server;
    }

    async connect() {

        // Listen for messages from the extension
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

            if (message.type === 'MCP_REQUEST') {
                this.handleMcpRequest(message.data)
                    .then(response => {
                        sendResponse(response);
                    })
                    .catch(error => {
                        console.error('MCP request handling failed:', error);
                        sendResponse({
                            success: false,
                            error: error.message,
                            details: 'Request processing failed',
                        });
                    });
                return true; // Keep message channel open for async response
            }

            return false; // Don't handle other message types
        });

        console.log('🚀 Enhanced MCP Server ready in Chrome extension');
    }

    private async handleMcpRequest(request: Record<string, unknown>) {

        try {
            // Enhanced request validation
            if (!request || typeof request !== 'object') {
                throw new Error('Invalid request format: expected object');
            }

            // Log request for debugging
            console.log('📨 Handling MCP request:', request);

            // Handle MCP requests here with retry logic
            let lastError: Error | null = null;
            for (let attempt = 0; attempt <= this.maxRetries; attempt++) {

                try {
                    const result = await this.processRequest(request);
                    console.log('✅ MCP request processed successfully');
                    return { success: true, data: result };
                } catch (error) {
                    lastError = error as Error;
                    console.warn(`#####3 [ExtensionTransport.handleMcpRequest] Attempt ${attempt + 1} failed:`, error);
                    console.warn(`⚠️ MCP request attempt ${attempt + 1} failed:`, error);

                    if (attempt < this.maxRetries) {
                        // Wait before retry
                        const waitTime = 1000 * (attempt + 1);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }
            }

            throw lastError || new Error('All retry attempts failed');
        } catch (error) {
            console.error('❌ MCP request handling failed:', error);
            return {
                success: false,
                error: (error as Error).message,
                stack: (error as Error).stack,
            };
        }
    }

    private async processRequest(request: Record<string, unknown>): Promise<unknown> {

        // Implement the actual MCP protocol handling here
        // This is where you'd route to different tools based on request.method

        // For now, return a success response
        return { processed: true, request };
    }
}

// Initialize the MCP server for Chrome extension
export function initializeMcpServer(driver: ChromeExtensionDriver) {
    const server = new McpServer({
        name: 'Browser CDP',
        version: '1.0.0',
        capabilities: {
            resources: {},
            tools: {},
        },
    });

    // Initialize CDP and related services
    const cdp = new CDP(driver);
    const domInteractionsOperator = new DomInteractionsOperator(
        driver,
        cdp.dom,
        cdp.runtime,
        cdp.input,
    );
    const domSnapshotTaker = new DomSnapshotTaker(domInteractionsOperator, cdp.domSnapshot);
    const visualSnapshotTaker = new VisualSnapshotTaker(
        cdp.page,
        cdp.dom,
        cdp.domDebugger,
        domInteractionsOperator,
    );
    const a11yTreeSnapshotTaker = new A11yTreeSnapshotTaker(cdp.accessibility, cdp.dom, cdp.css);

    // Initialize CDP
    cdp.init().catch(error => {
        console.error('Failed to initialize CDP:', error);
    });

    // Type definitions
    const backedNodeIdType = z.number().describe('The node id.');
    const nodeDescription = z
        .string()
        .min(10)
        .max(300)
        .describe(
            'Describe the element in human terms, so that a human would be able from this description to find the element in the page, without knowing the id.',
        );

    // Navigation tools
    server.tool(
        'do_navigate-to',
        'Navigate to a page',
        {
            url: z.string().describe('The URL to navigate to.'),
        },
        async ({ url }) => {
            try {
                await driver.get(url);
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'ok',
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Navigation failed: ${(error as Error).message}`,
                        },
                    ],
                };
            }
        },
    );

    server.tool('get_current_page_url', 'Get the URL of the current page', {}, async () => {
        try {
            const url = await driver.getCurrentUrl();
            return {
                content: [
                    {
                        type: 'text',
                        text: url,
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to get URL: ${(error as Error).message}`,
                    },
                ],
            };
        }
    });

    server.tool('do_go_back', 'Goes one step backward in the browser history', {}, async () => {
        try {
            await driver.navigate().back();
            return {
                content: [
                    {
                        type: 'text',
                        text: 'ok',
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to go back: ${(error as Error).message}`,
                    },
                ],
            };
        }
    });

    server.tool('do_go_forward', 'Goes one step forward in the browser history', {}, async () => {
        try {
            await driver.navigate().forward();
            return {
                content: [
                    {
                        type: 'text',
                        text: 'ok',
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to go forward: ${(error as Error).message}`,
                    },
                ],
            };
        }
    });

    server.tool('do_reload', 'Refreshes the current page', {}, async () => {
        try {
            await driver.navigate().refresh();
            return {
                content: [
                    {
                        type: 'text',
                        text: 'ok',
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to reload: ${(error as Error).message}`,
                    },
                ],
            };
        }
    });

    // Console tools
    server.tool('get_console_logs', 'Get the console logs as JSON and clear console.', {}, () => {
        try {
            const logs = cdp.console.getMessages();
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(logs),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Failed to get console logs: ${(error as Error).message}`,
                    },
                ],
            };
        }
    });

    // Snapshot tools
    server.tool(
        'get_page_snapshot_as_accessibility_tree',
        'Get a snapshot of the page as an accessibility tree. This is a clear, compact and a higher level representation',
        {},
        async () => {
            try {
                const toReturn: string = await a11yTreeSnapshotTaker.takeSnapshot();
                return {
                    content: [
                        {
                            type: 'text',
                            text: toReturn,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get accessibility tree: ${(error as Error).message}`,
                        },
                    ],
                };
            }
        },
    );

    server.tool(
        'get_page_snapshot_as_text',
        'Get a snapshot of the page as text extracted from HTML DOM tree. The links and clickable elements are preceded by the ID (backedNodeId) around square brackets (for e.g. [2]link).',
        {},
        async () => {
            try {
                const toReturn = await domSnapshotTaker.takeSnapshot();
                return {
                    content: [
                        {
                            type: 'text',
                            text: toReturn,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get DOM snapshot: ${(error as Error).message}`,
                        },
                    ],
                };
            }
        },
    );

    server.tool(
        'get_page_snapshot_as_jpeg_screenshoot',
        'Get a JPEG screenshots of the page.',
        {},
        async () => {
            try {
                const screenshot = await cdp.page.captureScreenshot();
                return {
                    content: [
                        {
                            type: 'image',
                            mimeType: 'image/jpeg',
                            data: screenshot,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to capture screenshot: ${(error as Error).message}`,
                        },
                    ],
                };
            }
        },
    );

    server.tool(
        'get_page_enhanced_snapshot_as_jpeg_screenshoot',
        'Get a JPEG screenshots of the page enriched with green boxes for interactible elements, each box in the top middle part has the backedNodeId.',
        {},
        async () => {
            try {
                const imageBase64: string = await cdp.page.captureScreenshot();
                const domSnapshot = await cdp.domSnapshot.getSnapshot(
                    ['display', 'position', 'opacity'],
                    true,
                );
                const enhancedImage = await visualSnapshotTaker.drawRects(imageBase64, domSnapshot);
                return {
                    content: [
                        {
                            type: 'image',
                            mimeType: 'image/jpeg',
                            data: enhancedImage,
                        },
                    ],
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to get enhanced screenshot: ${(error as Error).message}`,
                        },
                    ],
                };
            }
        },
    );

    // Interaction tools
    server.tool(
        'do_click_node_by_id',
        'Click a node by backendNodeId',
        {
            backendNodeId: backedNodeIdType,
            nodeDescription: nodeDescription,
        },
        async ({ backendNodeId }) => {
            try {
                const pNodeResolved = await cdp.dom.resolveNode(undefined, backendNodeId);
                if (pNodeResolved.objectId) {
                    const listeners = await cdp.domDebugger.getEventListeners(pNodeResolved.objectId);
                    const node = await cdp.dom.describeNode(undefined, backendNodeId);
                    const nativeInteractions = domInteractionsOperator.getNativeInteractions(node);
                    if (listeners.length === 0 && !nativeInteractions) {
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: 'The element with backendNodeId ' + backendNodeId + ' is not clickable.',
                                },
                            ],
                        };
                    }
                }

                await domInteractionsOperator.doClick(backendNodeId);

                // Wait for page to be ready (simplified version for extension)
                await new Promise(resolve => setTimeout(resolve, 1000));

                return {
                    content: [{ type: 'text', text: 'ok' }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Click failed: ${(error as Error).message}` }],
                };
            }
        },
    );

    server.tool(
        'do_focus_node_by_id',
        'Focus a node by backendNodeId',
        {
            backendNodeId: backedNodeIdType,
            nodeDescription: nodeDescription,
        },
        async ({ backendNodeId }) => {
            try {
                await domInteractionsOperator.doFocus(backendNodeId);
                return {
                    content: [{ type: 'text', text: 'ok' }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Focus failed: ${(error as Error).message}` }],
                };
            }
        },
    );

    server.tool(
        'do_send_keys_to_node_by_id',
        'Send keys/text to a node by backendNodeId',
        {
            keysToSend: z.string().describe('The keys to send.'),
            backendNodeId: backedNodeIdType,
            nodeDescription: nodeDescription,
        },
        async ({ backendNodeId, keysToSend }) => {
            try {
                await domInteractionsOperator.doSendKey(backendNodeId, keysToSend);
                return {
                    content: [{ type: 'text', text: 'ok' }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Send keys failed: ${(error as Error).message}` }],
                };
            }
        },
    );

    server.tool(
        'do_set_value_to_node_by_id',
        'Set value to a node (input/select/textarea) by backendNodeId',
        {
            value: z.string().describe('The value to set.'),
            backendNodeId: backedNodeIdType,
            nodeDescription: nodeDescription,
        },
        async ({ backendNodeId, value }) => {
            try {
                await domInteractionsOperator.doSetValue(backendNodeId, value);
                return {
                    content: [{ type: 'text', text: 'ok' }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Set value failed: ${(error as Error).message}` }],
                };
            }
        },
    );

    server.tool(
        'do_submit_node_by_id',
        'Submit a form/search node by backendNodeId',
        {
            backendNodeId: backedNodeIdType,
            nodeDescription: nodeDescription,
        },
        async ({ backendNodeId }) => {
            try {
                await domInteractionsOperator.doSubmit(backendNodeId);
                return {
                    content: [{ type: 'text', text: 'ok' }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Submit failed: ${(error as Error).message}` }],
                };
            }
        },
    );

    server.tool(
        'do_select_index_on_node_by_id',
        'Select option on select node by backendNodeId',
        {
            value: z.string().describe('The value to set.'),
            backendNodeId: backedNodeIdType,
            nodeDescription: nodeDescription,
        },
        async ({ backendNodeId, value }) => {
            try {
                await domInteractionsOperator.doSelectOptionValue(backendNodeId, value);
                return {
                    content: [{ type: 'text', text: 'ok' }],
                };
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Select option failed: ${(error as Error).message}` }],
                };
            }
        },
    );

    // Extension-specific tools
    server.tool(
        'create_new_tab',
        'Create a new tab with an optional URL',
        { url: z.string().optional().describe('The URL to open in the new tab (defaults to Google)') },
        async ({ url }) => {
            try {
                await driver.createNewTab(url);
                return {
                    content: [{ type: 'text', text: 'New tab created successfully' }],
                };
            } catch (error) {
                return {
                    content: [
                        { type: 'text', text: `Failed to create new tab: ${(error as Error).message}` },
                    ],
                };
            }
        },
    );

    server.tool(
        'open_landing_page',
        "Open the extension's landing page in a smart way - searches for existing landing page tabs first",
        {},
        async () => {
            try {
                const tab = await driver.openLandingPageSmart();
                const action =
                    tab.url === chrome.runtime.getURL('landing.html') ? 'activated existing' : 'created new';
                return {
                    content: [{ type: 'text', text: `Landing page ${action} at: ${tab.url}` }],
                };
            } catch (error) {
                return {
                    content: [
                        { type: 'text', text: `Failed to open landing page: ${(error as Error).message}` },
                    ],
                };
            }
        },
    );

    const transport = new ExtensionTransport(server);
    transport.connect();

    return server;
}
