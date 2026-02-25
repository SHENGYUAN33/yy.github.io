/**
 * 主入口文件
 * 初始化所有模組並設置全域事件監聽器
 */

// 導入所有模組
import { API_BASE, MODE_NAMES, MODE_TIPS } from './utils/constants.js';
import { getCurrentLLMInfo, handleLLMChange, populateLLMSelector, setDynamicModelMap } from './utils/helpers.js';
import { apiClient } from './modules/api-client.js';
import { UIManager } from './modules/ui-manager.js';
import { FileManager } from './modules/file-manager.js';
import { MapManager } from './modules/map-manager.js';
import { MessageManager } from './modules/message-manager.js';
import { PromptManager } from './modules/prompt-manager.js';
import { FeedbackManager } from './modules/feedback-manager.js';
import { COPManager } from './modules/cop-manager.js';
import { SettingsManager } from './modules/settings-manager.js';
import { SimulationManager } from './modules/simulation-manager.js';
import { CesiumManager } from './modules/cesium-manager.js';
import { LayerManager } from './modules/layer-manager.js';
import { SearchManager } from './modules/search-manager.js';
import { ScenarioSaveManager } from './modules/scenario-save-manager.js';

/**
 * 應用程式狀態
 */
class AppState {
  constructor() {
    this.currentMode = null;
    this.currentTab = 'map';
  }
}

/**
 * 應用程式主類別
 */
class Application {
  constructor() {
    // 初始化狀態
    this.state = new AppState();

    // 初始化管理器
    this.uiManager = new UIManager();
    this.fileManager = new FileManager(this.uiManager);
    this.mapManager = new MapManager(apiClient, this.uiManager);
    this.messageManager = new MessageManager(this.uiManager);
    this.promptManager = new PromptManager(apiClient, this.uiManager);
    this.feedbackManager = new FeedbackManager(apiClient, this.uiManager);
    this.copManager = new COPManager(apiClient, this.uiManager, this.fileManager);
    this.settingsManager = new SettingsManager(apiClient, this.uiManager);
    this.simulationManager = new SimulationManager(
      apiClient,
      this.uiManager,
      this.messageManager
    );
    this.cesiumManager = new CesiumManager(this.settingsManager);
    this.layerManager = new LayerManager(apiClient, this.mapManager, this.cesiumManager);
    this.searchManager = new SearchManager(this.mapManager, this.cesiumManager);
    this.scenarioSaveManager = new ScenarioSaveManager(
      apiClient, this.uiManager, this.mapManager,
      this.messageManager, this.cesiumManager, this.searchManager
    );

    // 暴露全域函數供 HTML 調用
    this.exposeGlobalFunctions();
  }

  /**
   * 初始化應用程式
   */
  async init() {
    console.log('軍事兵推 AI 系統 v6.0 已載入（Llama3.2 3B Agent）');

    // 顯示系統就緒訊息
    this.messageManager.addSystemMessage('🎖️ 系統已就緒！請選擇功能模式開始使用。');

    // 載入系統設置
    await this.settingsManager.loadSystemSettings();

    // 動態載入 LLM 模型清單（從 system_config.json）
    const modelMap = await populateLLMSelector(apiClient);
    if (modelMap) {
      setDynamicModelMap(modelMap);
    }

    // 載入自訂圖層
    await this.layerManager.loadCustomLayers();

    // 初始化搜尋 UI 事件
    this.searchManager.initSearchUI();

    // 載入 Prompt 配置列表
    await this.promptManager.loadPromptConfigs();

    // 啟動模擬狀態監聽（依 api_mode 決定輪詢 Flask 或 Node.js）
    const apiMode = this.settingsManager.getApiMode();
    this.simulationManager.startSimulationStatusPolling(apiMode);

    // 初始化上圖台/下文本拖曳分隔線
    this.uiManager.initSplitLayout();

    // 還原深色模式偏好
    if (localStorage.getItem('dark_mode') === '1') {
      document.documentElement.setAttribute('data-theme', 'dark');
      const chk = document.getElementById('setting-dark-mode');
      if (chk) chk.checked = true;
    }

    // 設置事件監聯器
    this.setupEventListeners();

    // 清空本分頁的後端 MapState
    this.clearMapState();
  }

  /**
   * 清空地圖狀態
   */
  async clearMapState() {
    try {
      await apiClient.clearMap();
      console.log('🧹 已清空本分頁地圖狀態 (client_id=', window.CLIENT_ID, ')');
    } catch (error) {
      console.log('🧹 清空地圖狀態失敗 (可能後端尚未啟動)');
    }
  }

  /**
   * 設置事件監聽器
   */
  setupEventListeners() {
    // Enter 鍵發送訊息
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    // 清除對話事件
    window.addEventListener('clear-conversation', () => {
      this.messageManager.clearConversation();
    });
  }

