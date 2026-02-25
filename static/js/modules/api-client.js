/**
 * API 客戶端模組
 * 封裝所有後端 API 調用
 */

import { API_BASE, NODE_API_BASE, CLIENT_ID_KEY } from '../utils/constants.js';
import { generateClientId } from '../utils/helpers.js';

/**
 * API 客戶端類別
 */
export class APIClient {
  constructor() {
    this.apiBase = API_BASE;
    this.nodeApiBase = NODE_API_BASE;
    this.clientId = this.initClientId();
    this.currentAbortController = null;
    this.setupFetchHook();
  }

  /**
   * 取消當前進行中的請求
   */
  cancelCurrentRequest() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /**
   * 初始化 Client ID
   * @returns {string} Client ID
   */
  initClientId() {
    let cid = sessionStorage.getItem(CLIENT_ID_KEY);
    if (!cid) {
      cid = generateClientId();
      sessionStorage.setItem(CLIENT_ID_KEY, cid);
    }
    window.CLIENT_ID = cid;
    return cid;
  }

  /**
   * 設置 Fetch Hook，自動添加 Client ID Header
   */
  setupFetchHook() {
    const _fetch = window.fetch.bind(window);
    const clientId = this.clientId;
    const apiBase = this.apiBase;

    window.fetch = function(resource, init) {
      try {
        if (typeof resource === 'string' && resource.startsWith(apiBase)) {
          init = init || {};
          const headers = new Headers(init.headers || {});
          headers.set('X-Client-ID', clientId);
          init.headers = headers;
        }
      } catch (e) {
        // 靜默忽略
      }
      return _fetch(resource, init);
    };
  }

