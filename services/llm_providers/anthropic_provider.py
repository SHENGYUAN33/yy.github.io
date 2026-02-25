"""
Anthropic LLM Provider
用途：封裝與 Anthropic API 的互動邏輯，實作 Function Calling 和 Chat 介面
"""
import requests
import json
import os
from .base_provider import BaseLLMProvider


class AnthropicProvider(BaseLLMProvider):
    """
    Anthropic Provider 實作

    Anthropic API 格式：
    - 端點: POST {base_url}/v1/messages
    - Payload: {"model": str, "max_tokens": int, "system": str, "messages": list, "tools": list}
    - 回應: {"content": [{"type": "tool_use", "name": str, "input": dict}]}
    """

    def __init__(self, config):
        super().__init__(config)
        api_key_env = config.get('api_key_env', 'ANTHROPIC_API_KEY')
        self.api_key = os.getenv(api_key_env, '')
        if not self.api_key:
            print(f"⚠️ Anthropic API Key 未設定（環境變數: {api_key_env}）")

    def _convert_tools_to_anthropic(self, tools):
        """
        將 Ollama 格式的 tools 轉換為 Anthropic 格式

        輸入（Ollama 格式）:
        [{"type": "function", "function": {"name": ..., "description": ..., "parameters": {...}}}]

        輸出（Anthropic 格式）:
        [{"name": ..., "description": ..., "input_schema": {...}}]
        """
        anthropic_tools = []
        for tool in tools:
            if tool.get('type') == 'function':
                func = tool['function']
                anthropic_tools.append({
                    "name": func['name'],
                    "description": func.get('description', ''),
                    "input_schema": func.get('parameters', {"type": "object", "properties": {}})
                })
        return anthropic_tools

    def _parse_tool_use_response(self, response_data):
        """解析 Anthropic 的 tool_use 回應"""
        content_blocks = response_data.get('content', [])

        for block in content_blocks:
            if block.get('type') == 'tool_use':
                return {
                    "function_name": block.get('name', ''),
                    "arguments": block.get('input', {})
                }

        return None

    def call_function(self, model, system_prompt, user_prompt, tools, timeout=None):
        """
        Anthropic Function Calling（Tool Use）
        """
        if not self.api_key:
            print(f"❌ Anthropic API Key 未設定，無法呼叫")
            return None

        anthropic_tools = self._convert_tools_to_anthropic(tools)

        payload = {
            "model": model,
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_prompt}
            ],
            "tools": anthropic_tools
        }

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }

        url = self.get_api_url()
        effective_timeout = timeout or self.timeout

        try:
            print(f"🤖 [{self.provider_name}] 正在調用 Function Calling (Tool Use)...")
            print(f"   模型: {model}")
            print(f"   API: {url}")

            response = requests.post(url, json=payload, headers=headers, timeout=effective_timeout)

            if response.status_code != 200:
                print(f"❌ Anthropic API 錯誤 (狀態碼: {response.status_code})")
                print(f"   響應內容: {response.text}")
                return None

            response_data = response.json()
            print(f"📦 原始響應: {json.dumps(response_data, ensure_ascii=False, indent=2)}")

            result = self._parse_tool_use_response(response_data)

            if result:
                print(f"✅ Function Calling (Tool Use) 成功")
                print(f"   函數: {result['function_name']}")
                print(f"   參數: {result['arguments']}")
                return result

            # Fallback: 嘗試從 text content 解析
            content_blocks = response_data.get('content', [])
            for block in content_blocks:
                if block.get('type') == 'text':
                    text = block.get('text', '')
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, dict) and 'tool' in parsed:
                            print(f"⚠️  未使用 Tool Use，從 text 解析: {parsed}")
                            return {
                                "function_name": parsed.get('tool', ''),
                                "arguments": parsed.get('parameters', {})
                            }
                    except (json.JSONDecodeError, ValueError):
                        pass

            print(f"❌ 無法解析 Anthropic 響應")
            return None

        except requests.exceptions.Timeout:
            print(f"⏳ Anthropic 響應超時")
            return None
        except Exception as e:
            print(f"❌ Anthropic 調用錯誤: {type(e).__name__}: {e}")
            return None

    def call_chat(self, model, messages, timeout=None):
        """
        Anthropic Chat（非 Function Calling）
        """
        if not self.api_key:
            print(f"❌ Anthropic API Key 未設定，無法呼叫")
            return None

        # 從 messages 提取 system prompt（Anthropic 使用獨立 system 欄位）
        system_prompt = ""
        chat_messages = []
        for msg in messages:
            if msg['role'] == 'system':
                system_prompt = msg['content']
            else:
                chat_messages.append(msg)

        payload = {
            "model": model,
            "max_tokens": 4096,
            "messages": chat_messages
        }

        if system_prompt:
            payload["system"] = system_prompt

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json"
        }

        url = self.get_api_url()
        effective_timeout = timeout or self.timeout

        try:
            response = requests.post(url, json=payload, headers=headers, timeout=effective_timeout)

            if response.status_code != 200:
                print(f"❌ Anthropic Chat API 錯誤 (狀態碼: {response.status_code})")
                return None

            response_data = response.json()
            content_blocks = response_data.get('content', [])

            for block in content_blocks:
                if block.get('type') == 'text':
                    return block.get('text', '')

            return None

        except Exception as e:
            print(f"❌ Anthropic Chat 調用錯誤: {type(e).__name__}: {e}")
            return None
