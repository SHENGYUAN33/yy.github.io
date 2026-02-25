"""
LLM Providers 模組
用途：Provider 工廠，根據配置建立對應的 LLM Provider 實例
"""
from .base_provider import BaseLLMProvider
from .ollama_provider import OllamaProvider
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider

# Provider 名稱 → 類別映射
_PROVIDER_MAP = {
    'ollama': OllamaProvider,
    'openai': OpenAIProvider,
    'anthropic': AnthropicProvider,
}

# Provider 實例快取（避免重複建立）
_provider_cache = {}


def create_provider(provider_name, config):
    """
    根據 Provider 名稱和配置建立 Provider 實例

    參數:
        provider_name (str): Provider 名稱（"ollama", "openai", "anthropic"）
        config (dict): Provider 設定字典

    返回:
        BaseLLMProvider: Provider 實例

    例外:
        ValueError: 不支援的 Provider 名稱
    """
    provider_cls = _PROVIDER_MAP.get(provider_name)
    if not provider_cls:
        raise ValueError(f"不支援的 LLM Provider: '{provider_name}'。支援的 Provider: {list(_PROVIDER_MAP.keys())}")

    return provider_cls(config)


def get_provider(provider_name=None):
    """
    取得 Provider 實例（含快取）

    參數:
        provider_name (str, optional): Provider 名稱。
            若未指定，從 system_config.json 的 active_provider 讀取。

    返回:
        BaseLLMProvider: Provider 實例
    """
    from services.config_loader import get_active_provider_name, get_active_provider_config, get_provider_config

    if provider_name is None:
        provider_name = get_active_provider_name()

    # 檢查快取
    if provider_name in _provider_cache:
        return _provider_cache[provider_name]

    # 取得 Provider 設定
    if provider_name == get_active_provider_name():
        config = get_active_provider_config()
    else:
        config = get_provider_config(provider_name)

    if not config:
        raise ValueError(f"找不到 Provider '{provider_name}' 的配置")

    provider = create_provider(provider_name, config)
    _provider_cache[provider_name] = provider

    print(f"✅ 已建立 LLM Provider: {provider_name} ({config.get('name', '')})")
    return provider


def clear_provider_cache():
    """清除 Provider 快取（供配置重載時使用）"""
    global _provider_cache
    _provider_cache = {}


__all__ = [
    'BaseLLMProvider',
    'OllamaProvider',
    'OpenAIProvider',
    'AnthropicProvider',
    'create_provider',
    'get_provider',
    'clear_provider_cache',
]
