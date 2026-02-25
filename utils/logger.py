"""
Logging 工具模組
用途：集中管理系統日誌配置，支援控制台輸出和檔案輪替
"""
import logging
import os
import sys
from logging.handlers import RotatingFileHandler


def setup_logging(log_dir='logs', level=logging.INFO):
    """
    初始化全域 logging 配置

    參數:
        log_dir: 日誌檔案目錄
        level: 日誌等級（預設 INFO）
    """
    os.makedirs(log_dir, exist_ok=True)

    formatter = logging.Formatter(
        '[%(asctime)s] %(levelname)s [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # 檔案處理器（10MB 輪替，保留 5 個備份）
    file_handler = RotatingFileHandler(
        os.path.join(log_dir, 'app.log'),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(level)

    # 控制台處理器
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(level)

    # 設定 root logger
    root = logging.getLogger()
    root.setLevel(level)
    # 避免重複添加 handler
    if not root.handlers:
        root.addHandler(file_handler)
        root.addHandler(console_handler)
