/**
 * 工具函數模組
 * 提供通用的輔助函數
 */

import { LLM_MODELS } from './constants.js';

// 動態模型 metadata（由 populateLLMSelector 從後端 API 載入）
let _dynamicModelMap = null;

/**
 * 設定動態模型 metadata map
 * @param {Object|null} map - 從 API 載入的模型 metadata
 */
export function setDynamicModelMap(map) {
  _dynamicModelMap = map;
}

/**
 * HTML 轉義函數
 * 將特殊字元轉換為 HTML 實體，防止 XSS 攻擊
 * @param {string} text - 需要轉義的文本
 * @returns {string} 轉義後的文本
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  // 先轉義 HTML 特殊字元，然後將 \n 轉換為 <br>
  return String(text)
    .replace(/[&<>"']/g, m => map[m])
    .replace(/\\n/g, '<br>');
}

/**
 * 獲取當前選擇的 LLM 資訊
 * @returns {Object} 包含 provider, modelName, fullId 的物件
 */
export function getCurrentLLMInfo() {
  const selector = document.getElementById('llm-model-selector');
  const selectedModel = selector.value;

  // 解析模型 ID (例如: "ollama-mistral:7b")
  const [provider, ...modelParts] = selectedModel.split('-');
  const modelName = modelParts.join('-');

  return {
    provider: provider,      // "ollama"
    modelName: modelName,    // "mistral:7b"
    fullId: selectedModel    // "ollama-mistral:7b"
  };
}

/**
 * 處理 LLM 模型切換
 */
export function handleLLMChange(showNotification) {
  const selector = document.getElementById('llm-model-selector');
  const selectedModel = selector.value;

  console.log(`🔄 切換 LLM 模型: ${selectedModel}`);

  // 優先從動態 map 查找，fallback 到 constants.js 的 LLM_MODELS
  const modelInfo = (_dynamicModelMap && _dynamicModelMap[selectedModel])
                    || LLM_MODELS[selectedModel];

  if (modelInfo) {
    const detail = modelInfo.size
      ? `${modelInfo.name} (${modelInfo.size}, ${modelInfo.speed})`
      : `${modelInfo.name} (${modelInfo.speed})`;
    showNotification(`已切換至: ${detail}`, 'success');
  } else {
    const modelName = selector.options[selector.selectedIndex].text;
    showNotification(`已切換至: ${modelName}`, 'success');
  }

  // 保存選擇到 sessionStorage
  sessionStorage.setItem('selected_llm_model', selectedModel);
}

/**
 * 動態載入 LLM 模型清單到下拉選單
 * 從後端 /api/llm/models 讀取 system_config.json 的模型設定
 *
 * @param {Object} apiClient - API 客戶端實例
 * @returns {Object|null} 模型 metadata map，失敗時返回 null
 */
export async function populateLLMSelector(apiClient) {
  const selector = document.getElementById('llm-model-selector');
  if (!selector) return null;

  try {
    const result = await apiClient.getLLMModels();
    if (!result.success) throw new Error('API 回傳失敗');

    const { providers, active_provider } = result;

    // 清空現有選項
    selector.innerHTML = '';

    // 暫存模型 metadata
    const modelMap = {};

    // 依 Provider 產生 optgroup
    for (const [providerKey, providerConfig] of Object.entries(providers)) {
      const models = providerConfig.models || [];
      if (models.length === 0) continue;

      const group = document.createElement('optgroup');
      group.label = providerConfig.name;

      for (const model of models) {
        const option = document.createElement('option');
        const fullId = `${providerKey}-${model.id}`;
        option.value = fullId;

        // 顯示名稱（含 size 如果有）
        let displayName = model.name;
        if (model.size) displayName += ` (${model.size})`;
        option.textContent = displayName;

        group.appendChild(option);

        // 存入 metadata map
        modelMap[fullId] = {
          name: model.name,
          provider: providerConfig.name,
          size: model.size || '',
          speed: model.speed || '',
          quality: model.quality || ''
        };
      }

      selector.appendChild(group);
    }

    // 設定預設選項：優先恢復 sessionStorage，否則用 active_provider 的 default_model
    const saved = sessionStorage.getItem('selected_llm_model');
    if (saved && saved in modelMap) {
      selector.value = saved;
      console.log(`✅ 已恢復上次選擇的模型: ${saved}`);
    } else {
      const activeConfig = providers[active_provider];
      if (activeConfig) {
        selector.value = `${active_provider}-${activeConfig.default_model}`;
      }
    }

    console.log(`✅ 已從 system_config.json 載入 ${Object.keys(modelMap).length} 個模型`);
    return modelMap;

  } catch (error) {
    console.error('載入 LLM 模型清單失敗，使用內建預設值:', error);
    _populateFallbackOptions(selector);
    return null;
  }
}

/**
 * Fallback：當 API 不可用時，使用內建預設選項
 */
function _populateFallbackOptions(selector) {
  selector.innerHTML = '';
  const group = document.createElement('optgroup');
  group.label = 'Ollama 本地模型';

  const defaults = [
    { value: 'ollama-llama3.2:3b', text: 'Llama 3.2 3B (預設)' },
    { value: 'ollama-mistral:7b', text: 'Mistral 7B' },
    { value: 'ollama-llama3:8b', text: 'Llama 3 8B' },
    { value: 'ollama-llama3.1:70b', text: 'Llama 3.1 70B' }
  ];

  for (const d of defaults) {
    const opt = document.createElement('option');
    opt.value = d.value;
    opt.textContent = d.text;
    group.appendChild(opt);
  }
  selector.appendChild(group);
  selector.value = 'ollama-llama3.2:3b';
}

/**
 * 數據 URL 轉 Blob
 * @param {string} dataURL - 數據 URL
 * @returns {Blob} Blob 對象
 */
export function dataURLToBlob(dataURL) {
  const [meta, base64] = dataURL.split(',');
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binStr = atob(base64);
  const len = binStr.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    u8[i] = binStr.charCodeAt(i);
  }
  return new Blob([u8], { type: mime });
}

/**
 * 生成唯一 Client ID
 * @returns {string} 唯一 ID
 */
export function generateClientId() {
  const rand = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : (Date.now().toString(16) + '-' + Math.random().toString(16).slice(2));
  return `tab-${rand}`;
}

/**
 * 限制數值在指定範圍內
 * @param {number} v - 輸入值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number} 限制後的值
 */
export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
