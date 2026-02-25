"""
OpenAI LLM Provider
用途：封裝與 OpenAI API 的互動邏輯，實作 Function Calling 和 Chat 介面
"""
import requests
import json
import os
from .base_provider import BaseLLMProvider


class OpenAIProvider(BaseLLMProvider):
    """
    OpenAI Provider 實作

    OpenAI API 格式：
    - 端點: POST {base_url}/v1/chat/completions
    - Payload: {"model": str, "messages": list, "tools": list, "tool_choice": str}
    - 回應: {"choices": [{"message": {"tool_calls": [{"function": {"name": str, "arguments": str}}]}}]}
    """

    def __init__(self, config):
        super().__init__(config)
        # 從環境變數讀取 API Key
        api_key_env = config.get('api_key_env', 'OPENAI_API_KEY')
        self.api_key = os.getenv(api_key_env, '')
        if not self.api_key:
            print(f"⚠️ OpenAI API Key 未設定（環境變數: {api_key_env}）")

    def _convert_tools_to_openai(self, tools):
        """
        將 Ollama 格式的 tools 轉換為 OpenAI 格式

        Ollama 和 OpenAI 的 tools 格式非常相似，主要差異在於：
        - OpenAI 要求 parameters 必須有 "type": "object"
        - OpenAI 使用 "strict" 欄位（可選）

        輸入（Ollama 格式）:
        [{"type": "function", "function": {"name": ..., "description": ..., "parameters": {...}}}]

        輸出（OpenAI 格式）: 格式相同，直接傳入即可
        """
        # Ollama 和 OpenAI 的 tool 格式幾乎一致，直接使用
        return tools

    def _parse_tool_call_response(self, response_data):
        """解析 OpenAI 的 Function Calling 回應"""
        choices = response_data.get('choices', [])
        if not choices:
            return None

        message = choices[0].get('message', {})
        tool_calls = message.get('tool_calls', [])

        if not tool_calls:
            return None

        tool_call = tool_calls[0]
        function_name = tool_call.get('function', {}).get('name', '')
        arguments_str = tool_call.get('function', {}).get('arguments', '{}')

        try:
            arguments = json.loads(arguments_str)
        except (json.JSONDecodeError, ValueError):
            print(f"⚠️ OpenAI Function arguments 解析失敗: {arguments_str}")
            arguments = {}

        return {
            "function_name": function_name,
            "arguments": arguments
        }

    def call_function(self, model, system_prompt, user_prompt, tools, timeout=None):
        """
        OpenAI Function Calling
        """
        if not self.api_key:
            print(f"❌ OpenAI API Key 未設定，無法呼叫")
            return None

        openai_tools = self._convert_tools_to_openai(tools)

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "tools": openai_tools,
            "tool_choice": "required"
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        url = self.get_api_url()
        effective_timeout = timeout or self.timeout

        try:
            print(f"🤖 [{self.provider_name}] 正在調用 Function Calling...")
            print(f"   模型: {model}")
            print(f"   API: {url}")

            response = requests.post(url, json=payload, headers=headers, timeout=effective_timeout)

            if response.status_code != 200:
                print(f"❌ OpenAI API 錯誤 (狀態碼: {response.status_code})")
                print(f"   響應內容: {response.text}")
                return None

            response_data = response.json()
            print(f"📦 原始響應: {json.dumps(response_data, ensure_ascii=False, indent=2)}")

            result = self._parse_tool_call_response(response_data)

            if result:
                print(f"✅ Function Calling 成功")
                print(f"   函數: {result['function_name']}")
                print(f"   參數: {result['arguments']}")
                return result

            # Fallback: 嘗試從 content 解析
            choices = response_data.get('choices', [])
            if choices:
                content = choices[0].get('message', {}).get('content', '')
                if content:
                    try:
                        parsed = json.loads(content)
                        if isinstance(parsed, dict):
                            if 'tool' in parsed:
                                # 格式 A: {"tool": "import_scenario", "parameters": {...}}
                                print(f"⚠️  未使用 Function Calling，從 content 解析: {parsed}")
                                return {
                                    "function_name": parsed.get('tool', ''),
                                    "arguments": parsed.get('parameters', {})
                                }
                            else:
                                # 格式 B: LLM 直接回傳參數 dict，如 {"roc": ["1101"]}
                                expected_fn = tools[0]['function']['name'] if tools else 'unknown'
                                print(f"⚠️  未使用 Function Calling，從 content 推斷函數 '{expected_fn}': {parsed}")
                                return {
                                    "function_name": expected_fn,
                                    "arguments": parsed
                                }
                    except (json.JSONDecodeError, ValueError):
                        pass

            print(f"❌ 無法解析 OpenAI 響應")
            return None

        except requests.exceptions.Timeout:
            print(f"⏳ OpenAI 響應超時")
            return None
        except Exception as e:
            print(f"❌ OpenAI 調用錯誤: {type(e).__name__}: {e}")
            return None

    def call_chat(self, model, messages, timeout=None):
        """
        OpenAI Chat（非 Function Calling）
        """
        if not self.api_key:
            print(f"❌ OpenAI API Key 未設定，無法呼叫")
            return None

        payload = {
            "model": model,
            "messages": messages
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        url = self.get_api_url()
        effective_timeout = timeout or self.timeout

        try:
            response = requests.post(url, json=payload, headers=headers, timeout=effective_timeout)

            if response.status_code != 200:
                print(f"❌ OpenAI Chat API 錯誤 (狀態碼: {response.status_code})")
                return None

            response_data = response.json()
            choices = response_data.get('choices', [])
            if choices:
                return choices[0].get('message', {}).get('content', '')
            return None

        except Exception as e:
            print(f"❌ OpenAI Chat 調用錯誤: {type(e).__name__}: {e}")
            return None
