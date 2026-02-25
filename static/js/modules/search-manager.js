/**
 * 船艦搜尋模組
 * 用途：從地圖資料中搜尋船艦名稱，並將視角飛到該船艦位置
 * 支援 2D (Folium/Leaflet iframe postMessage) 和 3D (Cesium camera.flyTo)
 */

export class SearchManager {
  constructor(mapManager, cesiumManager) {
    this.mapManager = mapManager;
    this.cesiumManager = cesiumManager;
    this.shipIndex = [];  // [{name, location, type, source}]
    this._debounceTimer = null;
  }

  /**
   * 從 map_data JSON 建立船艦索引
   * @param {Object} mapData - 後端回傳的 map_data
   */
  updateShipIndex(mapData) {
    if (!mapData) return;

    const indexMap = new Map();  // name -> ship object（用於去重）

    // 從 markers 提取
    if (mapData.markers) {
      for (const m of mapData.markers) {
        const name = this._extractName(m.popup);
        if (name) {
          indexMap.set(name, {
            name,
            location: m.location,
            type: m.shape === 'diamond' ? 'enemy' : 'roc',
            source: 'marker'
          });
        }
      }
    }

    // 從 tracks 提取（優先覆蓋 marker 的座標，因為航跡的末端位置更即時）
    if (mapData.tracks) {
      for (const t of mapData.tracks) {
        if (t.ship_name && t.coordinates && t.coordinates.length > 0) {
          indexMap.set(t.ship_name, {
            name: t.ship_name,
            location: t.coordinates[t.coordinates.length - 1],
            type: t.type || 'unknown',
            source: 'track'
          });
        }
      }
    }

    this.shipIndex = Array.from(indexMap.values());

    // 有船艦資料時顯示搜尋框
    const container = document.getElementById('ship-search-container');
    if (container) {
      container.style.display = this.shipIndex.length > 0 ? 'block' : 'none';
    }
  }

  /**
   * 搜尋船艦（模糊匹配）
   * @param {string} query - 搜尋關鍵字
   * @returns {Array} 匹配結果
   */
  search(query) {
    if (!query || query.length === 0) return [];
    const q = query.toLowerCase();
    return this.shipIndex.filter(s => s.name.toLowerCase().includes(q));
  }

  /**
   * 飛到指定船艦位置
   * @param {Object} ship - 船艦物件 {name, location, type}
   */
  flyToShip(ship) {
    if (!ship || !ship.location) {
      console.warn('flyToShip: 無效的船艦資料', ship);
      return;
    }
    const [lat, lon] = ship.location;
    console.log(`🔍 飛到船艦: ${ship.name} [${lat}, ${lon}]`);

    if (this.cesiumManager && this.cesiumManager.is3DActive && this.cesiumManager.viewer) {
      // 3D 模式：Cesium camera flyTo（近距離俯瞰船艦）
      this.cesiumManager.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 80000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0
        },
        duration: 2
      });
    } else {
      // 2D 模式：透過 postMessage 通知 iframe 內的 Leaflet
      const iframe = document.getElementById('folium-map');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'flyTo',
          lat: lat,
          lon: lon,
          zoom: 12
        }, '*');
      }
    }

    // 關閉下拉結果
    this._hideResults();

    // 清空搜尋框
    const input = document.getElementById('ship-search-input');
    if (input) input.value = '';
  }

  /**
   * 初始化搜尋 UI 事件監聽
   */
  initSearchUI() {
    const input = document.getElementById('ship-search-input');
    const results = document.getElementById('ship-search-results');
    if (!input || !results) return;

    // 輸入事件（帶 debounce）
    input.addEventListener('input', () => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => {
        const query = input.value.trim();
        if (query.length === 0) {
          this._hideResults();
          return;
        }
        const matches = this.search(query);
        this._renderResults(matches);
      }, 150);
    });

    // 聚焦時如果有內容就顯示結果
    input.addEventListener('focus', () => {
      const query = input.value.trim();
      if (query.length > 0) {
        const matches = this.search(query);
        this._renderResults(matches);
      }
    });

    // 點擊外部關閉下拉
    document.addEventListener('click', (e) => {
      const container = document.getElementById('ship-search-container');
      if (container && !container.contains(e.target)) {
        this._hideResults();
      }
    });

    // Enter 鍵選取第一個結果
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = input.value.trim();
        const matches = this.search(query);
        if (matches.length > 0) {
          this.flyToShip(matches[0]);
        }
      }
      if (e.key === 'Escape') {
        this._hideResults();
        input.blur();
      }
    });
  }

  // ==================== 內部方法 ====================

  /**
   * 從 popup HTML 提取船艦名稱
   */
  _extractName(popup) {
    if (!popup) return '';
    // 移除 HTML 標籤
    const text = popup.replace(/<[^>]*>/g, '').trim();
    // 嘗試匹配 "XXX: 名稱" 或 "XXX：名稱" 模式
    const match = text.match(/[:：]\s*(.+)/);
    if (match) return match[1].trim();
    // 回退：取前 30 字
    return text.substring(0, 30).trim();
  }

  /**
   * 渲染搜尋結果下拉
   */
  _renderResults(matches) {
    const results = document.getElementById('ship-search-results');
    if (!results) return;

    if (matches.length === 0) {
      results.innerHTML = '<div style="padding:10px 12px;color:#999;font-size:13px;">無匹配結果</div>';
      results.style.display = 'block';
      return;
    }

    let html = '';
    for (const ship of matches.slice(0, 10)) {
      const typeIcon = ship.type === 'enemy' ? '🔴' : '🔵';
      const typeLabel = ship.type === 'enemy' ? '敵方' : '我方';
      html += `
        <div class="ship-search-item" style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f0f0f0;transition:background 0.15s;"
             onmouseover="this.style.background='#f0f4ff'"
             onmouseout="this.style.background='transparent'"
             onclick="window._searchManager.flyToShip(${JSON.stringify(ship).replace(/"/g, '&quot;')})">
          <span style="font-size:10px;">${typeIcon}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ship.name}</div>
            <div style="font-size:11px;color:#999;">${typeLabel} · ${ship.location[0].toFixed(2)}, ${ship.location[1].toFixed(2)}</div>
          </div>
        </div>`;
    }

    results.innerHTML = html;
    results.style.display = 'block';
  }

  /**
   * 隱藏搜尋結果下拉
   */
  _hideResults() {
    const results = document.getElementById('ship-search-results');
    if (results) results.style.display = 'none';
  }
}
