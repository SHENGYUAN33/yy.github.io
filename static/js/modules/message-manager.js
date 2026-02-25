/**
 * 訊息管理模組
 * 處理聊天訊息顯示和管理
 */

import { escapeHtml } from '../utils/helpers.js';
import { THEME_COLORS } from '../utils/constants.js';

/**
 * 訊息管理器類別
 */
export class MessageManager {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.conversation = [];
  }

  /**
   * 添加用戶訊息
   * @param {string} text - 訊息內容
   */
  addUserMessage(text) {
    const container = document.getElementById('chat-container');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message user';
    msgDiv.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    // 記錄對話
    this.conversation.push({ role: 'user', content: text });
  }

  /**
   * 添加助手訊息
   * @param {string} text - 訊息內容
   * @param {Object} options - 選項（tableHtml, showRagButtons 等）
   */
  addAssistantMessage(text, options = {}) {
    const container = document.getElementById('chat-container');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message assistant';

    let bubbleHtml = `<div class="message-bubble">${escapeHtml(text)}`;

    // 如果包含表格 HTML，直接插入（不轉義）
    if (options.tableHtml) {
      bubbleHtml += options.tableHtml;
    }

    // 如果需要顯示 RAG 按鈕
    if (options.showRagButtons) {
      bubbleHtml += `
        <div class="rag-buttons">
          <button class="rag-btn rag-copy" onclick="window.copyAnswer(this)">📋 複製</button>
          <button class="rag-btn rag-source" onclick="window.showSource(this)">📚 來源</button>
          <button class="rag-btn rag-feedback" onclick="window.showFeedback(this)">💬 反饋</button>
        </div>
      `;
    }

    bubbleHtml += `</div>`;
    msgDiv.innerHTML = bubbleHtml;

    // 儲存原始內容（供複製功能使用）
    if (options.showRagButtons) {
      msgDiv.dataset.answerText = text;
      msgDiv.dataset.question = options.question || '';
      msgDiv.dataset.sources = JSON.stringify(options.sources || []);
      msgDiv.dataset.ragId = options.ragId || '';
      msgDiv.dataset.datetime = options.datetime || '';
    }

    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    // 記錄對話
    this.conversation.push({ role: 'assistant', content: text });
  }

  /**
   * 添加系統訊息
   * @param {string} text - 訊息內容
   */
  addSystemMessage(text) {
    const container = document.getElementById('chat-container');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message system';
    msgDiv.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
  }

  /**
   * 建立串流訊息氣泡
   * 回傳物件含 appendText() 和 finalize() 方法，供逐字渲染使用
   * @returns {Object} { appendText(str), finalize(options), getText() }
   */
  createStreamingMessage() {
    const container = document.getElementById('chat-container');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message assistant';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // 串流游標（閃爍效果）
    const cursor = document.createElement('span');
    cursor.className = 'streaming-cursor';
    cursor.textContent = '\u258C';

    bubble.appendChild(cursor);
    msgDiv.appendChild(bubble);
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;

    let fullText = '';
    const self = this;

    return {
      appendText(text) {
        fullText += text;
        bubble.innerHTML = escapeHtml(fullText);
        bubble.appendChild(cursor);
        container.scrollTop = container.scrollHeight;
      },

      finalize(options = {}) {
        // 移除游標
        if (cursor.parentNode) cursor.remove();

        // 重新渲染最終內容
        let finalHtml = escapeHtml(fullText);

        if (options.tableHtml) {
          finalHtml += options.tableHtml;
        }

        if (options.showRagButtons) {
          finalHtml += `
            <div class="rag-buttons">
              <button class="rag-btn rag-copy" onclick="window.copyAnswer(this)">📋 複製</button>
              <button class="rag-btn rag-source" onclick="window.showSource(this)">📚 來源</button>
              <button class="rag-btn rag-feedback" onclick="window.showFeedback(this)">💬 反饋</button>
            </div>
          `;
        }

        bubble.innerHTML = finalHtml;

        // 儲存 dataset 屬性（供 RAG 按鈕使用）
        if (options.showRagButtons) {
          msgDiv.dataset.answerText = fullText;
          msgDiv.dataset.question = options.question || '';
          msgDiv.dataset.sources = JSON.stringify(options.sources || []);
          msgDiv.dataset.ragId = options.ragId || '';
          msgDiv.dataset.datetime = options.datetime || '';
        }

        container.scrollTop = container.scrollHeight;

        // 記錄對話
        self.conversation.push({ role: 'assistant', content: fullText });
      },

      getText() {
        return fullText;
      }
    };
  }

  /**
   * 複製答案到剪貼簿
   * @param {HTMLElement} button - 複製按鈕元素
   */
  copyAnswer(button) {
    const messageDiv = button.closest('.chat-message');
    const answerText = messageDiv.dataset.answerText;

    navigator.clipboard.writeText(answerText).then(() => {
      this.uiManager.showNotification('✅ 已複製到剪貼簿', 'success');
      button.textContent = '✓ 已複製';
      button.classList.add('is-copied');

      setTimeout(() => {
        button.textContent = '📋 複製';
        button.classList.remove('is-copied');
      }, 2000);
    }).catch(err => {
      this.uiManager.showNotification('❌ 複製失敗', 'error');
      console.error('複製錯誤:', err);
    });
  }

  /**
   * 顯示來源
   * @param {HTMLElement} button - 來源按鈕元素
   * @param {Object} systemSettings - 系統設置
   */
  showSource(button, systemSettings) {
    const messageDiv = button.closest('.chat-message');
    const sourcesJson = messageDiv.dataset.sources || '[]';
    const sources = JSON.parse(sourcesJson);
    const question = messageDiv.dataset.question || '';

    // 檢查系統設定
    if (!systemSettings.show_source_btn) {
      this.uiManager.showNotification('⚠️ 管理員已關閉來源顯示功能', 'warning');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal active';

    let sourcesHtml = '';
    if (sources && sources.length > 0) {
      sources.forEach((source, index) => {
        sourcesHtml += `
          <div style="background: ${THEME_COLORS.bgLight}; padding: 15px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid ${THEME_COLORS.info};">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: ${THEME_COLORS.primary};">來源 ${source.index || index + 1}</strong>
              <span style="background: #e3f2fd; padding: 4px 12px; border-radius: 12px; font-size: 12px; color: ${THEME_COLORS.infoDark};">
                相似度: ${(source.score * 100).toFixed(1)}%
              </span>
            </div>
            <p style="margin: 8px 0; color: ${THEME_COLORS.text}; line-height: 1.6;">${escapeHtml(source.content)}</p>
            <p style="margin: 4px 0; font-size: 12px; color: ${THEME_COLORS.textMuted};">
              📄 路徑: <code style="background: ${THEME_COLORS.white}; padding: 2px 6px; border-radius: 4px;">${escapeHtml(source.path)}</code>
            </p>
          </div>
        `;
      });
    } else {
      sourcesHtml = `<p style="color: ${THEME_COLORS.textMuted}; text-align: center; padding: 20px;">無來源資訊</p>`;
    }

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
        <h3 class="modal-title">📚 文本引用來源</h3>
        <div style="margin: 20px 0;">
          <h4 style="color: ${THEME_COLORS.primary}; margin-bottom: 10px;">問題：</h4>
          <p style="background: ${THEME_COLORS.bgLight}; padding: 12px; border-radius: 6px; margin-bottom: 20px;">${escapeHtml(question)}</p>

          <h4 style="color: ${THEME_COLORS.primary}; margin-bottom: 15px;">檢索來源（共 ${sources.length} 筆）：</h4>
          ${sourcesHtml}

          <p style="margin-top: 15px; font-size: 12px; color: ${THEME_COLORS.textMuted}; border-top: 1px solid ${THEME_COLORS.border}; padding-top: 15px;">
            💡 提示：相似度分數越高，表示來源內容與問題越相關。
          </p>
        </div>
        <div style="text-align: right;">
          <button class="global-btn btn-save-chat" onclick="this.closest('.modal').remove()" style="padding: 10px 20px;">
            關閉
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  /**
   * 清除對話記錄
   */
  clearConversation() {
    this.conversation = [];
  }

  /**
   * 獲取對話記錄
   * @returns {Array} 對話記錄
   */
  getConversation() {
    return this.conversation;
  }
}
