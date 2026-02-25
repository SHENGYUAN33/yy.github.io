/**
 * 文件管理模組
 * 處理本機檔案儲存功能（使用 File System Access API）
 */

import { dataURLToBlob } from '../utils/helpers.js';

/**
 * 文件管理器類別
 */
export class FileManager {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.saveDirHandle = null;
  }

  /**
   * 選擇保存目錄
   * @returns {Promise<FileSystemDirectoryHandle|null>} 目錄句柄
   */
  async pickSaveDirectory() {
    if (!window.showDirectoryPicker) {
      this.uiManager.showNotification(
        '❌ 你的瀏覽器不支援「選資料夾並寫入」功能（請用 Chrome/Edge，並用 localhost 開啟）',
        'error'
      );
      return null;
    }

    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      return dirHandle;
    } catch (e) {
      // 使用者取消
      return null;
    }
  }

  /**
   * 確保目錄權限
   * @param {FileSystemDirectoryHandle} dirHandle - 目錄句柄
   * @returns {Promise<boolean>} 是否有權限
   */
  async ensureDirPermission(dirHandle) {
    const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return true;
    const req = await dirHandle.requestPermission({ mode: 'readwrite' });
    return req === 'granted';
  }

  /**
   * 寫入文件到目錄
   * @param {FileSystemDirectoryHandle} dirHandle - 目錄句柄
   * @param {string} filename - 文件名
   * @param {Blob} blob - 文件內容
   */
  async writeFileToDir(dirHandle, filename, blob) {
    const ok = await this.ensureDirPermission(dirHandle);
    if (!ok) throw new Error('未取得資料夾寫入權限');

    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  /**
   * 保存對話記錄
   */
  async handleSaveConversation() {
    try {
      // 每次儲存都跳選資料夾
      this.saveDirHandle = null;
      const dirHandle = await this.pickSaveDirectory();
      if (!dirHandle) {
        this.uiManager.showNotification('⚠️ 已取消選擇資料夾', 'warning');
        return;
      }

      const chatContainer = document.getElementById('chat-container');
      const messages = chatContainer.innerText || '';

      const filename = `對話記錄_${new Date().toLocaleString('zh-TW').replace(/[/:]/g, '-')}.txt`;
      const blob = new Blob([messages], { type: 'text/plain;charset=utf-8' });

      await this.writeFileToDir(dirHandle, filename, blob);
      this.uiManager.showNotification(`✅ 對話已儲存到資料夾：${filename}`, 'success');
    } catch (e) {
      this.uiManager.showNotification('❌ 儲存對話失敗：' + (e.message || e), 'error');
      console.error('儲存對話錯誤:', e);
    }
  }

  /**
   * 保存 COP 截圖到資料夾
   * @param {string} imageBase64 - Base64 圖片數據
   * @param {string} filename - 文件名
   * @param {Object} metadata - 元數據（可選）
   */
  async saveCOPToFolder(imageBase64, filename, metadata = null) {
    try {
      // 每次儲存都跳選資料夾
      this.saveDirHandle = null;
      const dirHandle = await this.pickSaveDirectory();
      if (!dirHandle) {
        this.uiManager.showNotification('⚠️ 已取消選擇資料夾', 'warning');
        return false;
      }

      // 保存圖片
      const blob = dataURLToBlob(imageBase64);
      await this.writeFileToDir(dirHandle, filename, blob);

      // 保存元數據（如果有）
      if (metadata) {
        const metaName = filename.replace(/\.png$/i, '') + '_metadata.json';
        const metaBlob = new Blob(
          [JSON.stringify(metadata, null, 2)],
          { type: 'application/json;charset=utf-8' }
        );
        await this.writeFileToDir(dirHandle, metaName, metaBlob);
      }

      this.uiManager.showNotification(`✅ COP 已儲存到選擇的資料夾: ${filename}`, 'success');
      return true;
    } catch (e) {
      this.uiManager.showNotification('❌ 儲存失敗：' + (e.message || e), 'error');
      console.error('儲存錯誤:', e);
      return false;
    }
  }
}
