/**
 * 反饋管理模組
 * 處理用戶反饋的顯示和提交
 */

import { escapeHtml } from '../utils/helpers.js';
import { THEME_COLORS, FEEDBACK_TYPE_COLORS } from '../utils/constants.js';

/**
 * 反饋管理器類別
 */
export class FeedbackManager {
  constructor(apiClient, uiManager) {
    this.apiClient = apiClient;
    this.uiManager = uiManager;
  }

  /**
   * 顯示反饋對話框
   * @param {HTMLElement} button - 反饋按鈕元素
   */
  showFeedback(button) {
    const messageDiv = button.closest('.chat-message');
    const question = messageDiv.dataset.question || '';
    const answerText = messageDiv.dataset.answerText || '';
    const sources = messageDiv.dataset.sources || '[]';
    const ragId = messageDiv.dataset.ragId || '';
    const datetime = messageDiv.dataset.datetime || '';

    // 創建 modal
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal-content">
        <h3 style="margin-bottom: 15px; color: ${THEME_COLORS.primary};">💬 提供反饋</h3>
        <p style="margin-bottom: 15px; color: ${THEME_COLORS.textMuted};">請告訴我們您對這個回答的看法：</p>

        <textarea
          id="feedback-text"
          placeholder="請輸入您的意見或建議（選填）..."
          style="width: 100%; min-height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; resize: vertical; font-family: inherit; margin-bottom: 15px;"
        ></textarea>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button class="rag-btn rag-source feedback-positive-btn">👍 有幫助</button>
          <button class="rag-btn rag-feedback feedback-negative-btn">👎 沒幫助</button>
          <button class="rag-btn feedback-cancel-btn" style="background: #95a5a6; color: white;">取消</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 使用事件監聽器綁定按鈕
    const positiveBtn = modal.querySelector('.feedback-positive-btn');
    const negativeBtn = modal.querySelector('.feedback-negative-btn');
    const cancelBtn = modal.querySelector('.feedback-cancel-btn');

    positiveBtn.addEventListener('click', () => {
      this.submitFeedback('positive', question, answerText, sources, ragId, datetime);
    });

    negativeBtn.addEventListener('click', () => {
      this.submitFeedback('negative', question, answerText, sources, ragId, datetime);
    });

    cancelBtn.addEventListener('click', () => {
      modal.remove();
    });
  }

  /**
   * 提交反饋
   * @param {string} type - 反饋類型（positive/negative）
   * @param {string} question - 問題
   * @param {string} answer - 答案
   * @param {string} sources - 來源（JSON 字串）
   * @param {string} ragId - RAG ID
   * @param {string} datetime - 時間戳
   */
  async submitFeedback(type, question, answer = '', sources = '[]', ragId = '', datetime = '') {
    const feedbackTextElement = document.getElementById('feedback-text');
    const feedbackText = feedbackTextElement ? feedbackTextElement.value.trim() : '';

    // 檢查：如果是 negative，必須輸入反饋文字
    if (type === 'negative' && !feedbackText) {
      this.uiManager.showNotification('⚠️ 請輸入您認為不正確的原因', 'warning');
      return;
    }

    // positive 可以空白，但如果空白就填入預設文字
    let finalFeedbackText = feedbackText;
    if (type === 'positive' && !feedbackText) {
      finalFeedbackText = '用戶認為此回答有幫助';
    }

    // 解析 sources（如果是字串）
    let parsedSources = [];
    try {
      parsedSources = typeof sources === 'string' ? JSON.parse(sources) : sources;
    } catch (e) {
      console.warn('無法解析 sources:', e);
      parsedSources = [];
    }

    try {
      this.uiManager.showLoading('正在提交反饋...');

      const result = await this.apiClient.submitFeedback({
        question: question,
        feedback_type: type,
        feedback_text: finalFeedbackText,
        answer: answer,
        sources: parsedSources,
        rag_id: ragId || Date.now().toString(),
        datetime: datetime || new Date().toISOString()
      });

      this.uiManager.hideLoading();

      if (result.success) {
        this.uiManager.showNotification('✅ 反饋已送出，感謝您的回饋！', 'success');
        document.querySelector('.modal.active')?.remove();
        console.log('✅ 反饋提交成功:', result);
      } else {
        this.uiManager.showNotification('❌ 反饋送出失敗：' + (result.error || '未知錯誤'), 'error');
        console.error('❌ 反饋提交失敗:', result);
      }
    } catch (error) {
      this.uiManager.hideLoading();
      this.uiManager.showNotification('❌ 反饋送出失敗：' + error.message, 'error');
      console.error('❌ 反饋錯誤:', error);
    }
  }

