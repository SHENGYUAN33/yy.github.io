"""
Ollama LLM Provider
用途：封裝與 Ollama API 的互動邏輯，實作 Function Calling 和 Chat 介面
支援兩種模式：
  1. 原生 tools API（模型支援時優先使用）
  2. Prompt-based JSON 提取（模型不支援 tools 時自動降級）
"""
import requests
import json
import re
from .base_provider import BaseLLMProvider
from utils.parser import parse_function_arguments


class OllamaProvider(BaseLLMProvider):
    """
    Ollama Provider 實作

    Ollama API 格式：
    - 端點: POST {base_url}/api/chat
    - Payload: {"model": str, "messages": list, "tools": list, "stream": bool}
    - 回應: {"message": {"tool_calls": [{"function": {"name": str, "arguments": dict}}]}}

    若模型不支援 tools，自動降級為 Prompt-based JSON 提取模式。
    """

    def _build_prompt_based_system_prompt(self, system_prompt, tools):
        """
        將 tools schema 嵌入 system prompt，用於不支援 tools API 的模型。
        要求模型以純 JSON 格式回應。
        """
        if not tools:
            return system_prompt

        tool_def = tools[0]['function']
        fn_name = tool_def['name']
        params = tool_def.get('parameters', {})
        properties = params.get('properties', {})

        # 建構參數說明
        param_lines = []
        for key, prop in properties.items():
            ptype = prop.get('type', 'string')
            desc = prop.get('description', '')
            if ptype == 'array':
                item_type = prop.get('items', {}).get('type', 'string')
                param_lines.append(f'    "{key}": [{item_type}陣列] // {desc}')
            else:
                param_lines.append(f'    "{key}": {ptype} // {desc}')

        if param_lines:
            params_block = ",\n".join(param_lines)
            json_template = f'{{\n{params_block}\n}}'
        else:
            json_template = '{}'

        injection = (
            f"\n\n【輸出格式要求 - 嚴格遵守】\n"
            f"你必須且只能回覆一個 JSON 物件，不要包含任何其他文字、解釋或 markdown。\n"
            f"函數名稱: {fn_name}\n"
            f"JSON 格式:\n{json_template}\n"
            f"範例: 如果要回傳敵軍船艦 052D，回覆: {{\"enemy\": [\"052D\"]}}\n"
            f"如果沒有相關內容，回覆: {{}}\n"
            f"再次強調：只回覆純 JSON，不要加任何其他文字。"
        )

        return system_prompt + injection

    def _parse_json_from_content(self, content, tools):
        """
        從 LLM 回覆的文字中提取 JSON 物件。
        支援純 JSON、markdown code block 包裹、以及文字混雜 JSON 等情況。
        """
        if not content or not content.strip():
            return None

        text = content.strip()

        # 嘗試 1: 直接解析整段文字
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except (json.JSONDecodeError, ValueError):
            pass

        # 嘗試 2: 提取 markdown code block 中的 JSON
        code_block_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?\s*```', text, re.DOTALL)
        if code_block_match:
            try:
                parsed = json.loads(code_block_match.group(1).strip())
                if isinstance(parsed, dict):
                    return parsed
            except (json.JSONDecodeError, ValueError):
                pass

        # 嘗試 3: 找到第一個 { 到最後一個 } 之間的內容
        brace_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text)
        if brace_match:
            try:
                parsed = json.loads(brace_match.group())
                if isinstance(parsed, dict):
                    return parsed
            except (json.JSONDecodeError, ValueError):
                pass

        return None

    def _normalize_parsed_response(self, parsed, tools):
        """
        正規化 LLM 回傳的畸形 JSON，提取出真正的 function_name 和 arguments。

        處理的畸形格式：
          A: {"tool": "import_scenario", "parameters": {"enemy": [...]}}
          B: {"enemy": [...], "roc": [...]}  （直接就是參數）
          C: {"name": "get_ships", "parameters": {"object": '{"enemy": [], "roc": ["1101"]}'}}
          D: {"name": "xxx", "parameters": {"enemy": [...], "roc": [...]}}
          E: {"function": "xxx", "arguments": {"enemy": [...]}}

        返回: (function_name, arguments) tuple
        """
        if not parsed or not isinstance(parsed, dict):
            return None, None

        expected_fn = tools[0]['function']['name'] if tools else 'unknown'
        expected_keys = set(tools[0]['function'].get('parameters', {}).get('properties', {}).keys()) if tools else set()

        # 格式 A: {"tool": ..., "parameters": ...}
        if 'tool' in parsed:
            fn_name = parsed.get('tool', expected_fn)
            arguments = parsed.get('parameters', {})
            return fn_name, self._unwrap_arguments(arguments, expected_keys)

        # 格式 E: {"function": ..., "arguments": ...}
        if 'function' in parsed and 'arguments' in parsed:
            fn_name = parsed.get('function', expected_fn)
            arguments = parsed.get('arguments', {})
            return fn_name, self._unwrap_arguments(arguments, expected_keys)

        # 格式 C/D: {"name": ..., "parameters": ...}
        if 'name' in parsed and 'parameters' in parsed:
            arguments = parsed.get('parameters', {})
            return expected_fn, self._unwrap_arguments(arguments, expected_keys)

        # 格式 B: 直接就是參數 {"enemy": [...], "roc": [...]}
        if expected_keys and expected_keys.intersection(parsed.keys()):
            return expected_fn, parsed

        # 無法識別但仍是 dict，當作參數嘗試
        return expected_fn, parsed

    def _unwrap_arguments(self, arguments, expected_keys):
        """
        解包被錯誤包裹的參數。
        例如 {"object": '{"enemy": [], "roc": ["1101"]}'} → {"enemy": [], "roc": ["1101"]}
        """
        if not isinstance(arguments, dict):
            return arguments

        # 如果參數中已有期望的 key，直接返回
        if expected_keys and expected_keys.intersection(arguments.keys()):
            return arguments

        # 檢查是否有值是 JSON 字串（被多序列化了一層）
        for key, value in arguments.items():
            if isinstance(value, str):
                try:
                    inner = json.loads(value)
                    if isinstance(inner, dict):
                        # 解開後如果包含期望的 key，就用這個
                        if expected_keys and expected_keys.intersection(inner.keys()):
                            print(f"🔧 解包巢狀 JSON 參數: {key} → {inner}")
                            return inner
                except (json.JSONDecodeError, ValueError):
                    pass

        return arguments

    def _call_prompt_based(self, model, system_prompt, user_prompt, tools, url, effective_timeout):
        """
        Prompt-based Function Calling（不支援 tools API 時的降級方案）
        將 function schema 嵌入 prompt，要求模型回傳 JSON。
        """
        enhanced_prompt = self._build_prompt_based_system_prompt(system_prompt, tools)

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": enhanced_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0
            }
        }

        print(f"🔄 [{self.provider_name}] 改用 Prompt-based JSON 模式...")

        response = requests.post(url, json=payload, timeout=effective_timeout)

        if response.status_code != 200:
            print(f"❌ Ollama Prompt-based API 錯誤 (狀態碼: {response.status_code})")
            print(f"   響應內容: {response.text}")
            return None

        response_data = response.json()
        content = response_data.get('message', {}).get('content', '')
        print(f"📦 Prompt-based 原始回覆: {content}")

        parsed = self._parse_json_from_content(content, tools)
        if parsed:
            fn_name, arguments = self._normalize_parsed_response(parsed, tools)
            if fn_name:
                arguments = parse_function_arguments(arguments or {})
                print(f"✅ Prompt-based 解析成功")
                print(f"   函數: {fn_name}")
                print(f"   參數: {arguments}")

                return {
                    "function_name": fn_name,
                    "arguments": arguments
                }

        print(f"❌ Prompt-based 模式也無法解析 JSON")
        return None

    def call_function(self, model, system_prompt, user_prompt, tools, timeout=None):
        """
        Ollama Function Calling

        優先使用原生 tools API，若模型不支援則自動降級為 Prompt-based 模式。
        """
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "tools": tools,
            "stream": False
        }

        url = self.get_api_url()
        effective_timeout = timeout or self.timeout

        try:
            print(f"🤖 [{self.provider_name}] 正在調用 Function Calling...")
            print(f"   模型: {model}")
            print(f"   API: {url}")

            response = requests.post(url, json=payload, timeout=effective_timeout)

            # 模型不支援 tools → 自動降級為 Prompt-based 模式
            if response.status_code == 400:
                error_text = response.text or ''
                if 'does not support tools' in error_text:
                    print(f"⚠️  模型 {model} 不支援 tools API，自動降級...")
                    return self._call_prompt_based(
                        model, system_prompt, user_prompt, tools, url, effective_timeout
                    )
                # 其他 400 錯誤照舊處理
                print(f"❌ Ollama API 錯誤 (狀態碼: {response.status_code})")
                print(f"   響應內容: {error_text}")
                return None

            if response.status_code != 200:
                print(f"❌ Ollama API 錯誤 (狀態碼: {response.status_code})")
                print(f"   響應內容: {response.text}")
                return None

            response_data = response.json()
            print(f"📦 原始響應: {json.dumps(response_data, ensure_ascii=False, indent=2)}")

            message = response_data.get('message', {})

            # 解析 tool_calls
            if 'tool_calls' in message and len(message['tool_calls']) > 0:
                tool_call = message['tool_calls'][0]
                function_name = tool_call['function']['name']
                arguments = parse_function_arguments(tool_call['function']['arguments'])

                print(f"✅ Function Calling 成功")
                print(f"   函數: {function_name}")
                print(f"   參數: {arguments}")

                return {
                    "function_name": function_name,
                    "arguments": arguments
                }

            # Fallback: 嘗試從 content 解析
            content = message.get('content', '')
            if content:
                parsed = self._parse_json_from_content(content, tools)
                if parsed:
                    fn_name, arguments = self._normalize_parsed_response(parsed, tools)
                    if fn_name:
                        arguments = parse_function_arguments(arguments or {})
                        print(f"⚠️  未使用 Function Calling，從 content 正規化解析")
                        print(f"   原始: {parsed}")
                        print(f"   函數: {fn_name}")
                        print(f"   參數: {arguments}")
                        return {
                            "function_name": fn_name,
                            "arguments": arguments
                        }

            print(f"❌ 無法解析 LLM 響應")
            return None

        except requests.exceptions.Timeout:
            print(f"⏳ LLM 響應超時（可能模型較大或負載高）")
            print(f"   ➤ 將使用 Fallback 規則解析")
            return None
        except Exception as e:
            print(f"❌ LLM 調用錯誤: {type(e).__name__}: {e}")
            return None

    def call_chat(self, model, messages, timeout=None):
        """
        Ollama Chat（非 Function Calling，供 RAG 等場景使用）
        """
        payload = {
            "model": model,
            "messages": messages,
            "stream": False
        }

        url = self.get_api_url()
        effective_timeout = timeout or self.timeout

        try:
            response = requests.post(url, json=payload, timeout=effective_timeout)

            if response.status_code != 200:
                print(f"❌ Ollama Chat API 錯誤 (狀態碼: {response.status_code})")
                return None

            response_data = response.json()
            return response_data.get('message', {}).get('content', '')

        except Exception as e:
            print(f"❌ Ollama Chat 調用錯誤: {type(e).__name__}: {e}")
            return None
