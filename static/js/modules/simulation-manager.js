/**
 * 模擬狀態管理模組
 * 處理 CMO 模擬狀態監聽和輪詢
 */

import { POLLING_INTERVAL, SIMULATION_STATUS_INTERVAL, THEME_COLORS } from '../utils/constants.js';

export class SimulationManager {
  constructor(apiClient, uiManager, messageManager) {
    this.apiClient = apiClient;
    this.uiManager = uiManager;
    this.messageManager = messageManager;
    this.pollingInterval = null;
    this.simulationId = null;
  }

  /**
   * 啟動兵推模擬輪詢
   * @param {string} simulationId - 模擬 ID
   */
  startPolling(simulationId) {
    this.simulationId = simulationId;

    this.pollingInterval = setInterval(async () => {
      try {
        const status = await this.apiClient.checkSimulationStatus(simulationId);

        this.uiManager.updateLoadingProgress(status.progress || 0, status.message || '計算中...');

        if (status.status === 'completed') {
          clearInterval(this.pollingInterval);
          this.uiManager.hideLoading();
          this.messageManager.addSystemMessage(
            `✅ ${status.message}\n📊 模擬已完成，可以執行「攻擊配對線繪製」查看結果`
          );
          this.uiManager.showNotification('兵棋模擬完成！', 'success');
        } else if (status.status === 'failed') {
          clearInterval(this.pollingInterval);
          this.uiManager.hideLoading();
          this.messageManager.addSystemMessage(`❌ 模擬失敗`, 'error');
        }
      } catch (error) {
        console.error('輪詢錯誤:', error);
      }
    }, POLLING_INTERVAL);
  }

  /**
   * 啟動模擬狀態監聽（監聽 CMO 完成事件）
   * @param {string} apiMode - API 模式（"local" | "real" | "mock"）
   */
  async startSimulationStatusPolling(apiMode = 'local') {
    // 依 api_mode 選擇輪詢目標：real → Flask，其他 → Node.js
    const fetchStatus = async () => {
      if (apiMode === 'real') {
        return await this.apiClient.getSimulationStatusFromFlask();
      }
      return await this.apiClient.getSimulationStatus();
    };

    console.log(`📡 模擬狀態輪詢模式: ${apiMode} (${apiMode === 'real' ? 'Flask' : 'Node.js'})`);

    // 先獲取當前狀態作為基準，避免頁面載入時誤判
    let lastCompletedStatus = false;

    try {
      const result = await fetchStatus();
      if (result.success && result.simulation_status) {
        lastCompletedStatus = result.simulation_status.is_completed;
        console.log('📊 初始化模擬狀態基準:', lastCompletedStatus);
      }
    } catch (error) {
      console.log('⚠️ 無法獲取初始模擬狀態（後端可能未啟動）');
    }

    // 每 3 秒檢查一次模擬狀態
    setInterval(async () => {
      try {
        const result = await fetchStatus();

        if (result.success && result.simulation_status) {
          const currentStatus = result.simulation_status.is_completed;

          // 只在狀態從 false 變成 true 時才通知（真正的狀態改變）
          if (currentStatus && !lastCompletedStatus && result.simulation_status.last_message) {
            console.log('🎯 檢測到模擬完成！觸發通知');
            this.showCMOCompletionDialog(result.simulation_status.last_message);
          }

          // 更新上一次狀態
          lastCompletedStatus = currentStatus;
        }
      } catch (error) {
        // 靜默處理錯誤，避免在後端未啟動時不斷報錯
        if (window.location.hostname === 'localhost') {
          console.log('📡 輪詢檢查中... (後端服務可能未啟動)');
        }
      }
    }, SIMULATION_STATUS_INTERVAL);
  }

  /**
   * 顯示 CMO 完成對話框
   * @param {string} message - 完成訊息
   */
  showCMOCompletionDialog(message) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 64px; margin-bottom: 10px;">🎯</div>
          <h2 style="color: ${THEME_COLORS.success}; margin-bottom: 10px;">模擬完成</h2>
          <p style="color: ${THEME_COLORS.textMuted}; font-size: 14px;">${new Date().toLocaleString('zh-TW')}</p>
        </div>

        <div style="background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <h3 style="color: ${THEME_COLORS.successDark}; margin-bottom: 10px; font-size: 16px;">✅ 模擬狀態</h3>
          <p style="color: #1b5e20; font-size: 15px; line-height: 1.6;">
            ${message || '武器分派演算已完成'}
          </p>
        </div>

        <div style="background: #fff3e0; padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid ${THEME_COLORS.warning};">
          <h3 style="color: ${THEME_COLORS.warningDark}; margin-bottom: 10px; font-size: 16px;">✅ 接下來可以...</h3>
          <ul style="color: ${THEME_COLORS.textMuted}; font-size: 14px; line-height: 1.8; margin-left: 20px;">
            <li>開始進行<strong>攻擊配對線繪製</strong></li>
            <li>查詢<strong>武器分派結果</strong></li>
            <li>查看<strong>地圖視覺化呈現</strong></li>
          </ul>
        </div>

        <div style="text-align: right;">
          <button onclick="this.closest('.modal').remove()"
                  style="padding: 12px 24px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
            ✓ 我知道了
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 同時在聊天區域添加系統訊息
    this.messageManager.addSystemMessage(
      `🎯 CMO 模擬完成！\n${message || '\n\n武器分派演算已完成'}\n\n您現在可以開始進行攻擊配對線繪製。`
    );

    // 播放通知音效（如果瀏覽器支持）
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUhELTKXh8bllHAU2jdXvzn0pBSl+zPLaizsKHGjE5+m8b2vGAAAA');
      audio.play();
    } catch (e) {
      // 忽略音效錯誤
    }
  }

  /**
   * 停止輪詢
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