  /**
   * 暴露全域函數供 HTML 調用
   */
  exposeGlobalFunctions() {
    // UI 相關
    window.toggleFunction = (header) => this.uiManager.toggleFunction(header);
    window.switchTab = (tab) => this.uiManager.switchTab(tab);
    window.handleBack = () => this.uiManager.handleBack();
    window.clearText = () => this.uiManager.clearText();

    // 模式選擇
    window.setMode = (mode) => this.setMode(mode);

    // 訊息發送
    window.sendMessage = () => this.sendMessage();

    // 地圖相關
    window.clearMap = () => this.mapManager.clearMap();

    // 檔案管理
    window.handleSaveConversation = () => this.fileManager.handleSaveConversation();
    window.handleSaveCOP = () => this.copManager.handleSaveCOP();

    // 設置管理
    window.openAdminPanel = () => this.settingsManager.openAdminPanel();
    window.closeAdminPanel = () => this.settingsManager.closeAdminPanel();
    window.updateSettings = () => this.settingsManager.updateSettings();

    // LLM 模型切換
    window.handleLLMChange = () => handleLLMChange(this.uiManager.showNotification.bind(this.uiManager));

    // Prompt 配置管理
    window.handlePromptConfigChange = () => this.promptManager.handlePromptConfigChange();
    window.openPromptManager = () => this.promptManager.openPromptManager();
    window.promptManager = this.promptManager; // 暴露整個 promptManager 實例

    // 反饋管理
    window.viewFeedbacks = () => this.feedbackManager.viewFeedbacks();
    window.showFeedback = (button) => this.feedbackManager.showFeedback(button);

    // RAG 按鈕功能
    window.copyAnswer = (button) => this.messageManager.copyAnswer(button);
    window.showSource = (button) => this.messageManager.showSource(
      button,
      this.settingsManager.getSystemSettings()
    );

    // 3D 地球儀切換
    window.toggle3DMode = () => this.toggle3DMode();

    // 圖資管理
    window._layerManager = this.layerManager;
    window.openLayerPanel = () => this.layerManager.openLayerPanel();
    window.closeLayerPanel = () => this.layerManager.closeLayerPanel();
    window.addCustomLayer = () => this.layerManager.addLayer();

    // 船艦搜尋
    window._searchManager = this.searchManager;

    // 場景儲存/載入
    window._scenarioSaveManager = this.scenarioSaveManager;
    window.saveScenario = () => this.scenarioSaveManager.save();
    window.openScenarioList = () => this.scenarioSaveManager.openList();
    window.closeScenarioList = () => this.scenarioSaveManager.closeList();

    // 取消請求
    window.cancelCurrentRequest = () => {
      apiClient.cancelCurrentRequest();
      this.uiManager.hideLoading();
      this.messageManager.addSystemMessage('已取消操作');
    };

    // 深色模式
    window.toggleDarkMode = () => {
      const checkbox = document.getElementById('setting-dark-mode');
      const isDark = checkbox && checkbox.checked;
      if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      localStorage.setItem('dark_mode', isDark ? '1' : '0');
    };
  }

  /**
   * 切換 2D / 3D 地圖模式
   */
  async toggle3DMode() {
    if (this.cesiumManager.is3DActive) {
      this.cesiumManager.deactivate();
    } else {
      await this.cesiumManager.activate();
    }
  }

  /**
   * 設置模式
   * @param {string} mode - 模式名稱
   */
  setMode(mode) {
    this.state.currentMode = mode;

    // 移除所有按鈕的 active 狀態
    document.querySelectorAll('.mode-button').forEach(btn => btn.classList.remove('active'));

    // 添加當前按鈕的 active 狀態
    event.target.closest('.mode-button').classList.add('active');

    // 顯示提示訊息
    const modeTitle = MODE_NAMES[mode] || mode;
    const modeTip = MODE_TIPS[mode] || '';

    this.messageManager.addSystemMessage(`已切換到【${modeTitle}】模式\n${modeTip}`);

    // 功能二和功能三自動切換到文本模式
    if (mode === 'text_generation' || mode === 'military_qa') {
      this.uiManager.switchTab('text');
    }
  }

  /**
   * 發送訊息
   */
  async sendMessage() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-button');
    const message = input.value.trim();

    if (!message) return;

    if (!this.state.currentMode) {
      this.uiManager.showNotification('請先選擇功能模式', 'warning');
      return;
    }

    this.messageManager.addUserMessage(message);
    input.value = '';
    sendBtn.disabled = true;

