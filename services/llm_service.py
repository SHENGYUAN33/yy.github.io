"""
LLM 服務模組
用途：封裝所有與 LLM API 互動的功能，包括場景匯入、模擬啟動、武器分派查詢、航跡查詢和問答等
透過 Provider 抽象層支援 Ollama / OpenAI / Anthropic 等多個 LLM 提供者
"""
import json
import logging
import os
import time
from config import DEFAULT_LLM_MODEL, LLM_MAX_RETRIES, LLM_RETRY_DELAY
from services.llm_providers import get_provider

logger = logging.getLogger(__name__)

# 預設 Prompt 檔案路徑
_DEFAULT_PROMPTS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'default_prompts.json')
_default_prompts_cache = None


def _load_default_prompts():
    """載入 default_prompts.json 並快取"""
    global _default_prompts_cache
    if _default_prompts_cache is None:
        try:
            with open(_DEFAULT_PROMPTS_FILE, 'r', encoding='utf-8') as f:
                _default_prompts_cache = json.load(f)
            logger.info("已載入預設 Prompt 檔案: %s", _DEFAULT_PROMPTS_FILE)
        except Exception as e:
            logger.warning("無法載入 default_prompts.json: %s，將使用最小化內建 Prompt", e)
            _default_prompts_cache = {}
    return _default_prompts_cache


def _get_default_prompt(function_name):
    """
    取得指定功能的預設 system prompt（從 default_prompts.json）

    參數:
        function_name: 功能名稱（如 "import_scenario"）

    返回:
        str: editable + fixed 組合的完整 prompt，若檔案不可用則返回 None
    """
    prompts = _load_default_prompts()
    if function_name in prompts:
        entry = prompts[function_name]
        prompt = entry.get('editable', '') + entry.get('fixed', '')
        # 動態注入陣營判斷指南（僅 import_scenario 需要，資料來自 ship_registry.json）
        if function_name == 'import_scenario':
            from utils.ship_registry import generate_faction_guide
            prompt += generate_faction_guide()
        return prompt
    return None


