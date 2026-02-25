/**
 * Cesium 3D 地球儀管理模組
 * 用途：管理 Cesium.js 3D 地球儀的初始化、數據渲染、圖層管理和動畫
 * 參照 SinicaView 風格，完全免費（無需 Cesium Ion Token）
 */

// 飛彈飛行時間（毫秒）
const MISSILE_FLIGHT_TIME = 2500;
// 波次間隔（毫秒）
const WAVE_INTERVAL = 1000;
// 飛彈最高海拔（公尺）
const MISSILE_3D_MAX_ALTITUDE = 50000;
// 攻擊弧線採樣點數
const ATTACK_ARC_SEGMENTS = 50;
// 3D 軍事符號大小
const MIL_SYMBOL_3D_SIZE = 48;
// 預設武器顏色
const DEFAULT_WEAPON_COLOR = '#666666';

export class CesiumManager {
  constructor(settingsManager) {
    this.settingsManager = settingsManager;
    this.viewer = null;
    this.is3DActive = false;

    // 圖層資料來源（每層一個 CustomDataSource）
    this.layerSources = {
      scenario: null,
      wta: null,
      tracks: null
    };

    // Google Photorealistic 3D Tiles
    this.google3DTileset = null;

    // 動畫狀態
    this.animationState = {
      isPlaying: false,
      currentTime: 0,
      totalDuration: 0,
      speed: 2,
      lines: [],
      lastFrameTime: null,
      animFrameId: null
    };

    // 軍事符號快取（SIDC → dataURL）
    this.symbolCache = {};

    // 測量狀態
    this.measureState = {
      active: false,
      type: null, // 'distance' | 'area'
      points: [],
      entities: [],
      handler: null
    };

    // 最後接收的 mapData（用於 2D/3D 切換時重新渲染）
    this.lastMapData = null;
  }

  /**
   * 檢查 3D 模式是否在設定中啟用
   */
  is3DEnabled() {
    if (!this.settingsManager) return false;
    const settings = this.settingsManager.getSystemSettings();
    return settings && settings.enable_3d_globe === true;
  }

  // ==================== Viewer 初始化 ====================

