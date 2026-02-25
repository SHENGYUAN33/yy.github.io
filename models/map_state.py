"""
地圖狀態管理模組
用途：管理地圖的持久化狀態，包括船艦標記、攻擊線、航跡等
支援多圖層管理，不同功能可獨立管理各自的圖層
"""
import folium
from branca.element import Element
import os
import math
import json
import logging
from config import (
    MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, MAP_DEFAULT_TILES,
    MIL_SYMBOL_SIZE, MIL_SYMBOL_RETRY_MAX, MIL_SYMBOL_RETRY_INTERVAL,
    DIAMOND_MIN_SIZE, ICON_SIZE, ICON_ANCHOR,
    FACTION_COLORS, ATTACK_LINE_WEIGHT_DEFAULT,
    ARROW_ICON_SIZE, ARROW_ICON_ANCHOR,
    MISSILE_FLIGHT_TIME, WAVE_INTERVAL,
    MISSILE_TRAIL_WEIGHT, ATTACK_LINE_WEIGHT_WTA
)

# ==================== 圖層名稱常數 ====================
LAYER_SCENARIO = 'scenario'   # 場景圖層（船艦標記）
LAYER_WTA = 'wta'             # 武器分派圖層（攻擊線 + WTA 標記）
LAYER_TRACKS = 'tracks'       # 航跡圖層（航跡線段 + 航跡標記）

# 圖層顯示名稱映射（用於 Leaflet LayerControl）
LAYER_DISPLAY_NAMES = {
    LAYER_SCENARIO: '場景船艦',
    LAYER_WTA: '武器分派',
    LAYER_TRACKS: '航跡',
}

logger = logging.getLogger(__name__)


