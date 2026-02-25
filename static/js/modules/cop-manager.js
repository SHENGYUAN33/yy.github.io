/**
 * COP (Common Operational Picture) 管理模組
 * 處理 COP 截圖保存功能
 */

export class COPManager {
  constructor(apiClient, uiManager, fileManager) {
    this.apiClient = apiClient;
    this.uiManager = uiManager;
    this.fileManager = fileManager;
  }

  /**
   * 保存 COP 截圖
   */
  async handleSaveCOP() {
    try {
      // 獲取地圖 iframe
      const mapIframe = document.getElementById('folium-map');

      if (!mapIframe || mapIframe.style.display === 'none') {
        this.uiManager.showNotification('⚠️ 請先切換到地圖顯示', 'warning');
        return;
      }

      // 檢查地圖是否已載入
      if (!mapIframe.src || mapIframe.src === 'about:blank') {
        this.uiManager.showNotification('⚠️ 請先載入地圖（選擇功能並執行指令）', 'warning');
        return;
      }

      this.uiManager.showLoading('正在截取地圖畫面...');
      this.uiManager.updateLoadingProgress(30, '正在處理截圖...');

      try {
        // 調用後端 API 進行截圖
        const result = await this.apiClient.saveCOP();

        this.uiManager.updateLoadingProgress(80, '準備下載...');

        if (result.success && result.image_base64) {
          // 使用後端返回的 Base64 圖片，寫入使用者選擇的資料夾
          const filename = result.filename || `COP_${Date.now()}.png`;
          const metadata = result.metadata || null;

          this.uiManager.hideLoading();

          // 保存到資料夾
          await this.fileManager.saveCOPToFolder(
            result.image_base64,
            filename,
            metadata
          );
        } else {
          throw new Error(result.error || '截圖失敗');
        }

      } catch (apiError) {
        console.error('後端 API 錯誤:', apiError);
        this.uiManager.hideLoading();
        this.uiManager.showNotification('❌ 後端截圖失敗，請確認 Flask 服務正常運行', 'error');
      }

    } catch (error) {
      this.uiManager.hideLoading();
      this.uiManager.showNotification('❌ 截圖失敗：' + error.message, 'error');
      console.error('截圖錯誤:', error);
    }
  }
}
