/**
 * Prompt 配置管理模組
 * 處理 SYSTEM PROMPT 的配置、編輯和管理
 */

import { THEME_COLORS } from '../utils/constants.js';

export class PromptManager {
  constructor(apiClient, uiManager) {
    this.apiClient = apiClient;
    this.uiManager = uiManager;
    this.currentConfigData = null;
    this.currentFunction = 'import_scenario';
    this.selectedPromptConfig = '預設配置';
  }

  /**
   * 載入所有配置列表到下拉選單
   */
  async loadPromptConfigs() {
    try {
      const result = await this.apiClient.listPromptConfigs();

      if (result.success) {
        const selector = document.getElementById('prompt-config-selector');
        selector.innerHTML = '';

        result.configs.forEach(configName => {
          const option = document.createElement('option');
          option.value = configName;
          option.textContent = configName;
          if (configName === result.default_config) {
            option.selected = true;
            this.selectedPromptConfig = configName;
          }
          selector.appendChild(option);
        });
      }
    } catch (error) {
      console.error('載入配置列表失敗:', error);
    }
  }

  /**
   * 處理配置選擇變更
   */
  handlePromptConfigChange() {
    const selector = document.getElementById('prompt-config-selector');
    this.selectedPromptConfig = selector.value;
    console.log('選擇 PROMPT 配置:', this.selectedPromptConfig);
    this.uiManager.showNotification(`已切換至配置: ${this.selectedPromptConfig}`, 'success');
  }

  /**
   * 打開 PROMPT 管理器
   */
  openPromptManager() {
    const modal = document.createElement('div');
    modal.id = 'prompt-manager-modal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 1400px; width: 95%; max-height: 90vh; overflow-y: auto; padding: 25px;">
        <h3 class="modal-title" style="font-size: 22px; margin-bottom: 20px;">📝 SYSTEM PROMPT 管理</h3>

        <div style="margin-bottom: 20px; padding: 15px; background: #f0f8ff; border-radius: 8px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <label style="font-weight: 600; font-size: 14px;">配置：</label>
          <select id="pm-config-sel" onchange="window.promptManager.loadPromptConfigToEditor()" style="flex: 1; min-width: 200px; padding: 8px; border: 2px solid ${THEME_COLORS.primary}; border-radius: 6px; font-size: 14px;">
          </select>
          <button onclick="window.promptManager.createNewConfig()" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">➕ 新增</button>
          <button onclick="window.promptManager.renameConfig()" style="padding: 8px 16px; background: #17a2b8; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">✏️ 重命名</button>
          <button onclick="window.promptManager.deleteConfig()" style="padding: 8px 16px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px;">🗑️ 刪除</button>
        </div>

        <div style="display: flex; gap: 20px; min-height: 500px;">
          <div style="width: 200px; border-right: 2px solid #e0e0e0; padding-right: 15px;">
            <h4 style="margin-bottom: 15px; font-size: 16px;">功能選擇</h4>
            <button class="pm-func-btn active" data-func="import_scenario" onclick="window.promptManager.selectFunction('import_scenario')">🚢 兵棋場景匯入</button>
            <button class="pm-func-btn" data-func="star_scenario" onclick="window.promptManager.selectFunction('star_scenario')">▶️ 兵棋模擬</button>
            <button class="pm-func-btn" data-func="get_wta" onclick="window.promptManager.selectFunction('get_wta')">🎯 攻擊配對線</button>
            <button class="pm-func-btn" data-func="get_track" onclick="window.promptManager.selectFunction('get_track')">🛤️ 航跡繪製功能</button>
            <button class="pm-func-btn" data-func="text_generation" onclick="window.promptManager.selectFunction('text_generation')">📄 軍事行動準據</button>
            <button class="pm-func-btn" data-func="military_rag" onclick="window.promptManager.selectFunction('military_rag')">❓ 軍事準則問答</button>
          </div>

          <div style="flex: 1; display: flex; flex-direction: column;">
            <h4 style="margin-bottom: 12px; font-size: 16px;">SYSTEM PROMPT 內容</h4>
            <label style="font-weight: 600; color: #28a745; display: block; margin: 10px 0 6px; font-size: 14px;">✏️ 可編輯區域</label>
            <textarea id="pm-edit" style="width: 100%; height: 150px; padding: 12px; border: 2px solid #28a745; border-radius: 6px; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; resize: vertical;"></textarea>

            <div style="border-top: 3px dashed #dc3545; margin: 15px 0; padding-top: 8px; position: relative;">
              <span style="position: absolute; top: -12px; background: white; padding: 0 10px; color: #dc3545; font-size: 12px; font-weight: 600;">⚠️ 以下內容不可編輯（規則與範例）</span>
            </div>

            <label style="font-weight: 600; color: #dc3545; display: block; margin: 6px 0; font-size: 14px;">🔒 規則與範例（不可編輯）</label>
            <textarea id="pm-fixed" readonly style="width: 100%; height: 280px; padding: 12px; border: 2px solid #dc3545; border-radius: 6px; background: #f8f9fa; color: #666; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; resize: vertical;"></textarea>
          </div>

          <div style="width: 180px; padding-left: 15px; border-left: 2px solid #e0e0e0;">
            <h4 style="margin-bottom: 15px; font-size: 16px;">操作</h4>
            <button onclick="window.promptManager.saveCurrentPrompt()" style="width: 100%; padding: 12px; margin-bottom: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); transition: transform 0.2s;">💾 保存修改</button>
            <button onclick="window.promptManager.resetToDefault()" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); transition: transform 0.2s;">🔄 還原預設</button>
            <div id="pm-status" style="margin-top: 15px; padding: 12px; background: #e3f2fd; border-radius: 6px; font-size: 12px; text-align: center; font-weight: 600;">狀態: 未修改</div>
          </div>
        </div>