  /**
   * 通用 POST 請求
   * @param {string} endpoint - API 端點
   * @param {Object} data - 請求數據
   * @returns {Promise<Object>} 響應數據
   */
  async post(endpoint, data = {}) {
    this.currentAbortController = new AbortController();
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: this.currentAbortController.signal
    });
    this.currentAbortController = null;
    return await response.json();
  }

  /**
   * 通用 GET 請求
   * @param {string} endpoint - API 端點
   * @returns {Promise<Object>} 響應數據
   */
  async get(endpoint) {
    const response = await fetch(`${this.apiBase}${endpoint}`);
    return await response.json();
  }

  /**
   * 通用 DELETE 請求
   * @param {string} endpoint - API 端點
   * @returns {Promise<Object>} 響應數據
   */
  async delete(endpoint) {
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method: 'DELETE'
    });
    return await response.json();
  }

  // ==================== 情境模擬相關 API ====================

  /**
   * 匯入場景
   * @param {string} userInput - 用戶輸入
   * @param {string} llmModel - LLM 模型
   * @param {string} promptConfig - Prompt 配置
   * @param {string} mode - 模式
   * @returns {Promise<Object>} 響應數據
   */
  async importScenario(userInput, llmModel, promptConfig, mode, llmProvider) {
    return await this.post('/api/import_scenario', {
      user_input: userInput,
      llm_model: llmModel,
      llm_provider: llmProvider,
      prompt_config: promptConfig,
      mode: mode
    });
  }

  /**
   * 啟動場景
   * @param {string} userInput - 用戶輸入
   * @param {string} llmModel - LLM 模型
   * @param {string} promptConfig - Prompt 配置
   * @param {string} mode - 模式
   * @returns {Promise<Object>} 響應數據
   */
  async startScenario(userInput, llmModel, promptConfig, mode, llmProvider) {
    return await this.post('/api/start_scenario', {
      user_input: userInput,
      llm_model: llmModel,
      llm_provider: llmProvider,
      prompt_config: promptConfig,
      mode: mode
    });
  }

  /**
   * 獲取武器分派結果
   * @param {string} userInput - 用戶輸入
   * @param {string} llmModel - LLM 模型
   * @param {string} promptConfig - Prompt 配置
   * @param {string} mode - 模式
   * @returns {Promise<Object>} 響應數據
   */
  async getWTA(userInput, llmModel, promptConfig, mode, llmProvider) {
    return await this.post('/api/get_wta', {
      user_input: userInput,
      llm_model: llmModel,
      llm_provider: llmProvider,
      prompt_config: promptConfig,
      mode: mode
    });
  }

  /**
   * 獲取軌跡
   * @param {string} userInput - 用戶輸入
   * @param {string} llmModel - LLM 模型
   * @param {string} promptConfig - Prompt 配置
   * @param {string} mode - 模式
   * @returns {Promise<Object>} 響應數據
   */
  async getTrack(userInput, llmModel, promptConfig, mode, llmProvider) {
    return await this.post('/api/get_track', {
      user_input: userInput,
      llm_model: llmModel,
      llm_provider: llmProvider,
      prompt_config: promptConfig,
      mode: mode
    });
  }

  /**
   * 獲取答案（文本生成/問答）
   * @param {string} userInput - 用戶輸入
   * @param {string} llmModel - LLM 模型
   * @param {string} promptConfig - Prompt 配置
   * @param {string} mode - 模式
   * @returns {Promise<Object>} 響應數據
   */
  async getAnswer(userInput, llmModel, promptConfig, mode, llmProvider) {
    return await this.post('/api/get_answer', {
      user_input: userInput,
      llm_model: llmModel,
      llm_provider: llmProvider,
      prompt_config: promptConfig,
      mode: mode
    });
  }

  /**
   * SSE 串流版本的 getAnswer
   * 使用 fetch + ReadableStream 讀取 SSE 事件
   *
   * @param {string} userInput - 用戶輸入
   * @param {string} llmModel - LLM 模型
   * @param {string} promptConfig - Prompt 配置
   * @param {string} mode - 模式
   * @param {string} llmProvider - LLM Provider
   * @param {Object} callbacks - 回呼函式
   * @param {function} callbacks.onChunk - 收到文字片段時呼叫 (content)
   * @param {function} callbacks.onMetadata - 收到元資料時呼叫 (metadata)
   * @param {function} callbacks.onError - 發生錯誤時呼叫 (errorMsg)
   * @param {function} callbacks.onDone - 串流結束時呼叫 ()
   */
  async getAnswerStream(userInput, llmModel, promptConfig, mode, llmProvider, { onChunk, onMetadata, onError, onDone }) {
    const response = await fetch(`${this.apiBase}/api/get_answer_stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_input: userInput,
        llm_model: llmModel,
        llm_provider: llmProvider,
        prompt_config: promptConfig,
        mode: mode
      })
    });

    if (!response.ok) {
      onError(`HTTP 錯誤: ${response.status}`);
      onDone();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 處理完整的 SSE 事件（以雙換行分隔）
        const events = buffer.split('\n\n');
        buffer = events.pop(); // 保留未完成的事件

        for (const eventBlock of events) {
          if (!eventBlock.trim()) continue;

          const lines = eventBlock.split('\n');
          let eventType = '';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }

          if (!eventType || !eventData) continue;

          try {
            const parsed = JSON.parse(eventData);

            switch (eventType) {
              case 'chunk':
                onChunk(parsed.content || '');
                break;
              case 'metadata':
                onMetadata(parsed);
                break;
              case 'error':
                onError(parsed.error || '未知串流錯誤');
                break;
              case 'done':
                onDone();
                return;
            }
          } catch (e) {
            console.warn('SSE 解析錯誤:', e, eventData);
          }
        }
      }
      // 串流結束但沒有收到 done 事件
      onDone();
    } catch (err) {
      onError(`串流讀取錯誤: ${err.message}`);
      onDone();
    }
  }

  /**
   * 檢查模擬狀態
   * @param {string} simulationId - 模擬 ID
   * @returns {Promise<Object>} 響應數據
   */
  async checkSimulationStatus(simulationId) {
    return await this.get(`/api/check_simulation_status/${simulationId}`);
  }

  // ==================== 地圖相關 API ====================

  /**
   * 清除地圖（全部或指定圖層）
   * @param {string|null} layer - 要清除的圖層名稱（'scenario', 'wta', 'tracks'），null 則清除全部
   * @returns {Promise<Object>} 響應數據
   */
  async clearMap(layer = null) {
    const data = layer ? { layer } : {};
    return await this.post('/api/clear_map', data);
  }

  /**
   * 保存 COP 截圖
   * @returns {Promise<Object>} 響應數據
   */
  async saveCOP() {
    return await this.post('/api/save_cop', {});
  }

  // ==================== 圖資管理相關 API ====================

  /**
   * 取得自訂圖層清單
   */
  async getCustomLayers() {
    return await this.get('/api/custom_layers');
  }

  /**
   * 新增自訂圖層
   * @param {Object} layerData - 圖層資料 {name, url_template, attribution, max_zoom, opacity}
   */
  async addCustomLayer(layerData) {
    return await this.post('/api/custom_layers', layerData);
  }

  /**
   * 更新自訂圖層
   * @param {string} layerId - 圖層 ID
   * @param {Object} data - 更新欄位
   */
  async updateCustomLayer(layerId, data) {
    const response = await fetch(`${this.apiBase}/api/custom_layers/${layerId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await response.json();
  }

  /**
   * 刪除自訂圖層
   * @param {string} layerId - 圖層 ID
   */
  async deleteCustomLayer(layerId) {
    return await this.delete(`/api/custom_layers/${layerId}`);
  }

  /**
   * 刷新 2D 地圖（重新生成 Folium HTML）
   */
  async refreshMap() {
    return await this.post('/api/refresh_map', {});
  }

  // ==================== 反饋相關 API ====================

  /**
   * 提交反饋
   * @param {Object} feedbackData - 反饋數據
   * @returns {Promise<Object>} 響應數據
   */
  async submitFeedback(feedbackData) {
    return await this.post('/api/submit_feedback', feedbackData);
  }

  /**
   * 獲取反饋列表
   * @param {number} limit - 限制數量
   * @returns {Promise<Object>} 響應數據
   */
  async getFeedbacks(limit = 20) {
    return await this.get(`/api/get_feedbacks?limit=${limit}`);
  }

  // ==================== 系統設置相關 API ====================

  /**
   * 獲取系統設置
   * @returns {Promise<Object>} 響應數據
   */
  async getSystemSettings() {
    return await this.get('/api/admin/settings');
  }

  /**
   * 更新系統設置
   * @param {Object} settings - 設置數據
   * @returns {Promise<Object>} 響應數據
   */
  async updateSystemSettings(settings) {
    return await this.post('/api/admin/settings', settings);
  }

  /**
   * 獲取 LLM 模型清單（從 system_config.json 動態讀取）
   * @returns {Promise<Object>} 包含 providers 和 active_provider 的響應數據
   */
  async getLLMModels() {
    return await this.get('/api/llm/models');
  }

  // ==================== Prompt 配置相關 API ====================

  /**
   * 獲取 Prompt 配置列表
   * @returns {Promise<Object>} 響應數據
   */
  async listPromptConfigs() {
    return await this.get('/api/prompts/list');
  }

  /**
   * 獲取指定 Prompt 配置
   * @param {string} configName - 配置名稱
   * @returns {Promise<Object>} 響應數據
   */
  async getPromptConfig(configName) {
    return await this.get(`/api/prompts/get?config_name=${encodeURIComponent(configName)}`);
  }

  /**
   * 保存 Prompt 配置
   * @param {Object} configData - 配置數據
   * @returns {Promise<Object>} 響應數據
   */
  async savePromptConfig(configData) {
    return await this.post('/api/prompts/save', configData);
  }

  /**
   * 創建新 Prompt 配置
   * @param {string} configName - 配置名稱
   * @returns {Promise<Object>} 響應數據
   */
  async createPromptConfig(configName) {
    return await this.post('/api/prompts/create', { config_name: configName });
  }

  /**
   * 重命名 Prompt 配置
   * @param {string} oldName - 舊名稱
   * @param {string} newName - 新名稱
   * @returns {Promise<Object>} 響應數據
   */
  async renamePromptConfig(oldName, newName) {
    return await this.post('/api/prompts/rename', { old_name: oldName, new_name: newName });
  }

  /**
   * 刪除 Prompt 配置
   * @param {string} configName - 配置名稱
   * @returns {Promise<Object>} 響應數據
   */
  async deletePromptConfig(configName) {
    return await this.delete(`/api/prompts/delete?config_name=${encodeURIComponent(configName)}`);
  }

  // ==================== 場景儲存/載入 API ====================

  /**
   * 儲存當前場景
   * @param {string} name - 場景名稱
   */
  async saveScenario(name) {
    return await this.post('/api/scenarios/save', { name });
  }

  /**
   * 列出所有已儲存場景
   */
  async listScenarios() {
    return await this.get('/api/scenarios/list');
  }

  /**
   * 載入指定場景
   * @param {string} filename - 場景檔案名稱
   */
  async loadScenario(filename) {
    return await this.post('/api/scenarios/load', { filename });
  }

  /**
   * 刪除場景
   * @param {string} filename - 場景檔案名稱
   */
  async deleteScenario(filename) {
    return await this.post('/api/scenarios/delete', { filename });
  }

  // ==================== Node.js API（模擬狀態監聯）====================

  /**
   * 獲取模擬狀態（Node.js 後端）
   * @returns {Promise<Object>} 響應數據
   */
  async getSimulationStatus() {
    const response = await fetch(`${this.nodeApiBase}/api/v1/get_simulation_status`);
    return await response.json();
  }

  /**
   * 獲取模擬狀態（Flask 後端，real mode 用）
   * @returns {Promise<Object>} 響應數據（格式與 Node.js 版相同）
   */
  async getSimulationStatusFromFlask() {
    return await this.get('/api/get_simulation_status');
  }
}

// 導出單例
export const apiClient = new APIClient();