  /**
   * 查看反饋記錄
   */
  async viewFeedbacks() {
    try {
      const result = await this.apiClient.getFeedbacks(20);

      if (!result.success) {
        this.uiManager.showNotification('❌ 無法加載反饋', 'error');
        return;
      }

      const feedbacks = result.feedbacks;
      const stats = result.stats;

      // 創建反饋查看視窗
      const modal = document.createElement('div');
      modal.className = 'modal active';

      let feedbacksHtml = '';
      if (feedbacks.length > 0) {
        feedbacks.forEach((feedback, index) => {
          const typeColor = (FEEDBACK_TYPE_COLORS[feedback.feedback_type] || {}).color || THEME_COLORS.textMuted;

          const typeIcon = {
            'positive': '👍',
            'negative': '👎',
            'error': '⚠️'
          }[feedback.feedback_type] || '💬';

          feedbacksHtml += `
            <div style="background: ${THEME_COLORS.bgAlt}; padding: 15px; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid ${typeColor};">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <strong style="color: ${THEME_COLORS.primary};">${typeIcon} ${feedback.feedback_type.toUpperCase()}</strong>
                <span style="font-size: 12px; color: ${THEME_COLORS.textMuted};">${new Date(feedback.timestamp).toLocaleString('zh-TW')}</span>
              </div>
              <p style="margin: 8px 0; color: ${THEME_COLORS.text};"><strong>問題：</strong>${escapeHtml(feedback.question)}</p>
              ${feedback.feedback_text ? `<p style="margin: 8px 0; color: ${THEME_COLORS.textMuted};"><strong>反饋：</strong>${escapeHtml(feedback.feedback_text)}</p>` : ''}
            </div>
          `;
        });
      } else {
        feedbacksHtml = '<p style="text-align: center; color: #666; padding: 20px;">暫無反饋記錄</p>';
      }

      modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; max-height: 80vh; overflow-y: auto;">
          <h3 class="modal-title">📊 用戶反饋統計</h3>

          <div style="display: flex; gap: 15px; margin: 20px 0;">
            <div style="flex: 1; background: ${FEEDBACK_TYPE_COLORS.positive.bg}; padding: 15px; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: ${FEEDBACK_TYPE_COLORS.positive.color};">${stats.positive}</div>
              <div style="font-size: 12px; color: ${THEME_COLORS.textMuted};">正面反饋</div>
            </div>
            <div style="flex: 1; background: ${FEEDBACK_TYPE_COLORS.negative.bg}; padding: 15px; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: ${FEEDBACK_TYPE_COLORS.negative.color};">${stats.negative}</div>
              <div style="font-size: 12px; color: ${THEME_COLORS.textMuted};">負面反饋</div>
            </div>
            <div style="flex: 1; background: ${FEEDBACK_TYPE_COLORS.error.bg}; padding: 15px; border-radius: 8px; text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: ${FEEDBACK_TYPE_COLORS.error.color};">${stats.error}</div>
              <div style="font-size: 12px; color: ${THEME_COLORS.textMuted};">錯誤報告</div>
            </div>
          </div>

          <h4 style="margin: 20px 0 10px 0; color: ${THEME_COLORS.primary};">最近反饋：</h4>
          ${feedbacksHtml}

          <div style="text-align: right; margin-top: 20px;">
            <button class="global-btn btn-save-chat" onclick="this.closest('.modal').remove()">關閉</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // 點擊背景關閉
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });

    } catch (error) {
      this.uiManager.showNotification('❌ 加載反饋失敗', 'error');
      console.error('反饋加載錯誤:', error);
    }
  }
}