        <div style="margin-top: 20px; text-align: right; padding-top: 20px; border-top: 2px solid #e0e0e0;">
          <button onclick="window.promptManager.closePromptManager()" style="padding: 12px 30px; background: #6c757d; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">關閉</button>
        </div>
      </div>
      <style>
        .pm-func-btn {
          display: block;
          width: 100%;
          padding: 10px;
          margin-bottom: 8px;
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          text-align: left;
          transition: all 0.3s;
        }
        .pm-func-btn:hover {
          background: #f8f9fa;
          border-color: #1e3c72;
          transform: translateX(3px);
        }
        .pm-func-btn.active {
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          color: white;
          border-color: #1e3c72;
          box-shadow: 0 4px 8px rgba(30, 60, 114, 0.3);
        }
        button[onclick*="save"]:hover,
        button[onclick*="reset"]:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 12px rgba(0,0,0,0.3);
        }
      </style>
    `;

    document.body.appendChild(modal);
    this.loadPromptManagerConfigs();
  }

  /**
   * 載入 Prompt 管理器配置列表
   */
  async loadPromptManagerConfigs() {
    try {
      const result = await this.apiClient.listPromptConfigs();
      if (result.success) {
        const selector = document.getElementById('pm-config-sel');
        selector.innerHTML = '';
        result.configs.forEach(configName => {
          const option = document.createElement('option');
          option.value = configName;
          option.textContent = configName;
          selector.appendChild(option);
        });
        if (result.configs.length > 0) this.loadPromptConfigToEditor();
      }
    } catch (error) {
      console.error('載入失敗:', error);
    }
  }

  /**
   * 載入配置到編輯器
   */
  async loadPromptConfigToEditor() {
    const selector = document.getElementById('pm-config-sel');
    const configName = selector.value;
    if (!configName) return;

    try {
      const result = await this.apiClient.getPromptConfig(configName);
      if (result.success) {
        this.currentConfigData = result.config;
        this.selectFunction(this.currentFunction);
      }
    } catch (error) {
      console.error('載入失敗:', error);
    }
  }

  /**
   * 選擇功能
   * @param {string} functionName - 功能名稱
   */
  selectFunction(functionName) {
    this.currentFunction = functionName;
    document.querySelectorAll('.pm-func-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-func="${functionName}"]`).classList.add('active');

    if (this.currentConfigData && this.currentConfigData[functionName]) {
      document.getElementById('pm-edit').value = this.currentConfigData[functionName].editable || '';
      document.getElementById('pm-fixed').value = this.currentConfigData[functionName].fixed || '';
    }
  }

  /**
   * 保存當前 Prompt
   */
  async saveCurrentPrompt() {
    const configName = document.getElementById('pm-config-sel').value;
    const editableText = document.getElementById('pm-edit').value;

    if (editableText.includes('【規則】') || editableText.includes('【範例】')) {
      this.uiManager.showNotification('錯誤：可編輯區域不能包含【規則】或【範例】', 'error');
      return;
    }

    if (!this.currentConfigData[this.currentFunction]) {
      this.currentConfigData[this.currentFunction] = {};
    }
    this.currentConfigData[this.currentFunction].editable = editableText;

    const saveData = { config_name: configName, prompts: {} };
    ['import_scenario', 'star_scenario', 'get_wta', 'get_track', 'text_generation', 'military_rag'].forEach(func => {
      if (this.currentConfigData[func]) {
        saveData.prompts[func] = {
          editable: this.currentConfigData[func].editable,
          fixed: this.currentConfigData[func].fixed
        };
      }
    });

    try {
      const result = await this.apiClient.savePromptConfig(saveData);
      if (result.success) {
        this.uiManager.showNotification('配置已保存', 'success');
        document.getElementById('pm-status').innerHTML = '<span style="color: #28a745;">✅ 已保存</span>';
        await this.loadPromptConfigs();
      } else {
        this.uiManager.showNotification('保存失敗: ' + result.error, 'error');
      }
    } catch (error) {
      this.uiManager.showNotification('保存失敗', 'error');
    }
  }

  /**
   * 還原到預設配置
   */
  async resetToDefault() {
    if (!confirm('確定要還原到預設配置嗎？')) return;

    try {
      const result = await this.apiClient.getPromptConfig('預設配置');
      if (result.success && result.config[this.currentFunction]) {
        const defaultPrompt = result.config[this.currentFunction];
        document.getElementById('pm-edit').value = defaultPrompt.editable || '';
        if (!this.currentConfigData[this.currentFunction]) {
          this.currentConfigData[this.currentFunction] = {};
        }
        this.currentConfigData[this.currentFunction].editable = defaultPrompt.editable;
        this.uiManager.showNotification('已還原到預設值', 'success');
        document.getElementById('pm-status').innerHTML = '<span style="color: #ffc107;">⚠️ 未保存</span>';
      }
    } catch (error) {
      this.uiManager.showNotification('還原失敗', 'error');
    }
  }

  /**
   * 創建新配置
   */
  async createNewConfig() {
    const configName = prompt('請輸入新配置的名稱：');
    if (!configName || configName.trim() === '') return;

    try {
      const result = await this.apiClient.createPromptConfig(configName.trim());
      if (result.success) {
        this.uiManager.showNotification('配置已創建', 'success');
        await this.loadPromptManagerConfigs();
        await this.loadPromptConfigs();
        document.getElementById('pm-config-sel').value = configName.trim();
        await this.loadPromptConfigToEditor();
      } else {
        this.uiManager.showNotification('創建失敗: ' + result.error, 'error');
      }
    } catch (error) {
      this.uiManager.showNotification('創建失敗', 'error');
    }
  }

  /**
   * 重命名配置
   */
  async renameConfig() {
    const oldName = document.getElementById('pm-config-sel').value;
    if (oldName === '預設配置') {
      this.uiManager.showNotification('不能重命名預設配置', 'error');
      return;
    }

    const newName = prompt('請輸入新的配置名稱：', oldName);
    if (!newName || newName.trim() === '' || newName === oldName) return;

    try {
      const result = await this.apiClient.renamePromptConfig(oldName, newName.trim());
      if (result.success) {
        this.uiManager.showNotification('配置已重命名', 'success');
        await this.loadPromptManagerConfigs();
        await this.loadPromptConfigs();
        document.getElementById('pm-config-sel').value = newName.trim();
        await this.loadPromptConfigToEditor();
      } else {
        this.uiManager.showNotification('重命名失敗: ' + result.error, 'error');
      }
    } catch (error) {
      this.uiManager.showNotification('重命名失敗', 'error');
    }
  }

  /**
   * 刪除配置
   */
  async deleteConfig() {
    const configName = document.getElementById('pm-config-sel').value;
    if (configName === '預設配置') {
      this.uiManager.showNotification('不能刪除預設配置', 'error');
      return;
    }

    if (!confirm(`確定要刪除配置「${configName}」嗎？`)) return;

    try {
      const result = await this.apiClient.deletePromptConfig(configName);
      if (result.success) {
        this.uiManager.showNotification('配置已刪除', 'success');
        await this.loadPromptManagerConfigs();
        await this.loadPromptConfigs();
      } else {
        this.uiManager.showNotification('刪除失敗: ' + result.error, 'error');
      }
    } catch (error) {
      this.uiManager.showNotification('刪除失敗', 'error');
    }
  }

  /**
   * 關閉 Prompt 管理器
   */
  closePromptManager() {
    const modal = document.getElementById('prompt-manager-modal');
    if (modal) modal.remove();
  }

  /**
   * 獲取當前選擇的配置名稱
   * @returns {string} 配置名稱
   */
  getSelectedPromptConfig() {
    return this.selectedPromptConfig;
  }
}
