"""
解析工具模組
用途：提供 LLM Function Calling 參數解析和修正功能
"""
import json
import logging

logger = logging.getLogger(__name__)


def parse_function_arguments(arguments):
    """
    解析 Function Calling 的 arguments（兼容 str 和 dict）
    用途：處理 LLM 返回的參數，修正常見錯誤（如空陣列字符串、錯誤包裝等）

    參數:
        arguments: LLM 返回的 arguments，可能是 dict、str 或其他類型

    返回:
        dict: 解析和修正後的參數字典

    修正項目:
        1. 自動轉換 str 為 dict
        2. 解開錯誤的 {"parameters": {...}, "tool": "..."} 包裝
        3. 修正空陣列字符串 "[]" 為真實的空陣列 []
        4. 修正 JSON 陣列字符串為真實陣列
    """
    # 步驟 1: 轉換為 dict
    if isinstance(arguments, dict):
        result = arguments
    elif isinstance(arguments, str):
        result = json.loads(arguments)
    else:
        result = json.loads(str(arguments))

    # 步驟 2: 處理 LLM 錯誤包裝的情況
    # 如果 LLM 返回 {"parameters": {...}, "tool": "..."}
    # 我們只要 parameters 裡面的內容
    if 'parameters' in result and 'tool' in result:
        logger.warning("檢測到 LLM 錯誤包裝，自動解包: %s", result)
        result = result['parameters']
        logger.info("解包後參數: %s", result)

    # 步驟 3: 修正 LLM 將空陣列寫成字符串 "[]" 的錯誤
    for key, value in result.items():
        if isinstance(value, str):
            # 檢查是否是 "[]" 字符串
            if value.strip() == '[]':
                result[key] = []
                logger.info("修正參數 %s: '[]' -> []", key)
            # 檢查是否是 JSON 陣列字符串 (如 "[\"052D\", \"054A\"]")
            elif value.strip().startswith('[') and value.strip().endswith(']'):
                try:
                    result[key] = json.loads(value)
                    logger.info("修正參數 %s: '%s' -> %s", key, value, result[key])
                except:
                    pass  # 如果解析失敗，保持原值

    return result
