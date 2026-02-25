/**
 * 地圖管理模組
 * 處理地圖顯示和清除功能
 */

import { API_BASE, WTA_TABLE_COLUMNS, THEME_COLORS } from '../utils/constants.js';

/**
 * 地圖管理器類別
 */
export class MapManager {
  constructor(apiClient, uiManager) {
    this.apiClient = apiClient;
    this.uiManager = uiManager;
    this._wtaRawData = null;       // 原始 WTA 資料
    this._wtaSortKey = null;       // 目前排序欄位
    this._wtaSortAsc = true;       // 排序方向
    this._wtaFilterWave = '';      // 篩選：攻擊波次
    this._wtaFilterWeapon = '';    // 篩選：武器種類
  }

  /**
   * 顯示地圖
   * @param {string} mapUrl - 地圖 URL
   */
  showMap(mapUrl) {
    const iframe = document.getElementById('folium-map');
    const placeholder = document.getElementById('map-placeholder');
    if (!iframe) return;

    // 關鍵修正：移除 srcdoc 屬性，否則瀏覽器會優先顯示 srcdoc
    try {
      iframe.removeAttribute('srcdoc');
    } catch (e) {}

    // 強制刷新：先清空再載入（避免某些瀏覽器快取/不重刷）
    const targetUrl = `${API_BASE}${mapUrl}?t=${Date.now()}`;
    iframe.src = 'about:blank';
    setTimeout(() => {
      iframe.src = targetUrl;
    }, 30);

    iframe.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  }

  /**
   * 清除地圖
   */
  async clearMap() {
    if (!confirm('確定要清除地圖上的所有標記和線條嗎？')) {
      return;
    }

    try {
      await this.apiClient.clearMap();
      this.uiManager.showNotification('✅ 地圖已清除', 'success');

      // 重新載入地圖
      const iframe = document.getElementById('folium-map');
      iframe.src = 'about:blank';
      document.getElementById('map-placeholder').style.display = 'block';
      iframe.style.display = 'none';
    } catch (error) {
      this.uiManager.showNotification('❌ 清除失敗', 'error');
    }
  }

  /**
   * 顯示武器分派表格（含排序、篩選、匯出功能）
   * @param {Object} wtaData - 武器分派數據
   */
  displayWTATable(wtaData) {
    const container = document.getElementById('wta-table-container');
    if (!container) {
      console.error('找不到 wta-table-container 元素');
      return;
    }

    container.innerHTML = '';

    if (!wtaData || !wtaData.wta_results || wtaData.wta_results.length === 0) {
      container.innerHTML = `<p style="padding: 20px; text-align: center; color: ${THEME_COLORS.textMuted};">暫無武器分派數據</p>`;
      container.style.display = 'block';
      return;
    }

    // 儲存原始資料
    this._wtaRawData = wtaData;
    this._wtaSortKey = null;
    this._wtaSortAsc = true;
    this._wtaFilterWave = '';
    this._wtaFilterWeapon = '';

    this._renderWTATable(container);
  }

  /**
   * 渲染 WTA 表格（內部方法，支援排序/篩選狀態）
   */
  _renderWTATable(container) {
    if (!container) container = document.getElementById('wta-table-container');
    if (!container || !this._wtaRawData) return;

    const wtaData = this._wtaRawData;
    let results = [...wtaData.wta_results];

    // 篩選
    if (this._wtaFilterWave) {
      results = results.filter(r => String(r.attack_wave) === this._wtaFilterWave);
    }
    if (this._wtaFilterWeapon) {
      results = results.filter(r => (r.weapon || '') === this._wtaFilterWeapon);
    }

    // 排序
    if (this._wtaSortKey) {
      const key = this._wtaSortKey;
      const asc = this._wtaSortAsc;
      results.sort((a, b) => {
        const va = a[key] || '';
        const vb = b[key] || '';
        const cmp = typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'zh-TW');
        return asc ? cmp : -cmp;
      });
    }

    // 提取唯一值供篩選
    const waves = [...new Set(wtaData.wta_results.map(r => String(r.attack_wave || '')))].filter(Boolean).sort();
    const weapons = [...new Set(wtaData.wta_results.map(r => r.weapon || ''))].filter(Boolean).sort();

    // 欄位 key 映射
    const COL_KEYS = ['attack_wave', 'enemy_unit', 'roc_unit', 'weapon', 'launched_number', 'launched_time'];
    const columns = wtaData.wta_table_columns || WTA_TABLE_COLUMNS;