  /**
   * 初始化 Cesium Viewer（懶載入，首次啟用時才建立）
   */
  async initViewer() {
    if (this.viewer) return;
    if (typeof Cesium === 'undefined') {
      console.error('Cesium.js 尚未載入');
      return;
    }

    const container = document.getElementById('cesium-container');
    if (!container) return;

    // 設定 Cesium Ion Token（從 config.json 讀取）
    const settings = this.settingsManager ? this.settingsManager.getSystemSettings() : {};
    const token = settings.cesium_ion_token || '';
    if (token) {
      Cesium.Ion.defaultAccessToken = token;
    } else {
      Cesium.Ion.defaultAccessToken = undefined;
    }

    // 免費底圖選項
    const imageryViewModels = [
      new Cesium.ProviderViewModel({
        name: '深色地圖（軍事風格）',
        iconUrl: Cesium.buildModuleUrl('Widgets/Images/ImageryProviders/openStreetMap.png'),
        tooltip: 'CartoDB Dark Matter - 軍事沙盤風格深色底圖',
        creationFunction: () => new Cesium.UrlTemplateImageryProvider({
          url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          credit: new Cesium.Credit('CartoDB Dark Matter'),
          maximumLevel: 18
        })
      }),
      new Cesium.ProviderViewModel({
        name: 'OpenStreetMap',
        iconUrl: Cesium.buildModuleUrl('Widgets/Images/ImageryProviders/openStreetMap.png'),
        tooltip: 'OpenStreetMap 標準街道地圖',
        creationFunction: () => new Cesium.OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/'
        })
      }),
      new Cesium.ProviderViewModel({
        name: '淺色地圖',
        iconUrl: Cesium.buildModuleUrl('Widgets/Images/ImageryProviders/openStreetMap.png'),
        tooltip: 'CartoDB Positron - 簡潔淺色風格',
        creationFunction: () => new Cesium.UrlTemplateImageryProvider({
          url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          credit: new Cesium.Credit('CartoDB Positron'),
          maximumLevel: 18
        })
      })
    ];

    this.viewer = new Cesium.Viewer('cesium-container', {
      imageryProviderViewModels: imageryViewModels,
      selectedImageryProviderViewModel: imageryViewModels[0],
      terrainProvider: token ? Cesium.createWorldTerrain() : undefined,
      terrainProviderViewModels: [],
      baseLayerPicker: true,
      sceneModePicker: true,
      geocoder: false,
      homeButton: true,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      selectionIndicator: true,
      infoBox: true
    });

    // 深色背景（軍事沙盤風格）
    this.viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0a1a');
    this.viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a1a2e');

    // 預設飛到台灣海峽
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(120.5, 23.5, 800000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-45),
        roll: 0
      }
    });

    // 建立圖層資料來源
    for (const layerName of ['scenario', 'wta', 'tracks']) {
      const ds = new Cesium.CustomDataSource(layerName);
      this.viewer.dataSources.add(ds);
      this.layerSources[layerName] = ds;
    }

    // 設定底部狀態列
    this._setupStatusBar();

    // 載入 Google Photorealistic 3D Tiles（如果有 API Key）
    await this._loadGoogle3DTiles(settings);

    // 建立圖層控制面板
    this._createLayerPanel();

    // 建立工具列
    this._createToolbar();

    // 建立視角控制面板
    this._createCameraControlPanel();

    console.log('Cesium 3D 地球儀已初始化');
  }

  // ==================== Google Photorealistic 3D Tiles ====================

  /**
   * 載入 Google Photorealistic 3D Tiles
   * 需要 Google Maps Platform API Key（啟用 Map Tiles API）
   */
  async _loadGoogle3DTiles(settings) {
    const apiKey = settings.google_maps_api_key || '';
    if (!apiKey) {
      console.log('未設定 Google Maps API Key，跳過 3D Tiles 載入');
      return;
    }

    try {
      const tileset = await Cesium.Cesium3DTileset.fromUrl(
        `https://tile.googleapis.com/v1/3dtiles/root.json?key=${apiKey}`
      );
      this.viewer.scene.primitives.add(tileset);
      this.google3DTileset = tileset;

      // 啟用 3D Tiles 時隱藏預設 globe 底圖，避免重疊閃爍
      this.viewer.scene.globe.show = false;

      console.log('Google Photorealistic 3D Tiles 已載入');
    } catch (error) {
      console.error('Google 3D Tiles 載入失敗:', error);
      // 載入失敗時確保 globe 顯示
      this.viewer.scene.globe.show = true;
    }
  }

  /**
   * 切換 Google 3D Tiles 顯示/隱藏
   */
  toggleGoogle3DTiles(visible) {
    if (this.google3DTileset) {
      this.google3DTileset.show = visible;
      // 3D Tiles 顯示時隱藏 globe，反之亦然
      this.viewer.scene.globe.show = !visible;
    }
  }

  // ==================== 自訂圖層管理 ====================

  /**
   * 動態加入自訂 imagery layer
   * @param {Object} layerConfig - {url_template, attribution, max_zoom, opacity}
   * @returns {Object|null} Cesium ImageryLayer 或 null
   */
  addCustomImageryLayer(layerConfig) {
    if (!this.viewer) return null;
    try {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: layerConfig.url_template,
        credit: new Cesium.Credit(layerConfig.attribution || ''),
        maximumLevel: layerConfig.max_zoom || 18
      });
      const imageryLayer = this.viewer.imageryLayers.addImageryProvider(provider);
      imageryLayer.alpha = layerConfig.opacity || 1.0;
      return imageryLayer;
    } catch (error) {
      console.error('加入自訂 Cesium 圖層失敗:', error);
      return null;
    }
  }

  /**
   * 移除自訂 imagery layer
   * @param {Object} imageryLayer - Cesium ImageryLayer 實例
   */
  removeCustomImageryLayer(imageryLayer) {
    if (!this.viewer || !imageryLayer) return;
    try {
      this.viewer.imageryLayers.remove(imageryLayer);
    } catch (error) {
      console.error('移除自訂 Cesium 圖層失敗:', error);
    }
  }

  // ==================== 啟用 / 停用 3D ====================

  /**
   * 啟用 3D 模式 — 從 iframe 切換到 Cesium
   */
  async activate() {
    if (this.is3DActive) return;
    await this.initViewer();

    document.getElementById('folium-map').style.display = 'none';
    document.getElementById('map-placeholder').style.display = 'none';
    document.getElementById('cesium-container').style.display = 'block';
    document.getElementById('cesium-status-bar').style.display = 'block';

    this.is3DActive = true;
    const btn = document.getElementById('toggle-3d-btn');
    if (btn) btn.textContent = '🗺️ 切換 2D 地圖';

    // 如果有之前的資料，重新渲染
    if (this.lastMapData) {
      this.renderMapData(this.lastMapData);
    }
  }

  /**
   * 停用 3D 模式 — 回到 iframe 顯示
   */
  deactivate() {
    if (!this.is3DActive) return;

    document.getElementById('cesium-container').style.display = 'none';
    document.getElementById('cesium-status-bar').style.display = 'none';
    document.getElementById('folium-map').style.display = 'block';

    // 停止動畫
    this._stopAnimation();

    this.is3DActive = false;
    const btn = document.getElementById('toggle-3d-btn');
    if (btn) btn.textContent = '🌐 切換 3D 地球儀';
  }

  // ==================== 資料渲染 ====================

  /**
   * 渲染後端回傳的地圖資料
   * @param {Object} mapData - 後端 map_data JSON
   */
  renderMapData(mapData) {
    if (!mapData) return;

    // 儲存資料（供 2D/3D 切換時重新渲染）— 無論 viewer 是否存在都要儲存
    this.lastMapData = mapData;

    if (!this.viewer || !this.is3DActive) return;

    // 清除所有圖層
    for (const ds of Object.values(this.layerSources)) {
      if (ds) ds.entities.removeAll();
    }

    // 渲染船艦標記
    if (mapData.markers) {
      for (const marker of mapData.markers) {
        this._addMarkerEntity(marker);
      }
    }

    // 渲染攻擊弧線（有動畫資料時跳過，由動畫按順序展示）
    if (mapData.lines && !mapData.wta_animation_data) {
      for (const line of mapData.lines) {
        this._addAttackArcEntity(line);
      }
    }

    // 渲染航跡線
    if (mapData.tracks) {
      for (const track of mapData.tracks) {
        this._addTrackEntity(track);
      }
    }

    // 設定動畫（如果有資料）
    if (mapData.wta_animation_data) {
      this._setupAnimation(mapData.wta_animation_data);
    }

    // 自動調整鏡頭框住所有 entity
    this._flyToAllEntities();
  }

  // ==================== 軍事符號 Billboard ====================

  /**
   * 產生 milsymbol 圖片（快取）
   * @param {string} sidc - Symbol Identification Code
   * @returns {string|null} data URL
   */
  _getSymbolDataURL(sidc) {
    if (this.symbolCache[sidc]) return this.symbolCache[sidc];
    if (typeof ms === 'undefined') return null;

    try {
      const sym = new ms.Symbol(sidc, { size: MIL_SYMBOL_3D_SIZE, infoFields: false });
      const url = sym.toDataURL();
      this.symbolCache[sidc] = url;
      return url;
    } catch (e) {
      console.warn('milsymbol 產生失敗:', e);
      return null;
    }
  }

  /**
   * 從 popup HTML 提取船名
   */
  _extractShipName(popup) {
    if (!popup) return '';
    const text = popup.replace(/<[^>]*>/g, '').trim();
    const match = text.match(/[:：]\s*(.+)/);
    return match ? match[1].trim() : text.substring(0, 20);
  }

  /**
   * 添加船艦標記 Entity（Billboard + Label）
   */
  _addMarkerEntity(markerData) {
    const layer = markerData.layer || 'scenario';
    const ds = this.layerSources[layer];
    if (!ds) return;

    const sidc = markerData.shape === 'diamond' ? 'SHS-------X----' : 'SFS-------X----';
    const imageUrl = this._getSymbolDataURL(sidc);
    const isEnemy = markerData.shape === 'diamond';
    const shipName = this._extractShipName(markerData.popup);

    const entity = {
      position: Cesium.Cartesian3.fromDegrees(
        markerData.location[1], markerData.location[0], 0
      ),
      description: markerData.popup || '',
      label: {
        text: shipName,
        font: '13px Microsoft JhengHei, sans-serif',
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        outlineColor: Cesium.Color.BLACK,
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        pixelOffset: new Cesium.Cartesian2(0, 28),
        fillColor: isEnemy ? Cesium.Color.fromCssColorString('#FF5252') : Cesium.Color.fromCssColorString('#64B5F6'),
        showBackground: true,
        backgroundColor: new Cesium.Color(0, 0, 0, 0.6),
        backgroundPadding: new Cesium.Cartesian2(4, 3),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    };

    if (imageUrl) {
      entity.billboard = {
        image: imageUrl,
        width: MIL_SYMBOL_3D_SIZE,
        height: MIL_SYMBOL_3D_SIZE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      };
    } else {
      // 降級：彩色圓點
      entity.point = {
        pixelSize: 12,
        color: isEnemy ? Cesium.Color.RED : Cesium.Color.BLUE,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      };
    }

    ds.entities.add(entity);
  }

  // ==================== 攻擊弧線（3D 飛彈軌跡）====================

  /**
   * 添加攻擊弧線 Entity（拋物線 + 發光效果）
   */
  _addAttackArcEntity(lineData) {
    const layer = lineData.layer || 'wta';
    const ds = this.layerSources[layer];
    if (!ds) return;

    const startLon = lineData.start[1], startLat = lineData.start[0];
    const endLon = lineData.end[1], endLat = lineData.end[0];
    const positions = [];

    for (let i = 0; i <= ATTACK_ARC_SEGMENTS; i++) {
      const t = i / ATTACK_ARC_SEGMENTS;
      const lat = startLat + (endLat - startLat) * t;
      const lon = startLon + (endLon - startLon) * t;
      // 拋物線海拔：0 → max → 0
      const alt = MISSILE_3D_MAX_ALTITUDE * 4 * t * (1 - t);
      positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, alt));
    }

    ds.entities.add({
      polyline: {
        positions: positions,
        width: 22,
        material: new Cesium.PolylineArrowMaterialProperty(
          Cesium.Color.fromCssColorString(lineData.color || '#FF0000')
        ),
        clampToGround: false
      },
      description: (lineData.popup || '').replace(/\n/g, '<br>')
    });
  }

  // ==================== 航跡線 ====================

  /**
   * 添加航跡線 Entity（地面緊貼 + 終點標記）
   */
  _addTrackEntity(trackData) {
    const layer = trackData.layer || 'tracks';
    const ds = this.layerSources[layer];
    if (!ds) return;

    if (!trackData.coordinates || trackData.coordinates.length === 0) return;

    // 航跡折線（緊貼地面）
    const positions = trackData.coordinates.map(
      coord => Cesium.Cartesian3.fromDegrees(coord[1], coord[0])
    );

    ds.entities.add({
      polyline: {
        positions: positions,
        width: trackData.weight || 3,
        material: Cesium.Color.fromCssColorString(trackData.color || '#FF5252'),
        clampToGround: true
      },
      name: trackData.ship_name
    });

    // 終點加船艦 Billboard
    const lastCoord = trackData.coordinates[trackData.coordinates.length - 1];
    this._addMarkerEntity({
      location: lastCoord,
      popup: `<b>${trackData.type === 'enemy' ? '解放軍' : '國軍'}: ${trackData.ship_name}</b>`,
      shape: trackData.type === 'enemy' ? 'diamond' : 'circle',
      layer: layer
    });
  }

  // ==================== 自動鏡頭 ====================

  /**
   * 飛到所有 Entity 的範圍
   */
  _flyToAllEntities() {
    if (!this.viewer) return;

    // 蒐集所有有 entity 的 DataSource
    let hasEntities = false;
    for (const ds of Object.values(this.layerSources)) {
      if (ds && ds.entities.values.length > 0) {
        hasEntities = true;
        break;
      }
    }

    if (hasEntities) {
      // 延遲一下確保 entity 都建立完成
      setTimeout(() => {
        this.viewer.zoomTo(this.viewer.dataSources).catch(() => {
          // 如果 zoomTo 失敗，飛到預設位置
          this.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(120.5, 23.5, 800000)
          });
        });
      }, 300);
    }
  }

  // ==================== 底部狀態列（SinicaView 風格）====================

  _setupStatusBar() {
    if (!this.viewer) return;

    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    handler.setInputAction((movement) => {
      const cartesian = this.viewer.camera.pickEllipsoid(
        movement.endPosition,
        this.viewer.scene.globe.ellipsoid
      );
      if (cartesian) {
        const carto = Cesium.Cartographic.fromCartesian(cartesian);
        const lon = Cesium.Math.toDegrees(carto.longitude);
        const lat = Cesium.Math.toDegrees(carto.latitude);
        const alt = this.viewer.camera.positionCartographic.height;

        const lonEl = document.getElementById('status-lon');
        const latEl = document.getElementById('status-lat');
        const altEl = document.getElementById('status-alt');

        if (lonEl) lonEl.textContent = lon.toFixed(6);
        if (latEl) latEl.textContent = lat.toFixed(6);
        if (altEl) {
          if (alt > 1000) {
            altEl.textContent = (alt / 1000).toFixed(1) + ' km';
          } else {
            altEl.textContent = alt.toFixed(0) + ' m';
          }
        }
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    // FPS 監測
    let frameCount = 0;
    let lastFPSTime = performance.now();
    this.viewer.scene.postRender.addEventListener(() => {
      frameCount++;
      const now = performance.now();
      if (now - lastFPSTime >= 1000) {
        const fpsEl = document.getElementById('status-fps');
        if (fpsEl) fpsEl.textContent = frameCount;
        frameCount = 0;
        lastFPSTime = now;
      }
    });
  }

  // ==================== 圖層控制面板 ====================

  _createLayerPanel() {
    const LAYERS = {
      scenario: '場景船艦',
      wta: '武器分派',
      tracks: '航跡'
    };

    const panel = document.createElement('div');
    panel.id = 'cesium-layer-panel';
    panel.style.cssText = 'position:absolute;top:50px;left:10px;z-index:999;background:rgba(10,10,26,0.88);padding:14px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.5);color:#ccd;font-family:"Microsoft JhengHei",sans-serif;font-size:13px;min-width:150px;border:1px solid rgba(100,100,180,0.2);';

    let html = '<div style="font-weight:700;color:#7eb8ff;margin-bottom:10px;font-size:14px;">📋 圖層控制</div>';

    for (const [key, label] of Object.entries(LAYERS)) {
      html += `<label style="display:block;margin:6px 0;cursor:pointer;">
        <input type="checkbox" checked data-layer="${key}" style="margin-right:6px;accent-color:#4a9eff;"> ${label}
      </label>`;
    }

    // Google 3D Tiles 開關（僅在已載入時顯示）
    if (this.google3DTileset) {
      html += `<hr style="border:none;border-top:1px solid rgba(100,100,180,0.3);margin:10px 0;">`;
      html += `<label style="display:block;margin:6px 0;cursor:pointer;">
        <input type="checkbox" checked data-google3d="true" style="margin-right:6px;accent-color:#4a9eff;"> Google 3D 實景
      </label>`;
    }

    panel.innerHTML = html;

    // 事件綁定
    panel.addEventListener('change', (e) => {
      const input = e.target;
      if (input.dataset.layer) {
        this.toggleLayer(input.dataset.layer, input.checked);
      }
      if (input.dataset.google3d) {
        this.toggleGoogle3DTiles(input.checked);
      }
    });

    const container = document.getElementById('cesium-container');
    if (container) container.appendChild(panel);
  }

  /**
   * 切換圖層顯示/隱藏
   */
  toggleLayer(layerName, visible) {
    const ds = this.layerSources[layerName];
    if (ds) ds.show = visible;
  }

  // ==================== 工具列 ====================

  _createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'cesium-toolbar';
    toolbar.style.cssText = 'position:absolute;top:130px;right:10px;z-index:999;display:flex;flex-direction:column;gap:6px;';

    const buttons = [
      { icon: '✈️', label: '飛行導覽', action: () => this.generateBattlefieldFlyover() },
      { icon: '📏', label: '測量距離', action: () => this.startMeasureDistance() },
      { icon: '📐', label: '測量面積', action: () => this.startMeasureArea() },
      { icon: '🗑️', label: '清除測量', action: () => this.clearMeasurements() },
      { icon: '🎥', label: '視角控制', action: () => this._toggleCameraPanel() }
    ];

    for (const btn of buttons) {
      const el = document.createElement('button');
      el.title = btn.label;
      el.textContent = btn.icon;
      el.style.cssText = 'width:36px;height:36px;border:none;border-radius:8px;background:rgba(10,10,26,0.85);color:white;font-size:16px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:1px solid rgba(100,100,180,0.2);';
      el.addEventListener('click', btn.action);
      el.addEventListener('mouseenter', () => { el.style.background = 'rgba(42,82,152,0.9)'; });
      el.addEventListener('mouseleave', () => { el.style.background = 'rgba(10,10,26,0.85)'; });
      toolbar.appendChild(el);
    }

    const container = document.getElementById('cesium-container');
    if (container) container.appendChild(toolbar);
  }

  // ==================== 視角控制面板 ====================

  /**
   * 切換視角控制面板顯示/隱藏
   */
  _toggleCameraPanel() {
    const panel = document.getElementById('cesium-camera-panel');
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  }

  /**
   * 建立視角控制面板
   */
  _createCameraControlPanel() {
    const panel = document.createElement('div');
    panel.id = 'cesium-camera-panel';
    panel.style.cssText = 'position:absolute;top:130px;right:52px;z-index:998;background:rgba(10,10,26,0.92);padding:14px 16px;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.5);color:#ccd;font-family:"Microsoft JhengHei",sans-serif;font-size:13px;min-width:220px;border:1px solid rgba(100,100,180,0.2);display:none;';

    // 共用滑桿樣式
    const sliderStyle = 'width:100%;margin:4px 0 10px 0;accent-color:#4a9eff;cursor:pointer;height:6px;';
    const labelStyle = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;';
    const valueStyle = 'color:#4a9eff;font-weight:700;min-width:50px;text-align:right;';

    panel.innerHTML = `
      <div style="font-weight:700;color:#7eb8ff;margin-bottom:12px;font-size:14px;">🎥 視角控制</div>

      <div style="${labelStyle}">
        <span>傾角 (Pitch)</span>
        <span id="cam-pitch-val" style="${valueStyle}">-45°</span>
      </div>
      <input type="range" id="cam-pitch" min="-90" max="0" value="-45" step="1" style="${sliderStyle}">

      <div style="${labelStyle}">
        <span>方位角 (Heading)</span>
        <span id="cam-heading-val" style="${valueStyle}">0°</span>
      </div>
      <input type="range" id="cam-heading" min="0" max="360" value="0" step="1" style="${sliderStyle}">

      <div style="${labelStyle}">
        <span>高度 (Altitude)</span>
        <span id="cam-alt-val" style="${valueStyle}">800 km</span>
      </div>
      <input type="range" id="cam-alt" min="0" max="100" value="58" step="1" style="${sliderStyle}">

      <div style="border-top:1px solid rgba(100,100,180,0.3);padding-top:10px;margin-top:4px;">
        <div style="font-size:12px;color:#889;margin-bottom:8px;">預設視角</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          <button class="cam-preset-btn" data-pitch="-90" data-heading="0" title="正上方俯視" style="flex:1;padding:5px 8px;border:1px solid rgba(100,100,180,0.3);border-radius:6px;background:rgba(30,30,60,0.8);color:#aab;cursor:pointer;font-size:12px;white-space:nowrap;">俯視</button>
          <button class="cam-preset-btn" data-pitch="-45" data-heading="0" title="45度斜視" style="flex:1;padding:5px 8px;border:1px solid rgba(100,100,180,0.3);border-radius:6px;background:rgba(30,30,60,0.8);color:#aab;cursor:pointer;font-size:12px;white-space:nowrap;">45°</button>
          <button class="cam-preset-btn" data-pitch="-15" data-heading="0" title="低角度視角" style="flex:1;padding:5px 8px;border:1px solid rgba(100,100,180,0.3);border-radius:6px;background:rgba(30,30,60,0.8);color:#aab;cursor:pointer;font-size:12px;white-space:nowrap;">低角度</button>
          <button id="cam-reset-btn" title="回到預設位置" style="flex:1;padding:5px 8px;border:1px solid rgba(100,100,180,0.3);border-radius:6px;background:rgba(30,30,60,0.8);color:#aab;cursor:pointer;font-size:12px;white-space:nowrap;">重置</button>
        </div>
      </div>
    `;

    const container = document.getElementById('cesium-container');
    if (container) container.appendChild(panel);

    // — 滑桿事件綁定 —
    const pitchSlider = document.getElementById('cam-pitch');
    const headingSlider = document.getElementById('cam-heading');
    const altSlider = document.getElementById('cam-alt');

    const onSliderInput = () => {
      const pitch = parseFloat(pitchSlider.value);
      const heading = parseFloat(headingSlider.value);
      const alt = this._altSliderToMeters(parseFloat(altSlider.value));
      this._setCameraOrientation(heading, pitch, alt);
    };

    pitchSlider.addEventListener('input', onSliderInput);
    headingSlider.addEventListener('input', onSliderInput);
    altSlider.addEventListener('input', onSliderInput);

    // — 預設視角按鈕 —
    panel.querySelectorAll('.cam-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pitch = parseFloat(btn.dataset.pitch);
        const heading = parseFloat(btn.dataset.heading);
        this._setCameraOrientation(heading, pitch, null);
      });
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(42,82,152,0.7)'; btn.style.color = '#fff'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(30,30,60,0.8)'; btn.style.color = '#aab'; });
    });

    // — 重置按鈕 —
    document.getElementById('cam-reset-btn').addEventListener('click', () => {
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(120.5, 23.5, 800000),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-45), roll: 0 }
      });
    });
    const resetBtn = document.getElementById('cam-reset-btn');
    resetBtn.addEventListener('mouseenter', () => { resetBtn.style.background = 'rgba(42,82,152,0.7)'; resetBtn.style.color = '#fff'; });
    resetBtn.addEventListener('mouseleave', () => { resetBtn.style.background = 'rgba(30,30,60,0.8)'; resetBtn.style.color = '#aab'; });

    // — 啟動雙向同步 —
    this._syncCameraToSliders();
  }

  /**
   * 高度滑桿值（0~100）轉換為公尺（對數刻度：1km ~ 2000km）
   */
  _altSliderToMeters(val) {
    // 0 → 1km, 100 → 2000km (對數刻度)
    const minLog = Math.log(1000);        // 1 km
    const maxLog = Math.log(2000000);     // 2000 km
    return Math.exp(minLog + (val / 100) * (maxLog - minLog));
  }

  /**
   * 公尺轉換為高度滑桿值（0~100）
   */
  _metersToAltSlider(meters) {
    const minLog = Math.log(1000);
    const maxLog = Math.log(2000000);
    const clamped = Math.max(1000, Math.min(2000000, meters));
    return ((Math.log(clamped) - minLog) / (maxLog - minLog)) * 100;
  }

  /**
   * 格式化高度顯示文字
   */
  _formatAltitude(meters) {
    if (meters >= 1000) {
      return (meters / 1000).toFixed(0) + ' km';
    }
    return meters.toFixed(0) + ' m';
  }

  /**
   * 透過滑桿值設定鏡頭方向
   * @param {number} headingDeg - 方位角（度）
   * @param {number} pitchDeg - 傾角（度，負值）
   * @param {number|null} altMeters - 高度（公尺），null 表示保持現有高度
   */
  _setCameraOrientation(headingDeg, pitchDeg, altMeters) {
    if (!this.viewer) return;

    const camera = this.viewer.camera;
    const currentPos = camera.positionCartographic;

    const alt = altMeters !== null ? altMeters : currentPos.height;

    camera.setView({
      destination: Cesium.Cartesian3.fromRadians(
        currentPos.longitude,
        currentPos.latitude,
        alt
      ),
      orientation: {
        heading: Cesium.Math.toRadians(headingDeg),
        pitch: Cesium.Math.toRadians(pitchDeg),
        roll: 0
      }
    });

    // 更新顯示值
    this._updateCameraDisplayValues(headingDeg, pitchDeg, alt);
  }

  /**
   * 更新面板上的數值顯示
   */
  _updateCameraDisplayValues(headingDeg, pitchDeg, altMeters) {
    const pitchVal = document.getElementById('cam-pitch-val');
    const headingVal = document.getElementById('cam-heading-val');
    const altVal = document.getElementById('cam-alt-val');

    if (pitchVal) pitchVal.textContent = Math.round(pitchDeg) + '°';
    if (headingVal) headingVal.textContent = Math.round(headingDeg) + '°';
    if (altVal) altVal.textContent = this._formatAltitude(altMeters);
  }

  /**
   * 雙向同步：滑鼠操作鏡頭時，滑桿數值跟著更新
   */
  _syncCameraToSliders() {
    if (!this.viewer) return;

    // 使用 postRender 事件監聽鏡頭變化
    this.viewer.scene.postRender.addEventListener(() => {
      const panel = document.getElementById('cesium-camera-panel');
      if (!panel || panel.style.display === 'none') return;

      const camera = this.viewer.camera;
      const headingDeg = Cesium.Math.toDegrees(camera.heading);
      const pitchDeg = Cesium.Math.toDegrees(camera.pitch);
      const altMeters = camera.positionCartographic.height;

      const pitchSlider = document.getElementById('cam-pitch');
      const headingSlider = document.getElementById('cam-heading');
      const altSlider = document.getElementById('cam-alt');

      // 僅在滑桿未被拖動時才更新（避免衝突）
      if (pitchSlider && document.activeElement !== pitchSlider) {
        pitchSlider.value = Math.max(-90, Math.min(0, Math.round(pitchDeg)));
      }
      if (headingSlider && document.activeElement !== headingSlider) {
        headingSlider.value = Math.round(((headingDeg % 360) + 360) % 360);
      }
      if (altSlider && document.activeElement !== altSlider) {
        altSlider.value = this._metersToAltSlider(altMeters);
      }

      this._updateCameraDisplayValues(
        ((headingDeg % 360) + 360) % 360,
        Math.max(-90, Math.min(0, pitchDeg)),
        altMeters
      );
    });
  }

  // ==================== 飛行俯瞰導覽 ====================

  /**
   * 按航點序列飛行
   */
  startFlyover(waypoints) {
    if (!this.viewer || !waypoints || waypoints.length === 0) return;

    let index = 0;
    const flyNext = () => {
      if (index >= waypoints.length) return;
      const wp = waypoints[index++];
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, wp.alt),
        orientation: {
          heading: Cesium.Math.toRadians(wp.heading || 0),
          pitch: Cesium.Math.toRadians(wp.pitch || -30),
          roll: 0
        },
        duration: wp.duration || 3,
        complete: flyNext
      });
    };
    flyNext();
  }

  /**
   * 自動生成繞戰場一圈的航點
   */
  generateBattlefieldFlyover() {
    const positions = this._getAllEntityPositions();
    if (positions.length === 0) {
      console.warn('無資料可供飛行導覽');
      return;
    }

    const center = this._computeCenter(positions);
    const radius = this._computeRadius(positions, center);
    const flyAlt = Math.max(radius * 120000, 50000);
    const waypoints = [];

    for (let angle = 0; angle < 360; angle += 45) {
      const rad = Cesium.Math.toRadians(angle);
      waypoints.push({
        lon: center.lon + (radius * 0.8) * Math.cos(rad),
        lat: center.lat + (radius * 0.8) * Math.sin(rad),
        alt: flyAlt,
        heading: angle + 90,
        pitch: -35,
        duration: 3
      });
    }

    this.startFlyover(waypoints);
  }

  _getAllEntityPositions() {
    const positions = [];
    for (const ds of Object.values(this.layerSources)) {
      if (!ds) continue;
      for (const entity of ds.entities.values) {
        if (entity.position) {
          const pos = entity.position.getValue(Cesium.JulianDate.now());
          if (pos) {
            const carto = Cesium.Cartographic.fromCartesian(pos);
            positions.push({
              lon: Cesium.Math.toDegrees(carto.longitude),
              lat: Cesium.Math.toDegrees(carto.latitude)
            });
          }
        }
      }
    }
    return positions;
  }

  _computeCenter(positions) {
    let sumLon = 0, sumLat = 0;
    for (const p of positions) {
      sumLon += p.lon;
      sumLat += p.lat;
    }
    return { lon: sumLon / positions.length, lat: sumLat / positions.length };
  }

  _computeRadius(positions, center) {
    let maxDist = 0;
    for (const p of positions) {
      const d = Math.sqrt(Math.pow(p.lon - center.lon, 2) + Math.pow(p.lat - center.lat, 2));
      if (d > maxDist) maxDist = d;
    }
    return Math.max(maxDist, 0.5);
  }

  // ==================== 測量工具 ====================

  /**
   * 開始距離測量
   */
  startMeasureDistance() {
    this._clearMeasureHandler();
    this.measureState.active = true;
    this.measureState.type = 'distance';
    this.measureState.points = [];

    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.measureState.handler = handler;

    // 修改游標
    this.viewer.canvas.style.cursor = 'crosshair';

    handler.setInputAction((click) => {
      const ray = this.viewer.camera.getPickRay(click.position);
      const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      if (!cartesian) return;

      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      this.measureState.points.push(carto);

      // 添加標記點
      const pointEntity = this.viewer.entities.add({
        position: cartesian,
        point: {
          pixelSize: 8,
          color: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      this.measureState.entities.push(pointEntity);

      // 如果有兩個以上的點，畫線並標示距離
      if (this.measureState.points.length >= 2) {
        const pts = this.measureState.points;
        const prev = pts[pts.length - 2];
        const curr = pts[pts.length - 1];

        // 計算大圓距離
        const geodesic = new Cesium.EllipsoidGeodesic(prev, curr);
        const distMeters = geodesic.surfaceDistance;

        // 畫線段
        const lineEntity = this.viewer.entities.add({
          polyline: {
            positions: [
              Cesium.Cartesian3.fromRadians(prev.longitude, prev.latitude),
              Cesium.Cartesian3.fromRadians(curr.longitude, curr.latitude)
            ],
            width: 3,
            material: Cesium.Color.YELLOW,
            clampToGround: true
          }
        });
        this.measureState.entities.push(lineEntity);

        // 中點加距離標籤
        const midLon = (prev.longitude + curr.longitude) / 2;
        const midLat = (prev.latitude + curr.latitude) / 2;
        const distText = distMeters > 1000
          ? (distMeters / 1000).toFixed(2) + ' km'
          : distMeters.toFixed(0) + ' m';

        const labelEntity = this.viewer.entities.add({
          position: Cesium.Cartesian3.fromRadians(midLon, midLat),
          label: {
            text: distText,
            font: '14px Microsoft JhengHei',
            fillColor: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            showBackground: true,
            backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
            backgroundPadding: new Cesium.Cartesian2(6, 4),
            pixelOffset: new Cesium.Cartesian2(0, -20),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        this.measureState.entities.push(labelEntity);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 右鍵結束測量
    handler.setInputAction(() => {
      this._endMeasure();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  /**
   * 開始面積測量
   */
  startMeasureArea() {
    this._clearMeasureHandler();
    this.measureState.active = true;
    this.measureState.type = 'area';
    this.measureState.points = [];

    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    this.measureState.handler = handler;

    this.viewer.canvas.style.cursor = 'crosshair';

    handler.setInputAction((click) => {
      const ray = this.viewer.camera.getPickRay(click.position);
      const cartesian = this.viewer.scene.globe.pick(ray, this.viewer.scene);
      if (!cartesian) return;

      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      this.measureState.points.push(carto);

      // 添加標記點
      const pointEntity = this.viewer.entities.add({
        position: cartesian,
        point: {
          pixelSize: 8,
          color: Cesium.Color.CYAN,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      this.measureState.entities.push(pointEntity);

      // 3 個以上的點顯示多邊形
      if (this.measureState.points.length >= 3) {
        // 移除舊的多邊形
        const oldPoly = this.measureState.entities.find(e => e._cesiumMeasurePolygon);
        if (oldPoly) {
          this.viewer.entities.remove(oldPoly);
          this.measureState.entities = this.measureState.entities.filter(e => e !== oldPoly);
        }

        const positions = this.measureState.points.map(p =>
          Cesium.Cartesian3.fromRadians(p.longitude, p.latitude)
        );

        const polyEntity = this.viewer.entities.add({
          polygon: {
            hierarchy: positions,
            material: new Cesium.Color(0, 1, 1, 0.3),
            outline: true,
            outlineColor: Cesium.Color.CYAN,
            outlineWidth: 2
          }
        });
        polyEntity._cesiumMeasurePolygon = true;
        this.measureState.entities.push(polyEntity);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // 右鍵結束並計算面積
    handler.setInputAction(() => {
      if (this.measureState.points.length >= 3) {
        // 計算球面面積（簡易方法）
        const pts = this.measureState.points;
        const positions = pts.map(p => Cesium.Cartesian3.fromRadians(p.longitude, p.latitude));

        // 使用 CoplanarPolygonGeometry 計算面積
        let area = 0;
        const R = 6371000; // 地球半徑
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          area += pts[i].longitude * pts[j].latitude;
          area -= pts[j].longitude * pts[i].latitude;
        }
        area = Math.abs(area / 2) * R * R;

        const areaText = area > 1000000
          ? (area / 1000000).toFixed(2) + ' km²'
          : area.toFixed(0) + ' m²';

        // 中心標籤
        let sumLon = 0, sumLat = 0;
        for (const p of pts) { sumLon += p.longitude; sumLat += p.latitude; }
        const centerLon = sumLon / pts.length;
        const centerLat = sumLat / pts.length;

        const labelEntity = this.viewer.entities.add({
          position: Cesium.Cartesian3.fromRadians(centerLon, centerLat),
          label: {
            text: '面積: ' + areaText,
            font: '14px Microsoft JhengHei',
            fillColor: Cesium.Color.CYAN,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            showBackground: true,
            backgroundColor: new Cesium.Color(0, 0, 0, 0.7),
            backgroundPadding: new Cesium.Cartesian2(6, 4),
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
        this.measureState.entities.push(labelEntity);
      }
      this._endMeasure();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  _endMeasure() {
    this._clearMeasureHandler();
    this.measureState.active = false;
    this.viewer.canvas.style.cursor = 'default';
  }

  _clearMeasureHandler() {
    if (this.measureState.handler) {
      this.measureState.handler.destroy();
      this.measureState.handler = null;
    }
  }

  /**
   * 清除所有測量標記
   */
  clearMeasurements() {
    this._endMeasure();
    for (const entity of this.measureState.entities) {
      this.viewer.entities.remove(entity);
    }
    this.measureState.entities = [];
    this.measureState.points = [];
  }

  // ==================== 3D 飛彈動畫 ====================

  /**
   * 設定飛彈飛行動畫
   */
  _setupAnimation(wtaAnimationData) {
    if (!wtaAnimationData || !wtaAnimationData.wta_results) return;

    // 停止舊動畫
    this._stopAnimation();

    const weaponColors = wtaAnimationData.weapon_colors || {};

    // 按波次排序
    const sorted = [...wtaAnimationData.wta_results].sort((a, b) => {
      const wA = parseInt((a.attack_wave || '').replace(/[^0-9]/g, '')) || 0;
      const wB = parseInt((b.attack_wave || '').replace(/[^0-9]/g, '')) || 0;
      if (wA !== wB) return wA - wB;
      return (a.launched_time || '').localeCompare(b.launched_time || '');
    });

    let currentWave = null;
    let waveStart = 0;

    this.animationState.lines = sorted.map(r => {
      if (r.attack_wave !== currentWave) {
        if (currentWave !== null) waveStart += WAVE_INTERVAL;
        currentWave = r.attack_wave;
      }

      // 找武器顏色
      let color = DEFAULT_WEAPON_COLOR;
      for (const key in weaponColors) {
        if (r.weapon && r.weapon.indexOf(key) >= 0) {
          color = weaponColors[key];
          break;
        }
      }

      return {
        startTime: waveStart,
        endTime: waveStart + MISSILE_FLIGHT_TIME,
        startLat: r.roc_location[0],
        startLon: r.roc_location[1],
        endLat: r.enemy_location[0],
        endLon: r.enemy_location[1],
        color,
        wave: r.attack_wave,
        weapon: r.weapon,
        trailEntity: null,
        headEntity: null,
        _currentPositions: null,
        _currentHeadPositions: null,
        completed: false
      };
    });

    this.animationState.totalDuration = this.animationState.lines.length > 0
      ? this.animationState.lines[this.animationState.lines.length - 1].endTime
      : 0;

    this.animationState.currentTime = 0;
    this.animationState.isPlaying = false;

    // 建立動畫控制器 UI
    this._createAnimationController();
  }

  /**
   * 建立動畫控制器 UI
   */
  _createAnimationController() {
    // 移除舊的
    const old = document.getElementById('cesium-animation-controller');
    if (old) old.remove();

    const ctrl = document.createElement('div');
    ctrl.id = 'cesium-animation-controller';
    ctrl.style.cssText = 'position:absolute;bottom:35px;left:10px;z-index:999;background:rgba(10,10,26,0.9);padding:12px 16px;border-radius:10px;color:#ccd;font-family:"Microsoft JhengHei",sans-serif;font-size:13px;box-shadow:0 2px 12px rgba(0,0,0,0.5);border:1px solid rgba(100,100,180,0.2);min-width:260px;';

    ctrl.innerHTML = `
      <div style="margin-bottom:8px;font-weight:700;color:#7eb8ff;">🎯 飛彈動畫</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;">
        <button id="cesium-anim-play" style="padding:4px 12px;border:none;border-radius:5px;background:#2a5298;color:white;cursor:pointer;font-size:13px;">▶ 播放</button>
        <button id="cesium-anim-pause" style="padding:4px 12px;border:none;border-radius:5px;background:#555;color:white;cursor:pointer;font-size:13px;">⏸ 暫停</button>
        <button id="cesium-anim-reset" style="padding:4px 12px;border:none;border-radius:5px;background:#555;color:white;cursor:pointer;font-size:13px;">⟲ 重播</button>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:8px;">
        <button class="cesium-speed-btn" data-speed="1" style="padding:2px 10px;border:1px solid #555;border-radius:4px;background:transparent;color:#aab;cursor:pointer;font-size:12px;">1x</button>
        <button class="cesium-speed-btn" data-speed="2" style="padding:2px 10px;border:1px solid #4a9eff;border-radius:4px;background:rgba(74,158,255,0.2);color:#4a9eff;cursor:pointer;font-size:12px;">2x</button>
        <button class="cesium-speed-btn" data-speed="3" style="padding:2px 10px;border:1px solid #555;border-radius:4px;background:transparent;color:#aab;cursor:pointer;font-size:12px;">3x</button>
      </div>
      <div style="background:rgba(255,255,255,0.1);border-radius:4px;height:6px;cursor:pointer;position:relative;" id="cesium-anim-progress">
        <div id="cesium-anim-progress-fill" style="background:#4a9eff;height:100%;border-radius:4px;width:0%;transition:width 0.1s;"></div>
      </div>
    `;

    const container = document.getElementById('cesium-container');
    if (container) container.appendChild(ctrl);

    // 事件綁定
    document.getElementById('cesium-anim-play').addEventListener('click', () => this._playAnimation());
    document.getElementById('cesium-anim-pause').addEventListener('click', () => this._pauseAnimation());
    document.getElementById('cesium-anim-reset').addEventListener('click', () => this._resetAnimation());

    ctrl.querySelectorAll('.cesium-speed-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const speed = parseInt(e.target.dataset.speed);
        this.animationState.speed = speed;
        ctrl.querySelectorAll('.cesium-speed-btn').forEach(b => {
          b.style.borderColor = '#555';
          b.style.background = 'transparent';
          b.style.color = '#aab';
        });
        e.target.style.borderColor = '#4a9eff';
        e.target.style.background = 'rgba(74,158,255,0.2)';
        e.target.style.color = '#4a9eff';
      });
    });

    // 進度條點擊
    document.getElementById('cesium-anim-progress').addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      this.animationState.currentTime = pct * this.animationState.totalDuration;
      this._updateAnimationFrame(this.animationState.currentTime);
    });
  }

  _playAnimation() {
    if (this.animationState.isPlaying) return;
    this.animationState.isPlaying = true;
    this.animationState.lastFrameTime = performance.now();
    this._animationLoop();
  }

  _pauseAnimation() {
    this.animationState.isPlaying = false;
    if (this.animationState.animFrameId) {
      cancelAnimationFrame(this.animationState.animFrameId);
      this.animationState.animFrameId = null;
    }
  }

  _resetAnimation() {
    this._pauseAnimation();
    this.animationState.currentTime = 0;

    // 清除所有動畫 entity
    for (const line of this.animationState.lines) {
      if (line.trailEntity) {
        this.layerSources.wta.entities.remove(line.trailEntity);
        line.trailEntity = null;
      }
      if (line.headEntity) {
        this.layerSources.wta.entities.remove(line.headEntity);
        line.headEntity = null;
      }
      line._currentPositions = null;
      line._currentHeadPositions = null;
      line.completed = false;
    }

    // 更新進度條
    const fill = document.getElementById('cesium-anim-progress-fill');
    if (fill) fill.style.width = '0%';
  }

  _stopAnimation() {
    this._pauseAnimation();
    this.animationState.lines = [];
    this.animationState.currentTime = 0;
    this.animationState.totalDuration = 0;

    const ctrl = document.getElementById('cesium-animation-controller');
    if (ctrl) ctrl.remove();
  }

  _animationLoop() {
    if (!this.animationState.isPlaying) return;

    const now = performance.now();
    const delta = (now - this.animationState.lastFrameTime) * this.animationState.speed;
    this.animationState.lastFrameTime = now;
    this.animationState.currentTime += delta;

    if (this.animationState.currentTime >= this.animationState.totalDuration) {
      this.animationState.currentTime = this.animationState.totalDuration;
      this._updateAnimationFrame(this.animationState.currentTime);
      this._pauseAnimation();
      return;
    }

    this._updateAnimationFrame(this.animationState.currentTime);
    this.animationState.animFrameId = requestAnimationFrame(() => this._animationLoop());
  }

  _updateAnimationFrame(currentTime) {
    const ds = this.layerSources.wta;
    if (!ds) return;

    // 更新進度條
    const pct = this.animationState.totalDuration > 0
      ? (currentTime / this.animationState.totalDuration) * 100
      : 0;
    const fill = document.getElementById('cesium-anim-progress-fill');
    if (fill) fill.style.width = pct + '%';

    for (const line of this.animationState.lines) {
      if (currentTime < line.startTime) continue;

      if (currentTime >= line.endTime) {
        // 完成：將尾跡和箭頭設為最終位置，entity 不動（無縫銜接，不閃爍）
        if (!line.completed) {
          line.completed = true;
          const fullPositions = [];
          for (let i = 0; i <= ATTACK_ARC_SEGMENTS; i++) {
            const t = i / ATTACK_ARC_SEGMENTS;
            const lat = line.startLat + (line.endLat - line.startLat) * t;
            const lon = line.startLon + (line.endLon - line.startLon) * t;
            const alt = MISSILE_3D_MAX_ALTITUDE * 4 * t * (1 - t);
            fullPositions.push(Cesium.Cartesian3.fromDegrees(lon, lat, alt));
          }
          // 尾跡覆蓋全程（確保連到目標），箭頭段疊在最後 15%
          const splitIdx = Math.max(1, Math.floor(fullPositions.length * 0.85));
          line._currentPositions = fullPositions;
          line._currentHeadPositions = fullPositions.slice(splitIdx);
        }
        continue;
      }

      // 進行中：計算進度
      const progress = (currentTime - line.startTime) / (line.endTime - line.startTime);
      this._animateMissile(line, progress, ds);
    }
  }

  _animateMissile(line, progress, ds) {
    const t = progress;

    // 計算完整尾跡到當前位置的所有採樣點
    const segments = Math.max(1, Math.floor(t * ATTACK_ARC_SEGMENTS));
    const allPositions = [];
    for (let i = 0; i <= segments; i++) {
      const tt = i / ATTACK_ARC_SEGMENTS;
      const tlat = line.startLat + (line.endLat - line.startLat) * tt;
      const tlon = line.startLon + (line.endLon - line.startLon) * tt;
      const talt = MISSILE_3D_MAX_ALTITUDE * 4 * tt * (1 - tt);
      allPositions.push(Cesium.Cartesian3.fromDegrees(tlon, tlat, talt));
    }
    // 加入精確的飛彈頭位置
    const headLat = line.startLat + (line.endLat - line.startLat) * t;
    const headLon = line.startLon + (line.endLon - line.startLon) * t;
    const headAlt = MISSILE_3D_MAX_ALTITUDE * 4 * t * (1 - t);
    allPositions.push(Cesium.Cartesian3.fromDegrees(headLon, headLat, headAlt));

    // 尾跡覆蓋全程（確保線條連到目標），箭頭段疊在最後 15% 上方
    const splitIdx = Math.max(1, Math.floor(allPositions.length * 0.85));
    line._currentPositions = allPositions;
    line._currentHeadPositions = allPositions.slice(splitIdx);

    if (!line.trailEntity) {
      // 尾跡：實色粗線（不漸縮，全程等寬）
      line.trailEntity = ds.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => line._currentPositions, false),
          width: 6,
          material: Cesium.Color.fromCssColorString(line.color)
        }
      });

      // 箭頭段：短段 PolylineArrow（箭頭佔比大，清晰可見）
      line.headEntity = ds.entities.add({
        polyline: {
          positions: new Cesium.CallbackProperty(() => line._currentHeadPositions, false),
          width: 24,
          material: new Cesium.PolylineArrowMaterialProperty(
            Cesium.Color.fromCssColorString(line.color)
          )
        }
      });
    }
  }

  _drawCompletedArc(line, ds) {
    if (line.trailEntity) {
      ds.entities.remove(line.trailEntity);
      line.trailEntity = null;
    }
    if (line.headEntity) {
      ds.entities.remove(line.headEntity);
      line.headEntity = null;
    }

    const positions = [];
    for (let i = 0; i <= ATTACK_ARC_SEGMENTS; i++) {
      const t = i / ATTACK_ARC_SEGMENTS;
      const lat = line.startLat + (line.endLat - line.startLat) * t;
      const lon = line.startLon + (line.endLon - line.startLon) * t;
      const alt = MISSILE_3D_MAX_ALTITUDE * 4 * t * (1 - t);
      positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, alt));
    }

    line.trailEntity = ds.entities.add({
      polyline: {
        positions: positions,
        width: 22,
        material: new Cesium.PolylineArrowMaterialProperty(
          Cesium.Color.fromCssColorString(line.color).withAlpha(0.7)
        )
      }
    });

    // 終點箭頭（取弧線末段方向，畫一段短箭頭指向目標）
    const tApproach = 0.92;
    const approachLat = line.startLat + (line.endLat - line.startLat) * tApproach;
    const approachLon = line.startLon + (line.endLon - line.startLon) * tApproach;
    const approachAlt = MISSILE_3D_MAX_ALTITUDE * 4 * tApproach * (1 - tApproach);
    line.headEntity = ds.entities.add({
      polyline: {
        positions: [
          Cesium.Cartesian3.fromDegrees(approachLon, approachLat, approachAlt),
          Cesium.Cartesian3.fromDegrees(line.endLon, line.endLat, 0)
        ],
        width: 22,
        material: new Cesium.PolylineArrowMaterialProperty(
          Cesium.Color.fromCssColorString(line.color)
        ),
        clampToGround: false
      }
    });
  }
}
