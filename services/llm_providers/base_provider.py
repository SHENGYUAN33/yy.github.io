"""
LLM Provider 抽象基底類別
用途：定義所有 LLM Provider 必須實作的統一介面
"""
from abc import ABC, abstractmethod


class BaseLLMProvider(ABC):
    """
    LLM Provider 抽象介面

    所有 Provider（Ollama, OpenAI, Anthropic）必須實作此介面。
    tools 參數使用 Ollama 格式作為內部標準，各 Provider 負責自行轉換。
    """

    def __init__(self, config):
        """
        初始化 Provider

        參數:
            config (dict): Provider 設定，來自 system_config.json 的 providers 區塊
                必須包含: base_url, chat_endpoint
                可選: timeout, default_model, api_key_env
        """
        self.base_url = config['base_url']
        self.chat_endpoint = config.get('chat_endpoint', '')
        self.timeout = config.get('timeout', 300)
        self.default_model = config.get('default_model')
        self.provider_name = config.get('name', 'Unknown')

    @abstractmethod
    def call_function(self, model, system_prompt, user_prompt, tools, timeout=None):
        """
        統一的 Function Calling 介面

        參數:
            model (str): 模型 ID（如 "llama3.2:3b", "gpt-4"）
            system_prompt (str): system prompt 文字
            user_prompt (str): 使用者輸入
            tools (list): 工具定義列表（Ollama 格式作為內部標準）
                格式: [{"type": "function", "function": {"name": ..., "description": ..., "parameters": ...}}]
            timeout (int, optional): 請求超時秒數，None 則使用 Provider 預設值

        返回:
            dict: {"function_name": str, "arguments": dict} 或 None（解析失敗時）
        """
        pass

    @abstractmethod
    def call_chat(self, model, messages, timeout=None):
        """
        統一的 Chat 介面（供 RAG 等非 Function Calling 場景使用）

        參數:
            model (str): 模型 ID
            messages (list): 訊息列表 [{"role": "system"|"user"|"assistant", "content": str}]
            timeout (int, optional): 請求超時秒數

        返回:
            str: 模型回覆文字，失敗時返回 None
        """
        pass

    def get_api_url(self):
        """取得完整的 API URL"""
        return f"{self.base_url}{self.chat_endpoint}"