    // 標題列 + 工具列
    let html = `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:8px;">`;
    html += `<h3 style="color:${THEME_COLORS.primary}; margin:0;">武器分派結果 (${results.length}/${wtaData.wta_results.length})</h3>`;
    html += `<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">`;

    // 篩選：攻擊波次
    html += `<select id="wta-filter-wave" style="padding:4px 8px; border:1px solid #ccc; border-radius:4px; font-size:12px;">`;
    html += `<option value="">全部波次</option>`;
    waves.forEach(w => {
      html += `<option value="${w}" ${this._wtaFilterWave === w ? 'selected' : ''}>第 ${w} 波</option>`;
    });
    html += `</select>`;

    // 篩選：武器種類
    html += `<select id="wta-filter-weapon" style="padding:4px 8px; border:1px solid #ccc; border-radius:4px; font-size:12px;">`;
    html += `<option value="">全部武器</option>`;
    weapons.forEach(w => {
      html += `<option value="${w}" ${this._wtaFilterWeapon === w ? 'selected' : ''}>${w}</option>`;
    });
    html += `</select>`;

    // 匯出 CSV 按鈕
    html += `<button id="wta-export-csv" style="padding:4px 12px; background:#4CAF50; color:white; border:none; border-radius:4px; font-size:12px; cursor:pointer;">CSV</button>`;
    html += `</div></div>`;

    // 表格
    html += '<div style="overflow-x:auto;"><table class="wta-table">';
    html += '<thead><tr>';

    columns.forEach((col, i) => {
      const key = COL_KEYS[i] || Object.keys(col)[0];
      const label = col[Object.keys(col)[0]];
      const arrow = this._wtaSortKey === key ? (this._wtaSortAsc ? ' ▲' : ' ▼') : '';
      html += `<th data-sort-key="${key}" style="cursor:pointer; user-select:none; white-space:nowrap;">${label}${arrow}</th>`;
    });

    html += '</tr></thead><tbody>';

    results.forEach(row => {
      html += '<tr>';
      html += `<td>${row.attack_wave || '-'}</td>`;
      html += `<td>${row.enemy_unit || '-'}</td>`;
      html += `<td>${row.roc_unit || '-'}</td>`;

      let weaponClass = '';
      if (row.weapon && row.weapon.includes('雄三')) weaponClass = 'weapon-hf3';
      else if (row.weapon && row.weapon.includes('雄二')) weaponClass = 'weapon-hf2';
      html += `<td class="${weaponClass}">${row.weapon || '-'}</td>`;

      html += `<td>${row.launched_number || '-'}</td>`;
      html += `<td>${row.launched_time || '-'}</td>`;
      html += '</tr>';
    });

    html += '</tbody></table></div>';

    container.innerHTML = html;
    container.style.display = 'block';

    // 綁定排序事件
    container.querySelectorAll('th[data-sort-key]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (this._wtaSortKey === key) {
          this._wtaSortAsc = !this._wtaSortAsc;
        } else {
          this._wtaSortKey = key;
          this._wtaSortAsc = true;
        }
        this._renderWTATable(container);
      });
    });

    // 綁定篩選事件
    const filterWave = container.querySelector('#wta-filter-wave');
    const filterWeapon = container.querySelector('#wta-filter-weapon');
    if (filterWave) {
      filterWave.addEventListener('change', () => {
        this._wtaFilterWave = filterWave.value;
        this._renderWTATable(container);
      });
    }
    if (filterWeapon) {
      filterWeapon.addEventListener('change', () => {
        this._wtaFilterWeapon = filterWeapon.value;
        this._renderWTATable(container);
      });
    }

    // 綁定 CSV 匯出
    const exportBtn = container.querySelector('#wta-export-csv');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this._exportWTACSV(results, columns, COL_KEYS));
    }

    console.log(`武器分派表格已顯示，共 ${results.length} 筆記錄`);
  }

  /**
   * 匯出 WTA 結果為 CSV
   */
  _exportWTACSV(results, columns, colKeys) {
    const headers = columns.map(col => col[Object.keys(col)[0]]);
    const rows = results.map(row =>
      colKeys.map(key => {
        const val = String(row[key] || '-');
        return val.includes(',') ? `"${val}"` : val;
      })
    );

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const ts = now.getFullYear()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0')
      + '_' + String(now.getHours()).padStart(2, '0')
      + String(now.getMinutes()).padStart(2, '0')
      + String(now.getSeconds()).padStart(2, '0');

    const a = document.createElement('a');
    a.href = url;
    a.download = `WTA_結果_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