class MapState:
    """
    地圖狀態類別
    用途：管理單一會話/分頁的地圖狀態，包含所有標記、線條、航跡和動畫數據
    """

    def __init__(self):
        """
        初始化地圖狀態
        創建空的標記、線條、航跡和動畫數據列表
        """
        self.markers = []  # 所有標記（船艦位置）
        self.lines = []    # 所有攻擊線（武器分派）
        self.tracks = []  # 所有航跡線段（船艦移動軌跡）
        self.wta_animation_data = None  # 動畫控制器數據（持久化）

    def add_marker(self, location, popup, color, icon='ship', shape='circle', layer=None):
        """
        添加船艦標記到地圖

        參數:
            location: 座標 [緯度, 經度]
            popup: 彈出視窗文字內容
            color: 標記顏色
            icon: 圖標名稱（保留用於相容性）
            shape: 形狀類型 ('circle'=圓形代表友方, 'diamond'=菱形代表敵方)
            layer: 所屬圖層名稱（例如 'scenario', 'wta', 'tracks'）
        """
        marker_data = {
            'location': location,
            'popup': popup,
            'color': color,
            'icon': icon,
            'shape': shape,
            'layer': layer
        }
        self.markers.append(marker_data)

    def add_line(self, start_location, end_location, color, popup, weight=8, dash_array=None, layer=None):
        """
        添加攻擊線到地圖（用於顯示武器分派）

        參數:
            start_location: 起點座標 [緯度, 經度]（我方船艦位置）
            end_location: 終點座標 [緯度, 經度]（敵方船艦位置）
            color: 線條顏色（根據飛彈類型）
            popup: 彈出視窗文字（顯示攻擊波次、武器類型等）
            weight: 線條粗細
            dash_array: 虛線樣式
            layer: 所屬圖層名稱
        """
        line_data = {
            'start': start_location,
            'end': end_location,
            'color': color,
            'popup': popup,
            'weight': weight,
            'dash_array': dash_array,
            'layer': layer
        }
        self.lines.append(line_data)

    def add_track(self, track_data, layer=None):
        """
        添加航跡線段到地圖

        參數:
            track_data: 航跡數據字典（包含 type, ship_name, coordinates, color, weight）
            layer: 所屬圖層名稱
        """
        track_data['layer'] = layer
        self.tracks.append(track_data)

    def clear(self):
        """
        清空所有地圖狀態
        用途：重置地圖時清除所有標記、線條、航跡和動畫
        """
        self.markers = []
        self.lines = []
        self.tracks = []
        self.wta_animation_data = None

    def clear_layer(self, layer_name):
        """
        清除指定圖層的所有元素

        參數:
            layer_name: 圖層名稱（例如 'scenario', 'wta', 'tracks'）
        """
        self.markers = [m for m in self.markers if m.get('layer') != layer_name]
        self.lines = [l for l in self.lines if l.get('layer') != layer_name]
        self.tracks = [t for t in self.tracks if t.get('layer') != layer_name]

        # 清除 WTA 圖層時，同時清除動畫數據
        if layer_name == LAYER_WTA:
            self.wta_animation_data = None

    def get_layers(self):
        """
        取得目前有內容的圖層清單

        返回:
            list: 圖層名稱列表
        """
        layers = set()
        for m in self.markers:
            if m.get('layer'):
                layers.add(m['layer'])
        for l in self.lines:
            if l.get('layer'):
                layers.add(l['layer'])
        for t in self.tracks:
            if t.get('layer'):
                layers.add(t['layer'])
        if self.wta_animation_data:
            layers.add(LAYER_WTA)
        return list(layers)

    def to_json(self):
        """
        序列化地圖狀態為 JSON 可序列化字典
        用途：供前端 3D Cesium 渲染器使用

        返回:
            dict: 包含 markers, lines, tracks, wta_animation_data, layers
        """
        return {
            'markers': self.markers,
            'lines': self.lines,
            'tracks': self.tracks,
            'wta_animation_data': self.wta_animation_data,
            'layers': self.get_layers()
        }

    def create_map(self, wta_animation_data=None):
        """
        創建包含所有歷史內容的 Folium 地圖（使用本地 MIL-STD-2525 軍事符號）

        參數:
            wta_animation_data: 武器分派動畫數據，格式: {
                'wta_results': [...],  # 武器分派結果列表
                'weapon_colors': {...}  # 飛彈顏色映射
            }

        返回:
            folium.Map: 完整的地圖物件
        """
        # 創建基礎地圖（台灣海峽中心）
        m = folium.Map(
            location=MAP_DEFAULT_CENTER,
            zoom_start=MAP_DEFAULT_ZOOM,
            tiles=MAP_DEFAULT_TILES
        )

        # 注入自訂底圖圖層（從 config.json 讀取）
        try:
            from services import load_config
            custom_layers = load_config().get('custom_layers', [])
            for cl in custom_layers:
                if cl.get('enabled') and cl.get('url_template'):
                    folium.TileLayer(
                        tiles=cl['url_template'],
                        attr=cl.get('attribution', ''),
                        name=cl.get('name', '自訂圖層'),
                        max_zoom=cl.get('max_zoom', 18),
                        opacity=cl.get('opacity', 1.0),
                        overlay=True,
                        control=True
                    ).add_to(m)
        except Exception as e:
            logger.warning("載入自訂圖層失敗: %s", e)

        # 建立圖層分組（用於 Leaflet LayerControl 切換顯示）
        active_layers = self.get_layers()
        layer_groups = {}
        for layer_key in active_layers:
            display_name = LAYER_DISPLAY_NAMES.get(layer_key, layer_key)
            fg = folium.FeatureGroup(name=display_name, show=True)
            fg.add_to(m)
            layer_groups[layer_key] = fg

        def get_target(layer):
            """根據圖層名稱取得對應的 FeatureGroup，無匹配則回傳地圖本身"""
            return layer_groups.get(layer, m)

        # 注入本地 milsymbol 軍事符號庫
        # 用途：讓地圖 HTML 檔案可以離線顯示軍事符號（使用 file:// 協議直接打開）
        ms_code = ''
        try:
            from flask import current_app
            ms_path = os.path.join(current_app.static_folder, 'js', 'milsymbol.js')
            with open(ms_path, 'r', encoding='utf-8') as f:
                ms_code = f.read()
        except Exception as e:
            logger.warning("無法讀取本地 milsymbol.js (%s)，將回退使用 /static/js/milsymbol.js 引用。", e)

        # 將 milsymbol.js 內容內嵌到地圖 HTML 中（確保離線可用）
        milsymbol_tag = f"<script>\n{ms_code}\n</script>\n" if ms_code else '<script src="/static/js/milsymbol.js"></script>\n'

        # 定義全域 JavaScript 函式：繪製軍事符號和調整攻擊線
        common_js = f"""
        <script>
        // 繪製 MIL-STD-2525 軍事符號
        // 參數：sidc=符號識別碼, elementId=HTML元素ID
        window.drawMilSymbol = function(sidc, elementId) {{
            var retryCount = 0;
            var timer = setInterval(function() {{
        if (typeof ms !== 'undefined') {{
            var sym = new ms.Symbol(sidc, {{
                size: {MIL_SYMBOL_SIZE},
                infoFields: false
            }});
            var el = document.getElementById(elementId);
            if (el) {{
                el.style.visibility = 'visible';
                el.innerHTML = '<div style="width:{MIL_SYMBOL_SIZE}px;height:{MIL_SYMBOL_SIZE}px;display:flex;align-items:center;justify-content:center;">'
                             + '<img src="' + sym.toDataURL() + '" style="width:{MIL_SYMBOL_SIZE}px;height:{MIL_SYMBOL_SIZE}px;display:block;" />'
                             + '</div>';
                clearInterval(timer);
            }}
        }}
        retryCount++;
        if (retryCount > {MIL_SYMBOL_RETRY_MAX}) {{
            console.error("milsymbol 載入失敗：請確認 milsymbol.js 是否可用");
            clearInterval(timer);
        }}
            }}, {MIL_SYMBOL_RETRY_INTERVAL});
        }};

        // 重新繪製所有帶有 data-sidc 屬性的軍事符號
        // 用途：在 Leaflet 圖層切換後重新渲染被重置的 DivIcon
        window.renderAllMilSymbols = function() {{
            if (typeof ms === 'undefined') return;
            document.querySelectorAll('[data-sidc]').forEach(function(el) {{
                var sidc = el.getAttribute('data-sidc');
                if (!sidc) return;
                var sym = new ms.Symbol(sidc, {{
                    size: {MIL_SYMBOL_SIZE},
                    infoFields: false
                }});
                el.style.visibility = 'visible';
                el.innerHTML = '<div style="width:{MIL_SYMBOL_SIZE}px;height:{MIL_SYMBOL_SIZE}px;display:flex;align-items:center;justify-content:center;">'
                             + '<img src="' + sym.toDataURL() + '" style="width:{MIL_SYMBOL_SIZE}px;height:{MIL_SYMBOL_SIZE}px;display:block;" />'
                             + '</div>';
            }});
        }};

        // 調整攻擊線終點，使箭頭精準指向敵方菱形符號的頂點
        // 用途：避免箭頭與符號重疊，提高視覺清晰度
        window.__adjustAttackLine = function(map, polyline, arrowMarker, startLatLng, endLatLng, diamondSizePx) {{
            try {{
        if (!map || !polyline || !arrowMarker) return;
        var pa = map.latLngToLayerPoint(startLatLng);
        var pt = map.latLngToLayerPoint(endLatLng);

        var dx = pa.x - pt.x;
        var dy = pa.y - pt.y;

        var r = Math.max({DIAMOND_MIN_SIZE}, (diamondSizePx || {MIL_SYMBOL_SIZE}) / 2);

        // 取「我方方向」的頂點（從我方射向敵方，最先碰到的菱形頂點）
        var vx = 0, vy = 0;
        if (Math.abs(dx) >= Math.abs(dy)) {{
            vx = (dx > 0) ? r : -r;
            vy = 0;
        }} else {{
            vx = 0;
            vy = (dy > 0) ? r : -r;
        }}

        var pv = L.point(pt.x + vx, pt.y + vy);
        var vLatLng = map.layerPointToLatLng(pv);

        polyline.setLatLngs([startLatLng, vLatLng]);
        arrowMarker.setLatLng(vLatLng);
            }} catch (e) {{
        console.error('adjustAttackLine failed', e);
            }}
        }};
        </script>
        """

        # 覆寫 Leaflet 預設 DivIcon 樣式（移除白色背景與邊框）
        divicon_css = """
        <style>
        .leaflet-div-icon {
            background: transparent !important;
            border: none !important;
        }
        .leaflet-tooltip {
            pointer-events: none !important;
        }
        </style>
        """

        # postMessage 監聽器（供父視窗搜尋船艦後飛到指定座標）
        postmessage_js = """
        <script>
        window.addEventListener('message', function(event) {
            if (!event.data || event.data.type !== 'flyTo') return;
            var maps = document.querySelectorAll('.folium-map');
            if (!maps.length) return;
            var map = window[maps[0].id];
            if (map) map.flyTo([event.data.lat, event.data.lon], event.data.zoom || 10, {duration: 1.5});
        });
        </script>
        """

        # 將 JavaScript 與 CSS 注入地圖 HTML
        header_js = milsymbol_tag + divicon_css + common_js + postmessage_js
        m.get_root().header.add_child(Element(header_js))

        # 添加所有船艦標記（使用 MIL-STD-2525 符號）
        marker_id_counter = 0
        for marker_data in self.markers:
            shape = marker_data.get('shape', 'circle')
            marker_id = f"mil_marker_{marker_id_counter}"
            marker_id_counter += 1

            # 根據陣營選擇 SIDC (Symbol Identification Code)
            if shape == 'circle':
                # 友方水面艦艇（藍色圓形）
                sidc = "SFS-------X----"
            elif shape == 'diamond':
                # 敵方水面艦艇（紅色菱形）
                sidc = "SHS-------X----"
            else:
                # 預設：友方水面艦艇
                sidc = "SFS-------X----"

            # 建立 Marker，使用 DivIcon 放置軍事符號
            folium.Marker(
                location=marker_data['location'],
                icon=folium.DivIcon(
                    html=f'<div id="{marker_id}" data-sidc="{sidc}" style="visibility:hidden;">●</div>',
                    icon_size=ICON_SIZE,
                    icon_anchor=ICON_ANCHOR
                ),
                popup=marker_data['popup']
            ).add_to(get_target(marker_data.get('layer')))

            # 立即執行渲染腳本
            script = f'<script>window.drawMilSymbol("{sidc}", "{marker_id}");</script>'
            m.get_root().html.add_child(Element(script))

        # 繪製航跡線段（在攻擊線之前）
        if hasattr(self, 'tracks') and self.tracks:
            logger.info("正在繪製 %s 條航跡線段...", len(self.tracks))
            for track in self.tracks:
                coordinates = track['coordinates']
                if len(coordinates) < 2:
                    logger.warning("跳過座標點不足的航跡: %s", track.get('ship_name', '未知'))
                    continue

                ship_name = track.get('ship_name', '未知船艦')
                track_type = track.get('type', 'unknown')

                # 繪製航跡線段
                folium.PolyLine(
                    locations=coordinates,
                    color=track['color'],
                    weight=track['weight'],  # 粗度
                    opacity=1,  # 透明度
                    popup=f"<b>{ship_name}</b><br>陣營: {'敵方' if track_type == 'enemy' else '我方'}<br>航跡點數: {len(coordinates)}"
                ).add_to(get_target(track.get('layer')))

                # 在航跡線段的最後一個點（當前位置）添加標記
                last_coord = coordinates[-1]

                # 動態計算 Tooltip 顯示方向（避免遮擋軌跡）
                tooltip_direction = 'right'  # 預設向右
                offset_x, offset_y = 20, 0   # 預設偏移

                if len(coordinates) >= 2:
                    # 計算軌跡方向（從倒數第二個點到最後一個點）
                    prev_coord = coordinates[-2]
                    dx = last_coord[1] - prev_coord[1]  # 經度差（東西方向）
                    dy = last_coord[0] - prev_coord[0]  # 緯度差（南北方向）

                    # 根據方向角度決定 Tooltip 位置
                    angle = math.atan2(dy, dx) * 180 / math.pi  # 轉換為角度

                    # 將軌跡方向分為 8 個區域，選擇最佳顯示方向
                    if -22.5 <= angle < 22.5:  # 向東
                        tooltip_direction = 'top'
                        offset_x, offset_y = 0, -20
                    elif 22.5 <= angle < 67.5:  # 東北
                        tooltip_direction = 'left'
                        offset_x, offset_y = -20, -10
                    elif 67.5 <= angle < 112.5:  # 向北
                        tooltip_direction = 'left'
                        offset_x, offset_y = -20, 0
                    elif 112.5 <= angle < 157.5:  # 西北
                        tooltip_direction = 'left'
                        offset_x, offset_y = -20, 10
                    elif angle >= 157.5 or angle < -157.5:  # 向西
                        tooltip_direction = 'bottom'
                        offset_x, offset_y = 0, 20
                    elif -157.5 <= angle < -112.5:  # 西南
                        tooltip_direction = 'right'
                        offset_x, offset_y = 20, 10
                    elif -112.5 <= angle < -67.5:  # 向南
                        tooltip_direction = 'right'
                        offset_x, offset_y = 20, 0
                    elif -67.5 <= angle < -22.5:  # 東南
                        tooltip_direction = 'right'
                        offset_x, offset_y = 20, -10

                # 根據陣營選擇顏色和 SIDC
                if track_type == 'enemy':
                    sidc = "SHS-------X----"  # 敵方水面艦艇
                    marker_color = FACTION_COLORS['enemy_track']
                elif track_type == 'roc':
                    sidc = "SFS-------X----"  # 友方水面艦艇
                    marker_color = FACTION_COLORS['roc_track']
                else:
                    sidc = "SFS-------X----"
                    marker_color = FACTION_COLORS['unknown_track']

                # 生成唯一的 marker ID
                marker_id = f"track_marker_{marker_id_counter}"
                marker_id_counter += 1

                # 創建標記（使用動態計算的方向和偏移）
                folium.Marker(
                    location=last_coord,
                    icon=folium.DivIcon(
                        html=f'<div id="{marker_id}" data-sidc="{sidc}" style="visibility:hidden;">●</div>',
                        icon_size=ICON_SIZE,
                        icon_anchor=ICON_ANCHOR
                    ),
                    tooltip=folium.Tooltip(
                        text=ship_name,
                        permanent=True,
                        sticky=False,
                        direction=tooltip_direction,
                        offset=(offset_x, offset_y),
                        style=f"""
                            background-color: rgba(255, 255, 255, 0.95);
                            border: 2px solid {marker_color};
                            border-radius: 4px;
                            padding: 4px 8px;
                            font-size: 9px;
                            font-weight: bold;
                            color: {marker_color};
                            box-shadow: 2px 2px 6px rgba(0,0,0,0.3);
                            white-space: nowrap;
                            pointer-events: none;
                        """
                    )
                ).add_to(get_target(track.get('layer')))

                # 渲染軍事符號
                script = f'<script>window.drawMilSymbol("{sidc}", "{marker_id}");</script>'
                m.get_root().html.add_child(Element(script))

        # 取得 WTA 圖層的 JS 變數名稱（用於將攻擊線加入圖層群組）
        wta_group = layer_groups.get(LAYER_WTA)
        wta_layer_js_var = wta_group.get_name() if wta_group else None

        # 繪製靜態攻擊配對線（使用 JavaScript 繪製，帶箭頭）
        if not wta_animation_data or not wta_animation_data.get('wta_results'):
            # 收集所有線條數據
            static_lines_js_data = []

            for line_data in self.lines:
                start = line_data['start']
                end = line_data['end']
                color = line_data['color']
                popup_text = line_data.get('popup', '')
                weight = line_data.get('weight', ATTACK_LINE_WEIGHT_DEFAULT)

                static_lines_js_data.append({
                    'startLat': start[0],
                    'startLon': start[1],
                    'endLat': end[0],
                    'endLon': end[1],
                    'color': color,
                    'weight': weight,
                    'popup': popup_text
                })

            # 生成 JavaScript 代碼來繪製線條和箭頭
            if static_lines_js_data:
                lines_data_json = json.dumps(static_lines_js_data, ensure_ascii=False)

                static_attack_script = f"""
                <style>
                .static-attack-arrow {{
                    background: transparent !important;
                    border: none !important;
                }}
                .static-attack-line {{
                    pointer-events: auto;
                }}
                </style>

                <script>
                (function() {{
                    var staticLinesData = {lines_data_json};
                    var staticLines = [];
                    var staticArrows = [];
                    var wtaLayerJsVar = '{wta_layer_js_var or ""}';

                    function getMap() {{
                        var mapElements = document.querySelectorAll('.folium-map');
                        if (mapElements.length > 0) {{
                            var mapId = mapElements[0].id;
                            return window[mapId];
                        }}
                        return null;
                    }}

                    function drawStaticAttackLines() {{
                        var map = getMap();
                        if (!map) {{
                            setTimeout(drawStaticAttackLines, 100);
                            return;
                        }}
                        var targetLayer = (wtaLayerJsVar && window[wtaLayerJsVar]) ? window[wtaLayerJsVar] : map;

                        console.log('🎯 開始繪製', staticLinesData.length, '條靜態攻擊線...');

                        staticLinesData.forEach(function(lineData, index) {{
                            // 1. 繪製線條（完整長度）
                            var polyline = L.polyline(
                                [[lineData.startLat, lineData.startLon], [lineData.endLat, lineData.endLon]],
                                {{
                                    color: lineData.color,
                                    weight: lineData.weight,
                                    opacity: 0.8,
                                    className: 'static-attack-line'
                                }}
                            ).addTo(targetLayer);

                            if (lineData.popup) {{
                                polyline.bindPopup(lineData.popup);
                            }}

                            staticLines.push(polyline);

                            // 2. 計算箭頭角度
                            var angle = Math.atan2(
                                lineData.endLon - lineData.startLon,
                                lineData.endLat - lineData.startLat
                            ) * 180 / Math.PI;

                            // 3. 創建箭頭（使用 SVG）
                            var arrowSvg = '<svg width="{ARROW_ICON_SIZE[0]}" height="{ARROW_ICON_SIZE[1]}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" ' +
                                          'style="transform: rotate(' + angle + 'deg); transform-origin: center center;">' +
                                          '<path d="M12 2 L20 22 L12 18 L4 22 Z" ' +
                                          'fill="' + lineData.color + '" stroke="white" stroke-width="1.5"/>' +
                                          '</svg>';

                            // 4. 在線條末端添加箭頭
                            var arrowMarker = L.marker([lineData.endLat, lineData.endLon], {{
                                icon: L.divIcon({{
                                    html: arrowSvg,
                                    className: 'static-attack-arrow',
                                    iconSize: {ARROW_ICON_SIZE},
                                    iconAnchor: {ARROW_ICON_ANCHOR}
                                }}),
                                zIndexOffset: 1000
                            }}).addTo(targetLayer);

                            if (lineData.popup) {{
                                arrowMarker.bindPopup(lineData.popup);
                            }}

                            staticArrows.push(arrowMarker);
                        }});

                        console.log('✅ 靜態攻擊線繪製完成:', staticLines.length, '條線,', staticArrows.length, '個箭頭');

                        // 保存到全局變量
                        window.staticAttackLines = staticLines;
                        window.staticAttackArrows = staticArrows;
                    }}

                    // 等待頁面載入完成後執行
                    if (document.readyState === 'loading') {{
                        document.addEventListener('DOMContentLoaded', function() {{
                            setTimeout(drawStaticAttackLines, 500);
                        }});
                    }} else {{
                        setTimeout(drawStaticAttackLines, 500);
                    }}
                }})();
                </script>
                """

                m.get_root().html.add_child(Element(static_attack_script))


        # 武器分派動畫控制器（當動畫開啟時）
        # 如果傳入新的動畫數據，則保存到 MapState
        if wta_animation_data and wta_animation_data.get('wta_results'):
            self.wta_animation_data = wta_animation_data

        # 使用保存的動畫數據（即使沒有傳入新數據，也會顯示之前的動畫控制器）
        if self.wta_animation_data and self.wta_animation_data.get('wta_results'):
            # 準備數據
            wta_results_json = json.dumps(self.wta_animation_data['wta_results'], ensure_ascii=False)
            weapon_colors_json = json.dumps(self.wta_animation_data.get('weapon_colors', {}), ensure_ascii=False)

            # 獲取 map 變數名
            map_name = m.get_name()

            # 創建動畫控制器 HTML
            animation_html = self._create_animation_controller_html(
                wta_results_json,
                weapon_colors_json,
                map_name,
                wta_layer_js_var=wta_layer_js_var
            )

            # 添加到地圖
            m.get_root().html.add_child(Element(animation_html))

        # 添加圖層控制器（Leaflet L.control.layers）
        if layer_groups:
            folium.LayerControl(collapsed=True).add_to(m)

            # 監聽圖層切換事件，重新渲染 milsymbol 軍事符號
            # 原因：Leaflet DivIcon 在圖層重新加入地圖時會重置 innerHTML，
            #       導致已渲染的軍事符號變回 fallback 文字（●）
            redraw_script = """
            <script>
            (function() {
                function setupLayerRedraw() {
                    var mapElements = document.querySelectorAll('.folium-map');
                    if (mapElements.length === 0) { setTimeout(setupLayerRedraw, 200); return; }
                    var map = window[mapElements[0].id];
                    if (!map) { setTimeout(setupLayerRedraw, 200); return; }
                    map.on('overlayadd', function() {
                        setTimeout(window.renderAllMilSymbols, 50);
                    });
                }
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', function() {
                        setTimeout(setupLayerRedraw, 300);
                    });
                } else {
                    setTimeout(setupLayerRedraw, 300);
                }
            })();
            </script>
            """
            m.get_root().html.add_child(Element(redraw_script))

        # 注入 2D 量測工具（距離 / 面積）
        try:
            from services import load_config as _load_cfg
            if _load_cfg().get('enable_measurement', True):
                measure_script = """
                <style>
                .measure-btn {
                    position: absolute; z-index: 1000; right: 10px;
                    background: white; border: 2px solid rgba(0,0,0,0.2); border-radius: 4px;
                    padding: 6px 10px; cursor: pointer; font-size: 14px;
                    box-shadow: 0 1px 5px rgba(0,0,0,0.2);
                }
                .measure-btn:hover { background: #f4f4f4; }
                .measure-btn.active { background: #2196F3; color: white; border-color: #2196F3; }
                #measure-dist-btn { top: 80px; }
                #measure-area-btn { top: 116px; }
                #measure-clear-btn { top: 152px; font-size: 12px; }
                .measure-tooltip {
                    background: rgba(0,0,0,0.7); color: white; padding: 3px 8px;
                    border-radius: 4px; font-size: 12px; white-space: nowrap;
                }
                </style>
                <div id="measure-dist-btn" class="measure-btn" title="距離量測">📏</div>
                <div id="measure-area-btn" class="measure-btn" title="面積量測">📐</div>
                <div id="measure-clear-btn" class="measure-btn" title="清除量測">✖</div>
                <script>
                (function() {
                    function initMeasure() {
                        var mapEls = document.querySelectorAll('.folium-map');
                        if (!mapEls.length) { setTimeout(initMeasure, 300); return; }
                        var map = window[mapEls[0].id];
                        if (!map) { setTimeout(initMeasure, 300); return; }

                        var mode = null;
                        var points = [];
                        var tempMarkers = [];
                        var tempLines = [];
                        var tempPolygon = null;
                        var tooltipLayer = null;
                        var measureGroup = L.layerGroup().addTo(map);

                        var distBtn = document.getElementById('measure-dist-btn');
                        var areaBtn = document.getElementById('measure-area-btn');
                        var clearBtn = document.getElementById('measure-clear-btn');

                        function toRad(d) { return d * Math.PI / 180; }

                        function haversine(a, b) {
                            var R = 6371;
                            var dLat = toRad(b[0]-a[0]), dLon = toRad(b[1]-a[1]);
                            var x = Math.sin(dLat/2)*Math.sin(dLat/2) +
                                    Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*
                                    Math.sin(dLon/2)*Math.sin(dLon/2);
                            return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
                        }

                        function totalDist() {
                            var d = 0;
                            for (var i = 1; i < points.length; i++) d += haversine(points[i-1], points[i]);
                            return d;
                        }

                        function polyArea(pts) {
                            if (pts.length < 3) return 0;
                            var R = 6371;
                            var total = 0;
                            for (var i = 0; i < pts.length; i++) {
                                var j = (i+1) % pts.length;
                                total += toRad(pts[j][1]-pts[i][1]) *
                                         (2 + Math.sin(toRad(pts[i][0])) + Math.sin(toRad(pts[j][0])));
                            }
                            return Math.abs(total * R * R / 2);
                        }

                        function formatDist(km) {
                            var nm = km / 1.852;
                            return km.toFixed(2) + ' km / ' + nm.toFixed(2) + ' nm';
                        }

                        function addPoint(latlng) {
                            var pt = [latlng.lat, latlng.lng];
                            points.push(pt);
                            var marker = L.circleMarker(latlng, {radius:4, color:'#e74c3c', fillColor:'#e74c3c', fillOpacity:1});
                            marker.addTo(measureGroup);
                            tempMarkers.push(marker);

                            if (mode === 'dist' && points.length > 1) {
                                var line = L.polyline([points[points.length-2], pt], {color:'#e74c3c', weight:2, dashArray:'6'});
                                line.addTo(measureGroup);
                                tempLines.push(line);
                                updateDistLabel();
                            }

                            if (mode === 'area' && points.length > 1) {
                                if (tempPolygon) measureGroup.removeLayer(tempPolygon);
                                tempPolygon = L.polygon(points, {color:'#2196F3', weight:2, fillOpacity:0.15});
                                tempPolygon.addTo(measureGroup);
                                updateAreaLabel();
                            }
                        }

                        function updateDistLabel() {
                            if (tooltipLayer) measureGroup.removeLayer(tooltipLayer);
                            var d = totalDist();
                            var last = points[points.length-1];
                            tooltipLayer = L.marker(last, {
                                icon: L.divIcon({className:'measure-tooltip', html: formatDist(d)})
                            });
                            tooltipLayer.addTo(measureGroup);
                        }

                        function updateAreaLabel() {
                            if (tooltipLayer) measureGroup.removeLayer(tooltipLayer);
                            var a = polyArea(points);
                            var center = points[Math.floor(points.length/2)];
                            tooltipLayer = L.marker(center, {
                                icon: L.divIcon({className:'measure-tooltip', html: a.toFixed(2) + ' km\\u00B2'})
                            });
                            tooltipLayer.addTo(measureGroup);
                        }

                        function clearMeasure() {
                            measureGroup.clearLayers();
                            points = []; tempMarkers = []; tempLines = [];
                            tempPolygon = null; tooltipLayer = null;
                        }

                        function setMode(newMode) {
                            clearMeasure();
                            if (mode === newMode) {
                                mode = null;
                                distBtn.classList.remove('active');
                                areaBtn.classList.remove('active');
                                map.getContainer().style.cursor = '';
                                return;
                            }
                            mode = newMode;
                            distBtn.classList.toggle('active', mode === 'dist');
                            areaBtn.classList.toggle('active', mode === 'area');
                            map.getContainer().style.cursor = 'crosshair';
                        }

                        distBtn.addEventListener('click', function() { setMode('dist'); });
                        areaBtn.addEventListener('click', function() { setMode('area'); });
                        clearBtn.addEventListener('click', function() {
                            clearMeasure();
                            mode = null;
                            distBtn.classList.remove('active');
                            areaBtn.classList.remove('active');
                            map.getContainer().style.cursor = '';
                        });

                        map.on('click', function(e) {
                            if (mode) addPoint(e.latlng);
                        });

                        map.on('contextmenu', function(e) {
                            if (mode) {
                                mode = null;
                                distBtn.classList.remove('active');
                                areaBtn.classList.remove('active');
                                map.getContainer().style.cursor = '';
                            }
                        });
                    }

                    if (document.readyState === 'loading') {
                        document.addEventListener('DOMContentLoaded', function() { setTimeout(initMeasure, 500); });
                    } else {
                        setTimeout(initMeasure, 500);
                    }
                })();
                </script>
                """
                m.get_root().html.add_child(Element(measure_script))
        except Exception as e:
            logger.warning("量測工具注入失敗: %s", e)

        return m

    def _calculate_rotation(self, start, end):
        """
        計算箭頭旋轉角度
        用途：根據起點和終點座標計算箭頭應該指向的角度

        參數:
            start: 起點座標 [緯度, 經度]
            end: 終點座標 [緯度, 經度]

        返回:
            float: 角度（度數）
        """
        lat1, lon1 = start
        lat2, lon2 = end
        angle = math.atan2(lon2 - lon1, lat2 - lat1)
        return math.degrees(angle)

    def _create_animation_controller_html(self, wta_results_json, weapon_colors_json, map_name, wta_layer_js_var=None):
        """
        生成武器分派動畫控制器的 HTML 代碼
        用途：創建一個交互式動畫控制面板，可以播放、暫停、調速武器分派動畫

        參數:
            wta_results_json: JSON 格式的武器分派結果
            weapon_colors_json: JSON 格式的飛彈顏色映射
            map_name: Folium 地圖的 JavaScript 變數名
            wta_layer_js_var: WTA 圖層的 JS 變數名（用於將動畫元素加入圖層群組）

        返回:
            str: 完整的 HTML + CSS + JavaScript 代碼
        """
        # 構建動畫 JS 配置常數（注入 Python config 值到 JavaScript）
        anim_config_js = (
            f"\n    var MISSILE_FLIGHT_TIME = {MISSILE_FLIGHT_TIME};"
            f"\n    var WAVE_INTERVAL = {WAVE_INTERVAL};"
            f"\n    var _DEFAULT_WEAPON_COLOR = '{FACTION_COLORS['default_weapon']}';"
            f"\n    var _MISSILE_TRAIL_WEIGHT = {MISSILE_TRAIL_WEIGHT};"
            f"\n    var _COMPLETED_LINE_WEIGHT = {ATTACK_LINE_WEIGHT_WTA};"
            f"\n    var _ARROW_ICON_SIZE = {json.dumps(ARROW_ICON_SIZE)};"
            f"\n    var _ARROW_ICON_ANCHOR = {json.dumps(ARROW_ICON_ANCHOR)};"
            f"\n    var _ARROW_W = {ARROW_ICON_SIZE[0]};"
            f"\n    var _ARROW_H = {ARROW_ICON_SIZE[1]};\n"
        )

        return """
<style>
#wta-animation-controller {
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: rgba(255, 255, 255, 0.95);
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 9999;
    font-family: 'Microsoft JhengHei', sans-serif;
    min-width: 400px;
}
#wta-animation-controller h3 {
    margin: 0 0 10px 0;
    color: #1e3c72;
    font-size: 16px;
}
.control-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
}
.control-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.3s;
}
.control-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}
.btn-play {
    background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
    color: white;
}
.btn-pause {
    background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%);
    color: white;
}
.btn-reset {
    background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
    color: white;
}
.speed-control {
    display: flex;
    gap: 5px;
}
.speed-btn {
    padding: 6px 12px;
    background: #f0f0f0;
    border: 2px solid #ddd;
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.2s;
}
.speed-btn:hover {
    background: #e0e0e0;
}
.speed-btn.active {
    background: #1e3c72;
    color: white;
    border-color: #1e3c72;
}
.progress-bar {
    width: 100%;
    height: 8px;
    background: #ddd;
    border-radius: 4px;
    cursor: pointer;
    margin-bottom: 10px;
}
.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4CAF50 0%, #45a049 100%);
    width: 0%;
    border-radius: 4px;
    transition: width 0.1s linear;
}
.time-display {
    font-size: 12px;
    color: #666;
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
}
.wave-indicator {
    font-size: 14px;
    color: #1e3c72;
    font-weight: 600;
    padding: 8px 12px;
    background: #e8f5e9;
    border-radius: 5px;
    margin-bottom: 10px;
    text-align: center;
}
.missile-arrow-icon {
    background: transparent !important;
    border: none !important;
}
</style>

<div id="wta-animation-controller">
    <h3>🎬 武器分派動畫</h3>
    <div class="wave-indicator" id="wave-indicator">準備就緒</div>
    <div class="progress-bar" id="progress-bar">
        <div class="progress-fill" id="progress-fill"></div>
    </div>
    <div class="time-display">
        <span id="current-time">00:00</span>
        <span id="total-time">00:00</span>
    </div>
    <div class="control-row">
        <button class="control-btn btn-play" id="play-btn">▶ 播放</button>
        <button class="control-btn btn-pause" id="pause-btn" style="display:none;">⏸ 暫停</button>
        <button class="control-btn btn-reset" id="reset-btn">⟲ 重播</button>
    </div>
    <div class="control-row">
        <span style="font-size: 13px; color: #666; font-weight: 600;">速度:</span>
        <div class="speed-control">
            <button class="speed-btn" data-speed="1">1x</button>
            <button class="speed-btn active" data-speed="2">2x</button>
            <button class="speed-btn" data-speed="3">3x</button>
        </div>
    </div>
</div>

<script>
(function() {
    console.log('🎬 初始化武器分派動畫控制器...');

    var wtaResults = """ + wta_results_json + """;
    var weaponColors = """ + weapon_colors_json + """;
    var mapVarName = '""" + map_name + """';
    var wtaLayerVarName = '""" + (wta_layer_js_var or "") + """';
""" + anim_config_js + """
    var map = null;
    var wtaLayer = null;

    function getMap() {
        if (!map) {
            map = window[mapVarName];
            if (!map) {
                console.error('❌ Map object not found:', mapVarName);
                return null;
            }
            // 取得 WTA 圖層群組（若存在）
            if (wtaLayerVarName && window[wtaLayerVarName]) {
                wtaLayer = window[wtaLayerVarName];
            }
        }
        return map;
    }

    function getTargetLayer() {
        return wtaLayer || map;
    }

    console.log('📊 載入', wtaResults.length, '筆武器分派記錄');

    var state = {
        isPlaying: false,
        currentTime: 0,
        totalDuration: 0,
        speed: 2,
        lines: [],
        completedLines: []
    };

    var lastFrameTime = 0;

    function init() {
        var sorted = wtaResults.slice().sort(function(a, b) {
            var wA = parseInt(a.attack_wave.replace(/[^0-9]/g, '')) || 0;
            var wB = parseInt(b.attack_wave.replace(/[^0-9]/g, '')) || 0;
            if (wA !== wB) return wA - wB;
            return a.launched_time.localeCompare(b.launched_time);
        });

        var currentWave = null;
        var waveStart = 0;

        sorted.forEach(function(r) {
            if (r.attack_wave !== currentWave) {
                if (currentWave !== null) {
                    waveStart += WAVE_INTERVAL;
                }
                currentWave = r.attack_wave;
            }

            var color = _DEFAULT_WEAPON_COLOR;
            for (var key in weaponColors) {
                if (r.weapon && r.weapon.indexOf(key) >= 0) {
                    color = weaponColors[key];
                    break;
                }
            }

            state.lines.push({
                startTime: waveStart,
                endTime: waveStart + MISSILE_FLIGHT_TIME,
                startLat: r.roc_location[0],
                startLon: r.roc_location[1],
                endLat: r.enemy_location[0],
                endLon: r.enemy_location[1],
                color: color,
                wave: r.attack_wave,
                weapon: r.weapon,
                polyline: null,
                missileHead: null,
                completed: false
            });
        });

        if (state.lines.length > 0) {
            state.totalDuration = state.lines[state.lines.length - 1].endTime;
        }

        document.getElementById('total-time').textContent = formatTime(state.totalDuration);
        console.log('✅ 動畫初始化完成:', state.lines.length, '條飛彈');
    }

    function formatTime(ms) {
        var s = Math.floor(ms / 1000);
        var m = Math.floor(s / 60);
        s = s % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function drawTrail(line, progress) {
        var lat = line.startLat + (line.endLat - line.startLat) * progress;
        var lon = line.startLon + (line.endLon - line.startLon) * progress;

        var currentMap = getMap();
        if (!currentMap) return;
        var target = getTargetLayer();

        if (!line.polyline) {
            line.polyline = L.polyline(
                [[line.startLat, line.startLon], [lat, lon]],
                {color: line.color, weight: _MISSILE_TRAIL_WEIGHT, opacity: 1, className: 'missile-trail'}
            ).addTo(target);
        } else {
            line.polyline.setLatLngs([[line.startLat, line.startLon], [lat, lon]]);
        }

        var angle = Math.atan2(
            line.endLon - line.startLon,
            line.endLat - line.startLat
        ) * 180 / Math.PI;

        if (!line.missileHead) {
            var arrowSvg = '<svg width="' + _ARROW_W + '" height="' + _ARROW_H + '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" ' +
                          'style="transform: rotate(' + angle + 'deg); transform-origin: center center;">' +
                          '<path d="M12 2 L20 22 L12 18 L4 22 Z" ' +
                          'fill="' + line.color + '" stroke="white" stroke-width="1.5"/>' +
                          '</svg>';

            line.missileHead = L.marker([lat, lon], {
                icon: L.divIcon({
                    html: arrowSvg,
                    className: 'missile-arrow-icon',
                    iconSize: _ARROW_ICON_SIZE,
                    iconAnchor: _ARROW_ICON_ANCHOR
                }),
                zIndexOffset: 1000
            }).addTo(target);
        } else {
            line.missileHead.setLatLng([lat, lon]);

            var newArrowSvg = '<svg width="' + _ARROW_W + '" height="' + _ARROW_H + '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" ' +
                             'style="transform: rotate(' + angle + 'deg); transform-origin: center center;">' +
                             '<path d="M12 2 L20 22 L12 18 L4 22 Z" ' +
                             'fill="' + line.color + '" stroke="white" stroke-width="1.5"/>' +
                             '</svg>';

            line.missileHead.setIcon(L.divIcon({
                html: newArrowSvg,
                className: 'missile-arrow-icon',
                iconSize: _ARROW_ICON_SIZE,
                iconAnchor: _ARROW_ICON_ANCHOR
            }));
        }
    }

    function complete(line) {
        var currentMap = getMap();
        if (!currentMap) return;
        var target = getTargetLayer();

        if (line.missileHead) {
            target.removeLayer(line.missileHead);
            line.missileHead = null;
        }

        if (line.polyline) {
            line.polyline.setStyle({opacity: 0.4, weight: _COMPLETED_LINE_WEIGHT});
            state.completedLines.push(line.polyline);
            line.polyline = null;
        }
    }

    function animate(timestamp) {
        if (!state.isPlaying) return;

        if (lastFrameTime === 0) lastFrameTime = timestamp;
        var delta = (timestamp - lastFrameTime) * state.speed;
        lastFrameTime = timestamp;

        state.currentTime += delta;

        if (state.currentTime >= state.totalDuration) {
            state.currentTime = state.totalDuration;
            pause();
            return;
        }

        var progress = (state.currentTime / state.totalDuration) * 100;
        document.getElementById('progress-fill').style.width = progress + '%';
        document.getElementById('current-time').textContent = formatTime(state.currentTime);

        var currentWave = '';
        state.lines.forEach(function(line) {
            var t = state.currentTime;

            if (t >= line.startTime && t <= line.endTime) {
                var p = (t - line.startTime) / (line.endTime - line.startTime);
                drawTrail(line, p);
                currentWave = line.wave;
            } else if (t > line.endTime && !line.completed) {
                drawTrail(line, 1.0);
                complete(line);
                line.completed = true;
            }
        });

        if (currentWave) {
            document.getElementById('wave-indicator').textContent = '當前: ' + currentWave;
        }

        requestAnimationFrame(animate);
    }

    function play() {
        if (state.isPlaying) return;

        state.isPlaying = true;
        lastFrameTime = 0;
        document.getElementById('play-btn').style.display = 'none';
        document.getElementById('pause-btn').style.display = 'inline-block';
        requestAnimationFrame(animate);
        console.log('▶ 動畫播放');
    }

    function pause() {
        state.isPlaying = false;
        lastFrameTime = 0;
        document.getElementById('play-btn').style.display = 'inline-block';
        document.getElementById('pause-btn').style.display = 'none';
        console.log('⏸ 動畫暫停');
    }

    function reset() {
        pause();

        var currentMap = getMap();
        if (!currentMap) return;
        var target = getTargetLayer();

        state.lines.forEach(function(line) {
            if (line.polyline) target.removeLayer(line.polyline);
            if (line.missileHead) target.removeLayer(line.missileHead);
            line.polyline = null;
            line.missileHead = null;
            line.completed = false;
        });

        state.completedLines.forEach(function(p) {
            target.removeLayer(p);
        });
        state.completedLines = [];

        state.currentTime = 0;
        document.getElementById('progress-fill').style.width = '0%';
        document.getElementById('current-time').textContent = '00:00';
        document.getElementById('wave-indicator').textContent = '準備就緒';

        console.log('⟲ 動畫重置');
    }

    function setSpeed(speed) {
        state.speed = speed;
        console.log('⚡ 速度設置為:', speed + 'x');
    }

    document.getElementById('play-btn').addEventListener('click', play);
    document.getElementById('pause-btn').addEventListener('click', pause);
    document.getElementById('reset-btn').addEventListener('click', reset);

    document.querySelectorAll('.speed-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var speed = parseInt(this.getAttribute('data-speed'));
            setSpeed(speed);

            document.querySelectorAll('.speed-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            this.classList.add('active');
        });
    });

    document.getElementById('progress-bar').addEventListener('click', function(e) {
        var rect = this.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var percent = x / rect.width;

        reset();
        state.currentTime = percent * state.totalDuration;
        console.log('⏩ 跳轉到:', formatTime(state.currentTime));
    });

    function tryInit() {
        var m = getMap();
        if (m) {
            init();
            console.log('✅ 動畫控制器就緒');
        } else {
            setTimeout(tryInit, 100);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(tryInit, 200);
        });
    } else {
        setTimeout(tryInit, 200);
    }
})();
</script>
"""
