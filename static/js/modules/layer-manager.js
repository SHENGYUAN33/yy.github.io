/**
 * 圖資管理模組
 * 用途：管理自訂底圖圖層的新增、刪除、開關、透明度調整
 * 支援 2D (Folium/Leaflet) 和 3D (Cesium) 雙模式
 */

export class LayerManager {
  constructor(apiClient, mapManager, cesiumManager) {
    this.apiClient = apiClient;
    this.mapManager = mapManager;
    this.cesiumManager = cesiumManager;
    this.customLayers = [];
    this.cesiumImageryLayers = {};  // layer_id -> Cesium ImageryLayer
  }

  /**
   * 從後端載入自訂圖層清單
   */
  async loadCustomLayers() {
    try {
      const result = await this.apiClient.getCustomLayers();
      if (result.success) {
        this.customLayers = result.layers || [];
        this._applyCesiumLayers();
      }
    } catch (error) {
      console.error('載入自訂圖層失敗:', error);
    }
  }

  /**
   * 開啟圖層管理面板
   */
  openLayerPanel() {
    const modal = document.getElementById('layer-modal');
    if (modal) {
      this._renderLayerList();
      modal.classList.add('active');
    }
  }

  /**
   * 關閉圖層管理面板
   */
  closeLayerPanel() {
    const modal = document.getElementById('layer-modal');
    if (modal) modal.classList.remove('active');
  }

  /**
   * 新增自訂圖層
   */
  async addLayer() {
    const nameInput = document.getElementById('layer-add-name');
    const urlInput = document.getElementById('layer-add-url');
    const attrInput = document.getElementById('layer-add-attribution');
    const opacityInput = document.getElementById('layer-add-opacity');

    const name = nameInput.value.trim();
    const urlTemplate = urlInput.value.trim();
    const attribution = attrInput.value.trim();
    const opacity = parseFloat(opacityInput.value) || 1.0;

    if (!name || !urlTemplate) {
      alert('請填寫圖層名稱和 URL 模板');
      return;
    }

    if (!urlTemplate.includes('{z}') || !urlTemplate.includes('{x}') || !urlTemplate.includes('{y}')) {
      alert('URL 模板必須包含 {z}, {x}, {y} 佔位符');
      return;
    }

    try {
      const result = await this.apiClient.addCustomLayer({
        name,
        url_template: urlTemplate,
        attribution,
        opacity: Math.max(0, Math.min(1, opacity))
      });

      if (result.success) {
        this.customLayers = result.layers || [];
        this._renderLayerList();
        this._clearAddForm();
        await this._refreshCurrentMap();
      } else {
        alert(result.error || '新增圖層失敗');
      }
    } catch (error) {
      console.error('新增圖層錯誤:', error);
      alert('新增圖層時發生錯誤');
    }
  }

  /**
   * 刪除自訂圖層
   */
  async removeLayer(layerId) {
    try {
      const result = await this.apiClient.deleteCustomLayer(layerId);
      if (result.success) {
        this.customLayers = result.layers || [];
        this._removeCesiumLayer(layerId);
        this._renderLayerList();
        await this._refreshCurrentMap();
      }
    } catch (error) {
      console.error('刪除圖層錯誤:', error);
    }
  }

  /**
   * 切換圖層啟用狀態
   */
  async toggleLayer(layerId, enabled) {
    try {
      const result = await this.apiClient.updateCustomLayer(layerId, { enabled });
      if (result.success) {
        this.customLayers = result.layers || [];

        // 3D 模式即時更新
        if (enabled) {
          const layer = this.customLayers.find(l => l.id === layerId);
          if (layer) this._addCesiumLayer(layer);
        } else {
          this._removeCesiumLayer(layerId);
        }

        await this._refreshCurrentMap();
      }
    } catch (error) {
      console.error('切換圖層錯誤:', error);
    }
  }

  // ==================== 內部方法 ====================

  /**
   * 將所有已啟用的自訂圖層加到 Cesium 3D
   */
  _applyCesiumLayers() {
    // 先清除舊的
    for (const id of Object.keys(this.cesiumImageryLayers)) {
      this._removeCesiumLayer(id);
    }

    // 加入已啟用的
    for (const layer of this.customLayers) {
      if (layer.enabled) {
        this._addCesiumLayer(layer);
      }
    }
  }

  /**
   * 加入單個 Cesium imagery layer
   */
  _addCesiumLayer(layerConfig) {
    if (!this.cesiumManager || !this.cesiumManager.viewer) return;
    if (this.cesiumImageryLayers[layerConfig.id]) return;

    try {
      const imageryLayer = this.cesiumManager.addCustomImageryLayer(layerConfig);
      if (imageryLayer) {
        this.cesiumImageryLayers[layerConfig.id] = imageryLayer;
      }
    } catch (error) {
      console.error('加入 Cesium 圖層失敗:', error);
    }
  }

  /**
   * 移除單個 Cesium imagery layer
   */
  _removeCesiumLayer(layerId) {
    const imageryLayer = this.cesiumImageryLayers[layerId];
    if (imageryLayer && this.cesiumManager) {
      this.cesiumManager.removeCustomImageryLayer(imageryLayer);
      delete this.cesiumImageryLayers[layerId];
    }
  }

  /**
   * 刷新 2D 地圖（重新生成 Folium HTML）
   */
  async _refreshCurrentMap() {
    try {
      const result = await this.apiClient.refreshMap();
      if (result.success && result.map_url) {
        this.mapManager.showMap(result.map_url);
      }
    } catch (error) {
      console.error('刷新地圖失敗:', error);
    }
  }

  /**
   * 渲染圖層清單 UI
   */
  _renderLayerList() {
    const container = document.getElementById('layer-list');
    if (!container) return;

    if (this.customLayers.length === 0) {
      container.innerHTML = '<p style="color:#999;text-align:center;padding:20px 0;">尚無自訂圖層</p>';
      return;
    }

    let html = '';
    for (const layer of this.customLayers) {
      html += `
        <div class="layer-item" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;margin-bottom:8px;background:rgba(30,60,114,0.05);border:1px solid rgba(30,60,114,0.15);border-radius:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;color:#1e3c72;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${layer.name}</div>
            <div style="font-size:11px;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;" title="${layer.url_template}">${layer.url_template}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-left:12px;flex-shrink:0;">
            <label class="toggle-switch" style="margin:0;">
              <input type="checkbox" ${layer.enabled ? 'checked' : ''} onchange="window._layerManager.toggleLayer('${layer.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
            <button onclick="window._layerManager.removeLayer('${layer.id}')"
              style="background:#f44336;color:white;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:12px;">
              刪除
            </button>
          </div>
        </div>`;
    }

    container.innerHTML = html;
  }

  /**
   * 清空新增表單
   */
  _clearAddForm() {
    const fields = ['layer-add-name', 'layer-add-url', 'layer-add-attribution'];
    for (const id of fields) {
      const el = document.getElementById(id);
      if (el) el.value = '';
    }
    const opacityEl = document.getElementById('layer-add-opacity');
    if (opacityEl) opacityEl.value = '1.0';
  }
}