class LLMService:
    """
    LLM 服務類別
    用途：提供統一的 LLM 調用介面，透過 Provider 抽象層與不同的 LLM API 互動
    """

    def __init__(self):
        """初始化 LLM 服務"""
        pass

    def _get_provider(self, provider_name=None):
        """取得 LLM Provider 實例（可指定 Provider，未指定時使用 active_provider）"""
        return get_provider(provider_name)

    def _call_with_provider(self, function_label, model, system_prompt, user_prompt, tools, provider_name=None):
        """
        統一的 Provider 調用入口（含指數退避重試）

        參數:
            function_label: 功能標籤（用於日誌，例如 "import_scenario"）
            model: 模型名稱
            system_prompt: system prompt
            user_prompt: 使用者輸入
            tools: 工具定義列表
            provider_name: Provider 名稱（可選，未指定時使用 active_provider）

        返回:
            dict: {"tool": str, "parameters": dict} 或 None
        """
        for attempt in range(LLM_MAX_RETRIES + 1):
            try:
                provider = self._get_provider(provider_name)
                result = provider.call_function(
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    tools=tools
                )

                if result:
                    return {
                        "tool": result["function_name"],
                        "parameters": result.get("arguments", {})
                    }

                return None

            except Exception as e:
                if attempt < LLM_MAX_RETRIES:
                    delay = LLM_RETRY_DELAY * (2 ** attempt)
                    logger.warning("[%s] 第 %d 次嘗試失敗，%.1f 秒後重試: %s", function_label, attempt + 1, delay, e)
                    time.sleep(delay)
                else:
                    logger.error("[%s] 重試 %d 次後仍失敗: %s: %s", function_label, LLM_MAX_RETRIES, type(e).__name__, e)

        return None

    def call_import_scenario(self, user_prompt, model=None, custom_prompt=None, provider_name=None):
        """
        場景匯入參數提取（Function Calling）
        用途：從用戶指令中提取要在地圖上標示的船艦資訊

        參數:
            user_prompt: 用戶輸入的提示詞（例如："繪製052D座標"）
            model: LLM 模型名稱（預設使用 config.DEFAULT_LLM_MODEL）
            custom_prompt: 自定義的 system prompt（可選）

        返回:
            dict: {"tool": "import_scenario", "parameters": {"enemy": [...], "roc": [...]}} 或 None
        """
        model = model or DEFAULT_LLM_MODEL
        system_prompt = custom_prompt or _get_default_prompt('import_scenario')

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "import_scenario",
                    "description": "提取軍事船艦的陣營和名稱，用於在地圖上標示船艦位置",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "enemy": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "解放軍/敵軍船艦列表。如果用戶要求「所有敵軍」則傳空陣列[]。如果指令未提到敵軍則不要包含此欄位。"
                            },
                            "roc": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "國軍/我軍船艦列表。如果用戶要求「所有我軍」則傳空陣列[]。如果指令未提到我軍則不要包含此欄位。"
                            }
                        },
                        "required": []
                    }
                }
            }
        ]

        return self._call_with_provider("import_scenario", model, system_prompt, user_prompt, tools, provider_name=provider_name)

    def call_star_scenario(self, user_prompt, model=None, custom_prompt=None, provider_name=None):
        """
        識別是否為啟動模擬指令（Function Calling）
        用途：判斷用戶是否要求啟動軍事兵棋推演模擬

        參數:
            user_prompt: 用戶輸入的提示詞（例如："開始進行兵推"）
            model: LLM 模型名稱（預設使用 config.DEFAULT_LLM_MODEL）
            custom_prompt: 自定義的 system prompt（可選）

        返回:
            dict: {"tool": "star_scenario", "parameters": {}} 或 {"tool": "unknown", "parameters": {}}
        """
        model = model or DEFAULT_LLM_MODEL
        system_prompt = custom_prompt or _get_default_prompt('star_scenario')

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "star_scenario",
                    "description": "啟動軍事兵棋推演模擬，執行CMO武器分派演算",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                }
            }
        ]

        result = self._call_with_provider("star_scenario", model, system_prompt, user_prompt, tools, provider_name=provider_name)

        # star_scenario 特殊處理：無法識別時返回 unknown 而非 None
        if not result:
            return {"tool": "unknown", "parameters": {}}

        return result

    def call_get_wta(self, user_prompt, model=None, custom_prompt=None, provider_name=None):
        """
        提取武器分派查詢參數（Function Calling）
        用途：從用戶指令中提取要查詢武器分派結果的敵方船艦

        參數:
            user_prompt: 用戶輸入的提示詞（例如："查看052D的武器分派"）
            model: LLM 模型名稱（預設使用 config.DEFAULT_LLM_MODEL）
            custom_prompt: 自定義的 system prompt（可選）

        返回:
            dict: {"tool": "get_wta", "parameters": {"enemy": [...]}} 或 None
        """
        model = model or DEFAULT_LLM_MODEL
        system_prompt = custom_prompt or _get_default_prompt('get_wta')

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "get_wta",
                    "description": "查詢並繪製武器分派結果（攻擊配對線）",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "enemy": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "要查詢的敵方船艦列表。如果查詢所有敵軍則傳空陣列[]。"
                            },
                            "wta_table_row": {
                                "type": "array",
                                "items": {"type": "integer"},
                                "description": "要查詢的武器分派表列編號（id）列表。例如用戶說「第3筆」則傳 [3]，「第3、4、10筆」則傳 [3, 4, 10]。"
                            }
                        }
                    }
                }
            }
        ]

        return self._call_with_provider("get_wta", model, system_prompt, user_prompt, tools, provider_name=provider_name)

    def call_get_track(self, user_prompt, model=None, custom_prompt=None, provider_name=None):
        """
        航跡繪製指令識別（Function Calling）
        用途：判斷用戶是否要求顯示船艦航跡/軌跡

        參數:
            user_prompt: 用戶輸入的提示詞（例如："顯示航跡"）
            model: LLM 模型名稱（預設使用 config.DEFAULT_LLM_MODEL）
            custom_prompt: 自定義的 system prompt（可選）

        返回:
            dict: {"tool": "get_track", "parameters": {}} 或 None
        """
        model = model or DEFAULT_LLM_MODEL
        system_prompt = custom_prompt or _get_default_prompt('get_track')

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "get_track",
                    "description": "獲取並繪製所有船艦的航行軌跡",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "required": []
                    }
                }
            }
        ]

        return self._call_with_provider("get_track", model, system_prompt, user_prompt, tools, provider_name=provider_name)

    def call_get_answer(self, user_prompt, model=None, custom_prompt=None, provider_name=None):
        """
        提取 RAG 問題（Function Calling）
        用途：從用戶的軍事相關問題中提取完整問題，準備查詢知識庫

        參數:
            user_prompt: 用戶輸入的問題（例如："雄三飛彈的射程是多少？"）
            model: LLM 模型名稱（預設使用 config.DEFAULT_LLM_MODEL）
            custom_prompt: 自定義的 system prompt（可選）

        返回:
            dict: {"tool": "get_answer", "parameters": {"question": "..."}} 或 None
        """
        model = model or DEFAULT_LLM_MODEL
        system_prompt = custom_prompt or _get_default_prompt('get_answer')

        tools = [
            {
                "type": "function",
                "function": {
                    "name": "get_answer",
                    "description": "查詢軍事知識資料庫以回答軍事相關問題",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "question": {
                                "type": "string",
                                "description": "用戶的完整問題，原封不動"
                            }
                        },
                        "required": ["question"]
                    }
                }
            }
        ]

        return self._call_with_provider("get_answer", model, system_prompt, user_prompt, tools, provider_name=provider_name)