    try {
      // 獲取當前選擇的 LLM 模型
      const llmInfo = getCurrentLLMInfo();
      console.log('🤖 使用 LLM 模型:', llmInfo.modelName);

      // 根據模式選擇 API
      let apiMethod;
      if (this.state.currentMode === 'text_generation' || this.state.currentMode === 'military_qa') {
        // 串流模式：啟用時使用 SSE 串流端點
        if (this.settingsManager.isStreamEnabled()) {
          await this._sendStreamingAnswer(message, llmInfo);
          return;
        }
        apiMethod = 'getAnswer';
      } else {
        const methodMap = {
          'import_scenario': 'importScenario',
          'start_scenario': 'startScenario',
          'get_wta': 'getWTA',
          'get_track': 'getTrack'
        };
        apiMethod = methodMap[this.state.currentMode];
      }

      this.uiManager.showLoading('AI 正在分析您的需求...');

      const result = await apiClient[apiMethod](
        message,
        llmInfo.modelName,
        this.promptManager.getSelectedPromptConfig(),
        this.state.currentMode,
        llmInfo.provider
      );

      this.uiManager.hideLoading();

      if (result.success) {
        // 顯示 AI 回答
        if (result.answer) {
          const messageOptions = {};

          // 如果有表格 HTML（武器分派）
          if (result.wta_table_html) {
            messageOptions.tableHtml = result.wta_table_html;
          }

          // 如果需要顯示 RAG 按鈕（功能二、三）
          if (result.show_rag_buttons) {
            messageOptions.showRagButtons = true;
            messageOptions.question = result.question;
            messageOptions.sources = result.sources || [];
            messageOptions.ragId = result.rag_id;
            messageOptions.datetime = result.datetime;
          }

          this.messageManager.addAssistantMessage(result.answer, messageOptions);
        }

        // 功能一：顯示地圖
        if (result.map_url) {
          this.mapManager.showMap(result.map_url);

          // 3D 模式：傳遞資料給 Cesium 渲染器
          if (result.map_data) {
            this.cesiumManager.renderMapData(result.map_data);
            this.searchManager.updateShipIndex(result.map_data);
          }

          if (this.state.currentMode === 'import_scenario' ||
              this.state.currentMode === 'get_wta' ||
              this.state.currentMode === 'get_track') {
            this.uiManager.switchTab('map');

            // 動畫模式提示
            if (this.state.currentMode === 'get_wta' && result.animation_mode) {
              this.messageManager.addSystemMessage(
                '🎬 動畫已啟動，攻擊線將依序出現在地圖中（每條約2-3秒）',
                'success'
              );
            }
          }
        }

        // 處理兵棋模擬
        if (this.state.currentMode === 'start_scenario' && result.simulation_id) {
          this.simulationManager.startPolling(result.simulation_id);
        }

      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
        this.messageManager.addSystemMessage(`❌ ${errorMsg || '執行失敗'}`, 'error');
      }

    } catch (error) {
      this.uiManager.hideLoading();
      if (error.name === 'AbortError') {
        // 使用者主動取消，不顯示錯誤
        return;
      }
      console.error('發送訊息錯誤:', error);
      this.messageManager.addSystemMessage(`❌ 系統錯誤：${error.message}`, 'error');
    } finally {
      sendBtn.disabled = false;
    }
  }

  /**
   * 使用 SSE 串流發送 RAG 問答
   * @param {string} message - 用戶訊息
   * @param {Object} llmInfo - LLM 模型資訊
   */
  async _sendStreamingAnswer(message, llmInfo) {
    const sendBtn = document.getElementById('send-button');

    // 立即建立串流訊息氣泡
    const streamMsg = this.messageManager.createStreamingMessage();

    let metadata = null;
    let hasError = false;

    try {
      await apiClient.getAnswerStream(
        message,
        llmInfo.modelName,
        this.promptManager.getSelectedPromptConfig(),
        this.state.currentMode,
        llmInfo.provider,
        {
          onChunk: (content) => {
            streamMsg.appendText(content);
          },
          onMetadata: (meta) => {
            metadata = meta;
          },
          onError: (errorMsg) => {
            hasError = true;
            console.error('串流錯誤:', errorMsg);
            if (!streamMsg.getText()) {
              this.messageManager.addSystemMessage(`❌ ${errorMsg}`, 'error');
            }
          },
          onDone: () => {
            // finalize 在 await 完成後處理
          }
        }
      );
    } catch (error) {
      hasError = true;
      console.error('串流連線錯誤:', error);
      if (!streamMsg.getText()) {
        this.messageManager.addSystemMessage(`❌ 串流連線錯誤：${error.message}`, 'error');
      }
    }

    // 完成串流訊息
    if (streamMsg.getText()) {
      streamMsg.finalize({
        showRagButtons: true,
        question: metadata?.question || message,
        sources: metadata?.sources || [],
        ragId: metadata?.rag_id || '',
        datetime: metadata?.datetime || ''
      });
    }

    sendBtn.disabled = false;
  }
}

// 初始化應用程式
const app = new Application();

// DOM 載入完成後啟動應用
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
