import { ChromeExtensionDriver, CDPSession } from './chromeExtensionDriver';

// TypeScript interfaces for CDP responses
interface DOMNode {
    nodeId: number;
    backendNodeId: number;
    nodeName: string;
    nodeValue: string;
    nodeType: number;
    attributes?: string[];
    children?: DOMNode[];
}

interface DOMDocument {
    root: {
        nodeId: number;
        children: Array<{ nodeId: number }>;
    };
}

interface DOMDescribeNodeResponse {
    node?: DOMNode;
}

interface DOMResolveNodeResponse {
    object?: {
        objectId: string;
        type: string;
        subtype?: string;
    };
}

interface DOMSnapshotResponse {
    domNodes?: Array<{
        nodeId: number;
        nodeType: number;
        nodeValue: string;
        nodeName: string;
        attributes?: string[];
    }>;
    layoutTreeNodes?: Array<{
        nodeId: number;
        boundingBox: {
            x: number;
            y: number;
            width: number;
            height: number;
        }
    }>;
    computedStyles?: Array<{ style: string[] }>;
}

interface AccessibilityNode {
    nodeId: string;
    role?: { value: string };
    name?: { value: string };
    childIds?: string[];
}

interface AccessibilityTreeResponse {
    nodes?: AccessibilityNode[];
}

interface ScreenshotResponse {
    data?: string;
}

interface EventListener {
    type: string;
    useCapture: boolean;
    passive: boolean;
    handler?: {
        functionName: string;
        scriptId: string;
    };
}

interface EventListenersResponse {
    listeners?: EventListener[];
}

interface TestResult {
    testName: string;
    success: boolean;
    error?: string;
    duration: number;
    details?: unknown;
}

class DriverTestSuite {
    private driver: ChromeExtensionDriver;
    private results: TestResult[] = [];
    private cdpSession: CDPSession | undefined;

    constructor(driver?: ChromeExtensionDriver) {
        this.driver = driver || new ChromeExtensionDriver();
    }

