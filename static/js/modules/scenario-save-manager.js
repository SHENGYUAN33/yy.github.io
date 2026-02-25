/**
 * 場景儲存/載入管理模組
 */
export class ScenarioSaveManager {
  constructor(apiClient, uiManager, mapManager, messageManager, cesiumManager, searchManager) {
    this.apiClient = apiClient;
    this.uiManager = uiManager;
    this.mapManager = mapManager;
    this.messageManager = messageManager;
    this.cesiumManager = cesiumManager;
    this.searchManager = searchManager;
  }

  /**
   * 儲存當前場景（彈出輸入框）
   */
  async save() {
    const name = prompt('請輸入場景名稱：');
    if (!name || !name.trim()) return;

    try {
      this.uiManager.showLoading('正在儲存場景...');
      const result = await this.apiClient.saveScenario(name.trim());
      this.uiManager.hideLoading();

      if (result.success) {
        this.uiManager.showNotification('場景已儲存', 'success');
        this.messageManager.addSystemMessage(`📦 場景「${name.trim()}」已儲存`);
      } else {
        this.uiManager.showNotification(result.error || '儲存失敗', 'error');
      }
    } catch (e) {
      this.uiManager.hideLoading();
      this.uiManager.showNotification('儲存失敗: ' + e.message, 'error');
    }
  }

  /**
   * 開啟場景列表 Modal
   */
  async openList() {
    const modal = document.getElementById('scenario-modal');
    const listEl = document.getElementById('scenario-list');
    if (!modal || !listEl) return;

    listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--color-text-muted);">載入中...</div>';
    modal.classList.add('active');

    try {
      const result = await this.apiClient.listScenarios();
      if (!result.success || !result.scenarios.length) {
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--color-text-muted);">尚無已儲存的場景</div>';
        return;
      }

      listEl.innerHTML = result.scenarios.map(s => {
        const date = s.saved_at ? new Date(s.saved_at).toLocaleString('zh-TW') : '';
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;
                      border:1px solid var(--color-border);border-radius:8px;margin-bottom:8px;
                      background:var(--color-bg-mode-btn);cursor:pointer;transition:all 0.2s;"
               onmouseover="this.style.background='var(--color-bg-mode-hover)'"
               onmouseout="this.style.background='var(--color-bg-mode-btn)'"
               onclick="window._scenarioSaveManager.load('${s.filename}')">
            <div>
              <div style="font-weight:600;color:var(--color-primary);font-size:14px;">${s.name}</div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">${date}</div>
            </div>
            <button style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:16px;padding:4px 8px;"
                    title="刪除"
                    onclick="event.stopPropagation();window._scenarioSaveManager.deleteScenario('${s.filename}')">
              🗑️
            </button>
          </div>`;
      }).join('');
    } catch (e) {
      listEl.innerHTML = `<div style="color:#e74c3c;padding:10px;">載入失敗: ${e.message}</div>`;
    }
  }

  /**
   * 關閉場景列表 Modal
   */
  closeList() {
    const modal = document.getElementById('scenario-modal');
    if (modal) modal.classList.remove('active');
  }

  /**
   * 載入指定場景
   */
  async load(filename) {
    this.closeList();
    try {
      this.uiManager.showLoading('正在載入場景...');
      const result = await this.apiClient.loadScenario(filename);
      this.uiManager.hideLoading();

      if (result.success) {
        if (result.map_url) {
          this.mapManager.showMap(result.map_url);
          if (result.map_data) {
            this.cesiumManager.renderMapData(result.map_data);
            this.searchManager.updateShipIndex(result.map_data);
          }
          this.uiManager.switchTab('map');
        }
        const name = result.name || filename;
        this.messageManager.addSystemMessage(`📂 已載入場景「${name}」`);
        this.uiManager.showNotification('場景已載入', 'success');
      } else {
        this.uiManager.showNotification(result.error || '載入失敗', 'error');
      }
    } catch (e) {
      this.uiManager.hideLoading();
      this.uiManager.showNotification('載入失敗: ' + e.message, 'error');
    }
  }

  /**
   * 刪除場景
   */
  async deleteScenario(filename) {
    if (!confirm('確定要刪除此場景？')) return;

    try {
      const result = await this.apiClient.deleteScenario(filename);
      if (result.success) {
        this.uiManager.showNotification('場景已刪除', 'success');
        await this.openList(); // 刷新列表
      } else {
        this.uiManager.showNotification(result.error || '刪除失敗', 'error');
      }
    } catch (e) {
      this.uiManager.showNotification('刪除失敗: ' + e.message, 'error');
    }
  }
}
