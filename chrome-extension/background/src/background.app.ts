import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { getSingletonServiceDescriptors } from 'vs/platform/instantiation/common/extensions';
import { IMathService, MathService } from '@src/services/math.service';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { getDocumentId, getInformation, getWindowId, sendErrorResponse } from '@src/utils/utils';
import {
  DocumentMessage,
  DocumentResponse,
  CRX_MCP_OVER_CDP_SIDE_PANEL_DISCONNECT,
  CRX_MCP_OVER_CDP_SIDE_PANEL_HELLO,
  CRX_MCP_OVER_CDP_SIDE_PANEL_MESSAGE,
  CRX_MCP_OVER_CDP_SIDE_PANEL_SIDE_PANEL_VISIBILITY_CHANGE,
  CRX_MCP_OVER_CDP_SIDE_PANEL_SIDE_PANEL_RELOAD,
} from '@shared/utils/message';
import { MessageServer } from '@shared/ipc/message/MessageServer';
import { MessageServerManagerService } from './services/messageServerManager.service';
import {
  ILocalAsyncStorage,
  LocalAsyncStorageService,
} from '@shared/storage/localAsyncStorage/localAsyncStorage.service';
import { CRXMCPService, ICRXMCPService } from '@shared/services/crxMCP.service';

// Define a basic schema for your local async storage
interface BackgroundStorageSchema {
  [key: string]: unknown;
  openAiApiKey?: string;
}

export class BackgroundApp extends Disposable {
  constructor() {
    super();
  }

  async start() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const instantiationService = await this.initServices();
    this.registerListeners();
  }

  async initServices(): Promise<InstantiationService> {
    // Initialize containers
    const serviceCollection = new ServiceCollection();
    const disposables = this._register(new DisposableStore());
    const instantiationService = new InstantiationService(serviceCollection, true);

    // Add all services registered in own file with
    const contributedServices = getSingletonServiceDescriptors();

    for (const [id, descriptor] of contributedServices) {
      serviceCollection.set(id, descriptor);
    }

    // Message Server
    const messageServer = new MessageServer(`documentId:service-worker`);
    instantiationService.createInstance(MessageServerManagerService).start();

    const mathService = instantiationService.createInstance(MathService);
    serviceCollection.set(IMathService, mathService);

    // Register LocalAsyncStorageService
    const localAsyncStorageService = this._register(
      instantiationService.createInstance(LocalAsyncStorageService<BackgroundStorageSchema>),
    );
    serviceCollection.set(ILocalAsyncStorage, localAsyncStorageService);
    await localAsyncStorageService.start();

    // CRX MCP Service - created after storage service is registered
    const crxMcpService = instantiationService.createInstance(CRXMCPService);
    serviceCollection.set(ICRXMCPService, crxMcpService);

    // Provide access to accessor for services that need configuration to instantiate
    const mathServiceChannel = ProxyChannel.fromService(mathService, disposables);
    messageServer.registerChannel('mathService', mathServiceChannel);

    // Register CRX MCP Service channel
    const crxMcpServiceChannel = ProxyChannel.fromService(crxMcpService, disposables);
    messageServer.registerChannel('crxMcpService', crxMcpServiceChannel);

    // // Call tester method
    // await crxMcpService.tester();

    // // Run comprehensive driver tests
    // await crxMcpService.runDriverTests();

    // Test the baby elephant agent
    // debugger;
    // console.log('🐘 Testing baby elephant agent...');
    // const result = await crxMcpService.runBabyElephantAgent('baby elephants');
    // console.log('Baby elephant agent result:', result);

    return instantiationService;
  }

  private openLandingPage() {
    try {
      const landingPageUrl = chrome.runtime.getURL('landing.html');
      chrome.tabs.create({ url: landingPageUrl });
    } catch (error) {
      console.error('Failed to open landing page:', error);
    }
  }

  registerListeners() {
    chrome.runtime.onMessage.addListener(
      (
        message: DocumentMessage,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: DocumentResponse) => void,
      ) => {
        if (!message?.type) {
          sendErrorResponse('Invalid message format', sendResponse);
          return false;
        }

        switch (message.type) {
          case 'crx-mcp-over-cdp-side-panel:requestDocumentId':
            getDocumentId(sender)
              .then(documentId => {
                sendResponse({ documentId });
              })
              .catch(error => sendErrorResponse(error, sendResponse));
            return true;

          case 'crx-mcp-over-cdp-side-panel:requestWindowId':
            getWindowId(sender)
              .then(windowId => {
                sendResponse({ windowId });
              })
              .catch(error => sendErrorResponse(error, sendResponse));
            return true;

          case 'crx-mcp-over-cdp-side-panel:requestInformation':
            getInformation(sender)
              .then(info => {
                sendResponse(info);
              })
              .catch(error => sendErrorResponse(error, sendResponse));
            return true;

          case 'crx-mcp-over-cdp-side-panel:console.log':
            console.log('console.log ', message, sender);
            return false;

          case CRX_MCP_OVER_CDP_SIDE_PANEL_HELLO:
          case CRX_MCP_OVER_CDP_SIDE_PANEL_MESSAGE:
          case CRX_MCP_OVER_CDP_SIDE_PANEL_DISCONNECT:
          case CRX_MCP_OVER_CDP_SIDE_PANEL_SIDE_PANEL_VISIBILITY_CHANGE:
          case CRX_MCP_OVER_CDP_SIDE_PANEL_SIDE_PANEL_RELOAD:
            return false;

          default:
            sendErrorResponse(
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              `Unknown message type: ${message.type}`,
              sendResponse,
            );
            return false;
        }
      },
    );
  }
}