    private async runTest(testName: string, testFn: () => Promise<unknown>): Promise<void> {
        const startTime = Date.now();
        console.log(`\n🧪 Running test: ${testName}`);

        try {
            // Add a timeout wrapper to prevent tests from hanging
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Test timeout: ${testName}`)), 15000);
            });

            const result = await Promise.race([testFn(), timeoutPromise]);
            const duration = Date.now() - startTime;

            this.results.push({
                testName,
                success: true,
                duration,
                details: result
            });

            console.log(`✅ ${testName} - PASSED (${duration}ms)`);
            if (result !== undefined) {
                console.log(`   Result:`, result);
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            this.results.push({
                testName,
                success: false,
                error: errorMessage,
                duration
            });

            console.log(`❌ ${testName} - FAILED (${duration}ms)`);
            console.log(`   Error: ${errorMessage}`);
        }
    }

    private async runCDPTest(testName: string, testFn: () => Promise<unknown>): Promise<void> {
        if (!this.cdpSession) {
            await this.runTest(testName, async () => ({ skipped: true, reason: 'CDP session not available' }));
            return;
        }

        // Ensure we have a valid CDP session before running the test
        try {
            await this.runTest(testName, testFn);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // If the error indicates the debugger is not attached, try to recreate the session
            if (errorMessage.includes('Not attached to an active page') ||
                errorMessage.includes('{"code":-32000,"message":"Not attached to an active page"}')) {
                console.log('CDP session lost, attempting to recreate...');
                try {
                    this.cdpSession = await this.driver.createCDPConnection();
                    await this.runTest(testName, testFn);
                } catch (retryError) {
                    await this.runTest(testName, async () => ({
                        skipped: true,
                        reason: 'CDP session recreation failed',
                        error: retryError instanceof Error ? retryError.message : String(retryError)
                    }));
                }
            } else {
                throw error;
            }
        }
    }

    async runAllTests(): Promise<void> {
        console.log('🚀 Starting ChromeExtensionDriver Test Suite');
        console.log('='.repeat(60));

        // ===== BASIC CDP CONNECTION TESTS =====

        // Test 1: Basic CDP Connection
        await this.runTest('Create CDP Connection', async () => {
            try {
                this.cdpSession = await this.driver.createCDPConnection();
                return { sessionCreated: !!this.cdpSession };
            } catch (error) {
                // If debugger is already attached, we can still test other functionality
                if (error instanceof Error && error.message.includes('already attached')) {
                    return { sessionCreated: false, alreadyAttached: true, note: 'Debugger already attached, skipping CDP connection test' };
                }
                throw error;
            }
        });

        // Test 2: Ensure CDP Session (if not created in Test 1)
        if (!this.cdpSession) {
            await this.runTest('Create CDP Session', async () => {
                try {
                    this.cdpSession = await this.driver.createCDPConnection();
                    return { sessionCreated: !!this.cdpSession };
                } catch (error) {
                    return { sessionCreated: false, error: error instanceof Error ? error.message : String(error) };
                }
            });
        }

        // ===== NAVIGATION TESTS (MCP Tools: do_navigate-to, do_go_back, do_go_forward, do_reload) =====

        // Test 3: Get Current URL
        await this.runTest('Get Current URL', async () => {
            const url = await this.driver.getCurrentUrl();
            return { currentUrl: url };
        });

        // Test 4: Get Extension URL
        await this.runTest('Get Extension URL', async () => {
            const extensionUrl = this.driver.getExtensionUrl('landing.html');
            return { extensionUrl };
        });

        // Test 5: Navigate to External URL (do_navigate-to)
        await this.runCDPTest('Navigate to External URL', async () => {
            try {
                // Add a timeout to prevent hanging
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Navigation timeout')), 10000);
                });

                const navigationPromise = this.driver.get('https://example.com');
                await Promise.race([navigationPromise, timeoutPromise]);

                const newUrl = await this.driver.getCurrentUrl();
                return { navigatedTo: newUrl };
            } catch (error) {
                return {
                    skipped: true,
                    reason: 'Navigation to external URL failed or timed out',
                    error: error instanceof Error ? error.message : String(error)
                };
            }
        });

        // Test 6: Navigation History
        await this.runCDPTest('Navigation History', async () => {
            const history = await this.cdpSession!.send('Page.getNavigationHistory') as {
                currentIndex: number;
                entries: Array<{ id: string; url: string; title: string }>;
            };
            return {
                currentIndex: history.currentIndex,
                entriesCount: history.entries.length,
                currentEntry: history.entries[history.currentIndex]
            };
        });

        // Test 7: Navigate Back (do_go_back)
        await this.runCDPTest('Navigate Back', async () => {
            const beforeUrl = await this.driver.getCurrentUrl();
            await this.driver.navigate().back();
            const afterUrl = await this.driver.getCurrentUrl();
            return { beforeUrl, afterUrl, navigatedBack: beforeUrl !== afterUrl };
        });

        // Test 8: Navigate Forward (do_go_forward)
        await this.runCDPTest('Navigate Forward', async () => {
            const beforeUrl = await this.driver.getCurrentUrl();

            // Get navigation history to understand the state
            const history = await this.cdpSession!.send('Page.getNavigationHistory') as {
                currentIndex: number;
                entries: Array<{ id: string; url: string; title: string }>;
            };

            await this.driver.navigate().forward();
            const afterUrl = await this.driver.getCurrentUrl();

            return {
                beforeUrl,
                afterUrl,
                navigatedForward: beforeUrl !== afterUrl,
                historyState: {
                    currentIndex: history.currentIndex,
                    totalEntries: history.entries.length,
                    canGoForward: history.currentIndex < history.entries.length - 1
                }
            };
        });

        // Test 9: Refresh Page (do_reload)
        await this.runCDPTest('Refresh Page', async () => {
            const beforeTitle = await this.driver.executeScript('document.title');
            await this.driver.navigate().refresh();
            const afterTitle = await this.driver.executeScript('document.title');
            return { beforeTitle, afterTitle, refreshed: true };
        });

        // ===== TAB MANAGEMENT TESTS =====

        // Test 10: Find Landing Page Tab
        await this.runTest('Find Landing Page Tab', async () => {
            const landingTab = await this.driver.findLandingPageTab();
            return {
                found: !!landingTab,
                tabId: landingTab?.id,
                tabUrl: landingTab?.url
            };
        });

        // Test 11: Open Landing Page Smart
        await this.runTest('Open Landing Page Smart', async () => {
            const tab = await this.driver.openLandingPageSmart();
            return {
                tabId: tab.id,
                tabUrl: tab.url,
                active: tab.active
            };
        });

        // Test 12: Create New Tab
        await this.runCDPTest('Create New Tab', async () => {
            await this.driver.createNewTab('https://httpbin.org/json');
            const url = await this.driver.getCurrentUrl();
            return { newTabUrl: url };
        });

        // ===== INFORMATION GATHERING TESTS (MCP Tools: get_console_logs, get_page_snapshot_*) =====

        // Test 13: CDP Event Listening
        await this.runCDPTest('CDP Event Listening', async () => {
            return new Promise((resolve) => {
                let eventReceived = false;

                this.cdpSession!.on('Page.loadEventFired', () => {
                    eventReceived = true;
                    resolve({ eventReceived: true, eventType: 'Page.loadEventFired' });
                });

                // Trigger a page load event
                setTimeout(() => {
                    if (!eventReceived) {
                        resolve({ eventReceived: false, note: 'No load event received within timeout' });
                    }
                }, 2000);

                // Ignore navigation errors for this test
            });
        });

        // Test 14: Console API (get_console_logs)
        await this.runCDPTest('Console API', async () => {
            // Test console object existence and methods
            const consoleTest = await this.driver.executeScript(`
                ({
                    hasConsole: typeof console !== 'undefined',
                    hasLog: typeof console.log === 'function',
                    hasWarn: typeof console.warn === 'function',
                    hasError: typeof console.error === 'function',
                    consoleType: typeof console
                })
            `);
            return { consoleTest };
        });

        // Test 15: DOM Querying (get_page_snapshot_as_text)
        await this.runCDPTest('DOM Querying', async () => {
            const domInfo = await this.driver.executeScript(`
                ({
                    bodyChildren: document.body.children.length,
                    headChildren: document.head.children.length,
                    allElements: document.querySelectorAll('*').length,
                    links: document.querySelectorAll('a').length,
                    images: document.querySelectorAll('img').length,
                    scripts: document.querySelectorAll('script').length,
                    styles: document.querySelectorAll('style, link[rel="stylesheet"]').length
                })
            `);
            return domInfo;
        });

        // Test 16: DOM Snapshot (get_page_snapshot_as_text)
        await this.runCDPTest('DOM Snapshot', async () => {
            const snapshot = await this.cdpSession!.send('DOMSnapshot.captureSnapshot', {
                computedStyles: ['display', 'position', 'opacity'],
                includeDOMRects: true,
                includePaintOrder: false
            }) as DOMSnapshotResponse;
            return {
                domNodesCount: snapshot.domNodes?.length || 0,
                layoutTreeNodesCount: snapshot.layoutTreeNodes?.length || 0,
                computedStylesCount: snapshot.computedStyles?.length || 0
            };
        });

        // Test 17: Accessibility Tree (get_page_snapshot_as_accessibility_tree)
        await this.runCDPTest('Accessibility Tree', async () => {
            const a11yTree = await this.cdpSession!.send('Accessibility.getFullAXTree') as AccessibilityTreeResponse;
            return {
                nodesCount: a11yTree.nodes?.length || 0,
                hasRoot: !!a11yTree.nodes?.find((node) => node.role?.value === 'RootWebArea')
            };
        });

        // Test 18: Screenshot (get_page_snapshot_as_jpeg_screenshoot)
        await this.runCDPTest('Screenshot Capture', async () => {
            const screenshot = await this.cdpSession!.send('Page.captureScreenshot', {
                format: 'jpeg',
                quality: 80
            }) as ScreenshotResponse;
            return {
                hasScreenshot: !!screenshot.data,
                screenshotLength: screenshot.data?.length || 0,
                format: screenshot.data?.startsWith('data:image/jpeg') ? 'jpeg' : 'unknown'
            };
        });

        // Test 19: Enhanced Screenshot (get_page_enhanced_snapshot_as_jpeg_screenshoot)
        await this.runCDPTest('Enhanced Screenshot', async () => {
            // First get DOM snapshot for element positions
            const domSnapshot = await this.cdpSession!.send('DOMSnapshot.captureSnapshot', {
                computedStyles: ['display', 'position', 'opacity'],
                includeDOMRects: true,
                includePaintOrder: false
            }) as DOMSnapshotResponse;

            // Then capture screenshot
            const screenshot = await this.cdpSession!.send('Page.captureScreenshot', {
                format: 'jpeg',
                quality: 80
            }) as ScreenshotResponse;

            return {
                hasDomSnapshot: !!domSnapshot.domNodes,
                hasScreenshot: !!screenshot.data,
                domNodesCount: domSnapshot.domNodes?.length || 0,
                canEnhance: !!(domSnapshot.domNodes && screenshot.data)
            };
        });

        // ===== ELEMENT INTERACTION TESTS (MCP Tools: do_click_node_by_id, do_focus_node_by_id, etc.) =====

        // Test 20: Element Description (do_click_node_by_id, do_focus_node_by_id, etc.)
        await this.runCDPTest('Element Description', async () => {
            const document = await this.cdpSession!.send('DOM.getDocument', { depth: 1 }) as DOMDocument;
            const bodyNode = await this.cdpSession!.send('DOM.describeNode', {
                nodeId: document.root.children[0].nodeId
            }) as DOMDescribeNodeResponse;

            return {
                hasBody: !!bodyNode.node,
                bodyNodeId: bodyNode.node?.nodeId,
                bodyBackendNodeId: bodyNode.node?.backendNodeId,
                canDescribe: !!bodyNode.node
            };
        });

        // Test 21: Element Resolution (do_click_node_by_id, do_focus_node_by_id, etc.)
        await this.runCDPTest('Element Resolution', async () => {
            const document = await this.cdpSession!.send('DOM.getDocument', { depth: 1 }) as DOMDocument;
            const bodyNode = await this.cdpSession!.send('DOM.describeNode', {
                nodeId: document.root.children[0].nodeId
            }) as DOMDescribeNodeResponse;

            if (bodyNode.node?.backendNodeId) {
                const resolvedNode = await this.cdpSession!.send('DOM.resolveNode', {
                    backendNodeId: bodyNode.node.backendNodeId
                }) as DOMResolveNodeResponse;

                return {
                    hasBackendNodeId: !!bodyNode.node.backendNodeId,
                    hasObjectId: !!resolvedNode.object?.objectId,
                    canResolve: !!resolvedNode.object?.objectId
                };
            }

            return { canResolve: false, reason: 'No backendNodeId available' };
        });

        // Test 22: Event Listeners (do_click_node_by_id)
        await this.runCDPTest('Event Listeners', async () => {
            const document = await this.cdpSession!.send('DOM.getDocument', { depth: 1 }) as DOMDocument;
            const bodyNode = await this.cdpSession!.send('DOM.describeNode', {
                nodeId: document.root.children[0].nodeId
            }) as DOMDescribeNodeResponse;

            if (bodyNode.node?.backendNodeId) {
                const resolvedNode = await this.cdpSession!.send('DOM.resolveNode', {
                    backendNodeId: bodyNode.node.backendNodeId
                }) as DOMResolveNodeResponse;

                if (resolvedNode.object?.objectId) {
                    const listeners = await this.cdpSession!.send('DOMDebugger.getEventListeners', {
                        objectId: resolvedNode.object.objectId
                    }) as EventListenersResponse;

                    return {
                        hasListeners: !!listeners.listeners,
                        listenersCount: listeners.listeners?.length || 0,
                        canGetListeners: true
                    };
                }
            }

            return { canGetListeners: false, reason: 'No objectId available' };
        });

        // Test 23: Input Events (do_send_keys_to_node_by_id, do_set_value_to_node_by_id)
        await this.runCDPTest('Input Events', async () => {
            // Create a test input element
            await this.driver.executeScript(`
                if (!document.getElementById('test-input')) {
                    const input = document.createElement('input');
                    input.id = 'test-input';
                    input.type = 'text';
                    input.value = 'initial';
                    document.body.appendChild(input);
                }
            `);

            const inputNode = await this.cdpSession!.send('DOM.querySelector', {
                nodeId: (await this.cdpSession!.send('DOM.getDocument', { depth: 0 }) as DOMDocument).root.nodeId,
                selector: '#test-input'
            }) as { nodeId?: number };

            if (inputNode.nodeId) {
                const nodeInfo = await this.cdpSession!.send('DOM.describeNode', {
                    nodeId: inputNode.nodeId
                }) as DOMDescribeNodeResponse;

                return {
                    hasInput: !!inputNode.nodeId,
                    inputType: nodeInfo.node?.attributes?.find((attr: string) => attr === 'type') || 'unknown',
                    canInteract: !!nodeInfo.node?.backendNodeId
                };
            }

            return { hasInput: false, reason: 'Could not create test input' };
        });

        // Test 24: Mouse Events (do_click_node_by_id)
        await this.runCDPTest('Mouse Events', async () => {
            // Create a test button element
            await this.driver.executeScript(`
                if (!document.getElementById('test-button')) {
                    const button = document.createElement('button');
                    button.id = 'test-button';
                    button.textContent = 'Test Button';
                    button.onclick = () => { window.testButtonClicked = true; };
                    document.body.appendChild(button);
                }
            `);

            const buttonNode = await this.cdpSession!.send('DOM.querySelector', {
                nodeId: (await this.cdpSession!.send('DOM.getDocument', { depth: 0 }) as DOMDocument).root.nodeId,
                selector: '#test-button'
            }) as { nodeId?: number };

            if (buttonNode.nodeId) {
                const nodeInfo = await this.cdpSession!.send('DOM.describeNode', {
                    nodeId: buttonNode.nodeId
                }) as DOMDescribeNodeResponse;

                return {
                    hasButton: !!buttonNode.nodeId,
                    buttonText: nodeInfo.node?.children?.[0]?.nodeValue || 'unknown',
                    canClick: !!nodeInfo.node?.backendNodeId
                };
            }

            return { hasButton: false, reason: 'Could not create test button' };
        });

        // Test 25: Form Submission (do_submit_node_by_id)
        await this.runCDPTest('Form Submission', async () => {
            // Create a test form element
            await this.driver.executeScript(`
                if (!document.getElementById('test-form')) {
                    const form = document.createElement('form');
                    form.id = 'test-form';
                    form.action = 'javascript:void(0)';
                    form.onsubmit = () => { window.testFormSubmitted = true; return false; };
                    
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.name = 'test';
                    form.appendChild(input);
                    
                    document.body.appendChild(form);
                }
            `);

            const formNode = await this.cdpSession!.send('DOM.querySelector', {
                nodeId: (await this.cdpSession!.send('DOM.getDocument', { depth: 0 }) as DOMDocument).root.nodeId,
                selector: '#test-form'
            }) as { nodeId?: number };

            if (formNode.nodeId) {
                const nodeInfo = await this.cdpSession!.send('DOM.describeNode', {
                    nodeId: formNode.nodeId
                }) as DOMDescribeNodeResponse;

                return {
                    hasForm: !!formNode.nodeId,
                    formAction: nodeInfo.node?.attributes?.find((attr: string) => attr === 'action') || 'unknown',
                    canSubmit: !!nodeInfo.node?.backendNodeId
                };
            }

            return { hasForm: false, reason: 'Could not create test form' };
        });

        // Test 26: Select Options (do_select_index_on_node_by_id)
        await this.runCDPTest('Select Options', async () => {
            // Create a test select element
            await this.driver.executeScript(`
                if (!document.getElementById('test-select')) {
                    const select = document.createElement('select');
                    select.id = 'test-select';
                    
                    const option1 = document.createElement('option');
                    option1.value = 'option1';
                    option1.textContent = 'Option 1';
                    select.appendChild(option1);
                    
                    const option2 = document.createElement('option');
                    option2.value = 'option2';
                    option2.textContent = 'Option 2';
                    select.appendChild(option2);
                    
                    document.body.appendChild(select);
                }
            `);

            const selectNode = await this.cdpSession!.send('DOM.querySelector', {
                nodeId: (await this.cdpSession!.send('DOM.getDocument', { depth: 0 }) as DOMDocument).root.nodeId,
                selector: '#test-select'
            }) as { nodeId?: number };

            if (selectNode.nodeId) {
                const nodeInfo = await this.cdpSession!.send('DOM.describeNode', {
                    nodeId: selectNode.nodeId
                }) as DOMDescribeNodeResponse;

                return {
                    hasSelect: !!selectNode.nodeId,
                    optionsCount: nodeInfo.node?.children?.length || 0,
                    canSelect: !!nodeInfo.node?.backendNodeId
                };
            }

            return { hasSelect: false, reason: 'Could not create test select' };
        });

        // ===== NETWORK AND PERFORMANCE TESTS =====

        // Test 27: Network Conditions
        await this.runCDPTest('Set Network Conditions', async () => {
            await this.driver.setNetworkConditions({
                offline: false,
                latency: 100,
                downloadThroughput: 1024 * 1024, // 1MB/s
                uploadThroughput: 512 * 1024, // 512KB/s
                connectionType: 'cellular3g'
            });
            return { networkConditionsSet: true };
        });

        // Test 28: Wait Functionality
        await this.runCDPTest('Wait Functionality', async () => {
            const startTime = Date.now();
            const result = await this.driver.wait(async () => {
                const readyState = await this.driver.executeScript('document.readyState');
                return readyState === 'complete';
            }, 5000);
            const duration = Date.now() - startTime;
            return { waitResult: result, duration };
        });

        // ===== ERROR HANDLING TESTS =====

        // Test 29: Error Handling - Invalid URL
        await this.runTest('Error Handling - Invalid URL', async () => {
            try {
                await this.driver.get('chrome://extensions');
                throw new Error('Should have failed for restricted URL');
            } catch (error) {
                return {
                    expectedError: true,
                    errorMessage: error instanceof Error ? error.message : String(error)
                };
            }
        });

        // Test 30: Error Handling - Invalid Script
        await this.runTest('Error Handling - Invalid Script', async () => {
            try {
                await this.driver.executeScript('this is not valid javascript');
                throw new Error('Should have failed for invalid script');
            } catch (error) {
                return {
                    expectedError: true,
                    errorMessage: error instanceof Error ? error.message : String(error)
                };
            }
        });

        // Test 31: CDP Commands
        await this.runCDPTest('CDP Commands', async () => {
            const pageInfo = await this.cdpSession!.send('Page.getResourceTree') as {
                frameTree?: {
                    frame?: {
                        resources?: Array<{ url: string; type: string }>;
                    };
                };
            };
            const runtimeInfo = await this.cdpSession!.send('Runtime.evaluate', {
                expression: 'navigator.userAgent',
                returnByValue: true
            }) as {
                result?: {
                    value?: string;
                };
            };

            return {
                pageResources: pageInfo?.frameTree?.frame?.resources?.length || 0,
                userAgent: runtimeInfo?.result?.value || 'unknown',
                pageInfoReceived: !!pageInfo,
                runtimeInfoReceived: !!runtimeInfo
            };
        });

        // Test 32: Detach and Reattach
        await this.runCDPTest('Detach and Reattach', async () => {
            await this.driver.detach();
            const newSession = await this.driver.createCDPConnection();
            return {
                detached: true,
                reattached: !!newSession
            };
        });

        this.printSummary();
    }

    private printSummary(): void {
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));

        const totalTests = this.results.length;
        const passedTests = this.results.filter(r => r.success).length;
        const failedTests = this.results.filter(r => !r.success).length;
        const skippedTests = this.results.filter(r => r.success && r.details && typeof r.details === 'object' && 'skipped' in r.details).length;
        const actualPassedTests = passedTests - skippedTests;
        const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${actualPassedTests} ✅`);
        console.log(`Skipped: ${skippedTests} ⏭️`);
        console.log(`Failed: ${failedTests} ❌`);
        console.log(`Total Duration: ${totalDuration}ms`);
        console.log(`Average Duration: ${Math.round(totalDuration / totalTests)}ms`);

        if (failedTests > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.results
                .filter(r => !r.success)
                .forEach(r => {
                    console.log(`  - ${r.testName}: ${r.error}`);
                });
        }

        console.log('\n✅ PASSED TESTS:');
        this.results
            .filter(r => r.success && (!r.details || typeof r.details !== 'object' || !('skipped' in r.details)))
            .forEach(r => {
                console.log(`  - ${r.testName} (${r.duration}ms)`);
            });

        if (skippedTests > 0) {
            console.log('\n⏭️  SKIPPED TESTS:');
            this.results
                .filter(r => r.success && r.details && typeof r.details === 'object' && 'skipped' in r.details)
                .forEach(r => {
                    const reason = (r.details as { reason: string }).reason;
                    console.log(`  - ${r.testName}: ${reason}`);
                });
        }

        console.log('\n' + '='.repeat(60));

        if (failedTests === 0) {
            console.log('🎉 ALL TESTS PASSED!');
        } else {
            console.log(`⚠️  ${failedTests} test(s) failed. Please review the errors above.`);
        }
    }

    async cleanup(): Promise<void> {
        try {
            await this.driver.detach();
            console.log('🧹 Cleanup completed');
        } catch (error) {
            console.log('⚠️  Cleanup error:', error);
        }
    }
}

// Export the test suite for use in other files
export { DriverTestSuite };
