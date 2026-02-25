/**
 * UI 管理模組
 * 處理所有 UI 相關功能
 */

import { NOTIFICATION_DURATION, SPLITTER_MIN_MAP, SPLITTER_EXTRA_GAP } from '../utils/constants.js';
import { clamp } from '../utils/helpers.js';

/**
 * UI 管理器類別
 */
export class UIManager {
  constructor() {
    this.dragOverlay = null;
  }

  /**
   * 初始化分隔線佈局（上圖台/下文本可拖曳調整）
   */
  initSplitLayout() {
    const splitter = document.getElementById('splitter');
    const paneMap = document.getElementById('pane-map');
    const paneText = document.getElementById('pane-text');
    const container = document.getElementById('split-container');
    const iframe = document.getElementById('folium-map');

    if (!splitter || !paneMap || !paneText || !container) return;

    // 創建透明遮罩：拖曳時覆蓋 iframe，避免事件被 iframe 吃掉
    this.createDragOverlay();

    let dragging = false;
    let pendingY = null;
    let rafId = null;

    // 下半部最小高度：一定要能容納輸入列（固定在底部）
    const getMinTextHeight = () => {
      const dock = document.getElementById('chat-input-area');
      const dockH = dock ? dock.getBoundingClientRect().height : 80;
      return Math.max(260, Math.ceil(dockH + SPLITTER_EXTRA_GAP));
    };

    const tryInvalidateLeaflet = () => {
      try {
        if (!iframe || !iframe.contentWindow) return;
        const w = iframe.contentWindow;
        for (const k in w) {
          const obj = w[k];
          if (obj && typeof obj.invalidateSize === 'function' && typeof obj.getCenter === 'function') {
            obj.invalidateSize(true);
            break;
          }
        }
      } catch (e) {
        // ignore cross-origin / 尚未載入
      }
    };

    const applyResize = (y) => {
      const rect = container.getBoundingClientRect();
      const splitterH = splitter.getBoundingClientRect().height;
      const minText = getMinTextHeight();
      const maxMap = rect.height - minText - splitterH;
      const mapH = clamp(y, SPLITTER_MIN_MAP, maxMap);
      paneMap.style.flex = `0 0 ${mapH}px`;
    };

    const scheduleResize = (y) => {
      pendingY = y;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (pendingY == null) return;
        applyResize(pendingY);
        pendingY = null;
      });
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      this.dragOverlay.style.display = 'none';
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.pointerEvents = '';
      setTimeout(tryInvalidateLeaflet, 50);
    };

    // Pointer Events + setPointerCapture：保證 pointerup 一定收到
    splitter.addEventListener('pointerdown', (e) => {
      dragging = true;
      try { splitter.setPointerCapture(e.pointerId); } catch (_) {}

      this.dragOverlay.style.display = 'block';
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      const rect = container.getBoundingClientRect();
      scheduleResize(e.clientY - rect.top);
      e.preventDefault();
    });

    splitter.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = container.getBoundingClientRect();
      scheduleResize(e.clientY - rect.top);
      e.preventDefault();
    });

    splitter.addEventListener('pointerup', (e) => {
      endDrag();
      e.preventDefault();
    });

    splitter.addEventListener('pointercancel', (e) => {
      endDrag();
      e.preventDefault();
    });

    window.addEventListener('blur', endDrag);
  }

  /**
   * 創建拖曳遮罩層
   */
  createDragOverlay() {
    let overlay = document.getElementById('drag-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'drag-overlay';
      overlay.style.position = 'absolute';
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.right = '0';
      overlay.style.bottom = '0';
      overlay.style.zIndex = '9999';
      overlay.style.background = 'transparent';
      overlay.style.display = 'none';

      const displayPanel = document.getElementById('display-panel');
      if (displayPanel) {
        if (!displayPanel.style.position) displayPanel.style.position = 'relative';
        displayPanel.appendChild(overlay);
      } else {
        document.body.appendChild(overlay);
        overlay.style.position = 'fixed';
      }
    }
    this.dragOverlay = overlay;
  }

  /**
   * 折疊/展開功能區塊
   * @param {HTMLElement} header - 功能區塊標題元素
   */
  toggleFunction(header) {
    const content = header.nextElementSibling;
    const icon = header.querySelector('.icon');
    header.classList.toggle('active');
    content.classList.toggle('active');
    icon.textContent = content.classList.contains('active') ? '▼' : '▶';
  }

  /**
   * 切換 Tab（相容舊程式，整合版 UI 不再使用）
   * @param {string} tab - Tab 名稱
   */
  switchTab(tab) {
    const buttons = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    if (!buttons.length || !contents.length) return;

    buttons.forEach(btn => btn.classList.remove('active'));
    contents.forEach(content => content.classList.remove('active'));

    if (tab === 'map') {
      if (buttons[0]) buttons[0].classList.add('active');
      const mc = document.getElementById('map-content');
      if (mc) mc.classList.add('active');
    } else {
      if (buttons[1]) buttons[1].classList.add('active');
      const tc = document.getElementById('text-content');
      if (tc) tc.classList.add('active');
    }
  }

  /**
   * 顯示載入動畫
   * @param {string} message - 載入訊息
   */
  showLoading(message) {
    document.getElementById('loading-message').textContent = message;
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('loading-overlay').classList.add('active');
    const cancelBtn = document.getElementById('cancel-request-btn');
    if (cancelBtn) cancelBtn.style.display = 'inline-block';
  }

  /**
   * 隱藏載入動畫
   */
  hideLoading() {
    document.getElementById('loading-overlay').classList.remove('active');
    const cancelBtn = document.getElementById('cancel-request-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
  }

  /**
   * 更新載入進度
   * @param {number} progress - 進度百分比（0-100）
   * @param {string} message - 進度訊息
   */
  updateLoadingProgress(progress, message) {
    document.getElementById('loading-message').textContent = message;
    document.getElementById('progress-fill').style.width = progress + '%';
  }

  /**
   * 顯示通知訊息
   * @param {string} message - 通知內容
   * @param {string} type - 通知類型（success/error/info/warning）
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), NOTIFICATION_DURATION);
  }

  /**
   * 返回功能（佔位）
   */
  handleBack() {
    this.showNotification('返回功能尚未實作', 'info');
  }

  /**
   * 清除文本
   */
  clearText() {
    if (!confirm('確定要清除所有文本對話嗎？')) {
      return;
    }

    try {
      // 清空聊天容器
      const chatContainer = document.getElementById('chat-container');
      if (chatContainer) {
        chatContainer.innerHTML = '';
      }

      // 清空 WTA 表格容器
      const wtaContainer = document.getElementById('wta-table-container');
      if (wtaContainer) {
        wtaContainer.innerHTML = '';
        wtaContainer.style.display = 'none';
      }

      // 通知訊息管理器清空對話記錄（由 main.js 處理）
      window.dispatchEvent(new CustomEvent('clear-conversation'));

      this.showNotification('✅ 文本已清除', 'success');
    } catch (error) {
      console.error('清除文本失敗:', error);
      this.showNotification('❌ 清除失敗', 'error');
    }
  }
}
