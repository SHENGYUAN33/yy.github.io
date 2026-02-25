"""
系統配置載入模組
用途：載入 system_config.json，提供全域存取函式
支援回退到 config.py 預設值，確保向後相容
"""
import json
import os
import logging

logger = logging.getLogger(__name__)

# 配置檔案路徑（支援 .env 覆寫）
SYSTEM_CONFIG_PATH = os.getenv('SYSTEM_CONFIG_PATH', 'system_config.json')

# 模組級快取（避免每次呼叫都讀檔）
_cached_config = None


def load_system_config(force_reload=False):
    """
    載入系統配置

    參數:
        force_reload: 是否強制重新讀取檔案（忽略快取）

    返回:
        dict: 完整的系統配置字典
    """
    global _cached_config

    if _cached_config is not None and not force_reload:
        return _cached_config

    try:
        if not os.path.exists(SYSTEM_CONFIG_PATH):
            logger.warning("system_config.json 不存在，使用 config.py 預設值")
            _cached_config = _build_default_config()
            return _cached_config

        with open(SYSTEM_CONFIG_PATH, 'r', encoding='utf-8') as f:
            _cached_config = json.load(f)

        logger.info("已載入系統配置: %s", SYSTEM_CONFIG_PATH)
        return _cached_config

    except json.JSONDecodeError as e:
        logger.error("system_config.json 格式錯誤: %s，使用預設值", e)
        _cached_config = _build_default_config()
        return _cached_config
    except Exception as e:
        logger.error("載入 system_config.json 失敗: %s，使用預設值", e)
        _cached_config = _build_default_config()
        return _cached_config


def _build_default_config():
    """
    從 config.py 的現有常數建立預設配置
    確保即使 system_config.json 不存在，系統也能正常運作
    """
    from config import (
        OLLAMA_URL, NODE_API_BASE, DEFAULT_LLM_MODEL, LLM_API_TIMEOUT,
        RAG_DEFAULT_MODE, RAG_DEFAULT_MODEL, RAG_DEFAULT_PROMPT, RAG_MAX_SOURCES
    )

    # 從 OLLAMA_URL 拆分 base_url 和 endpoint
    # 例如 "http://localhost:11434/api/chat" → base_url="http://localhost:11434", endpoint="/api/chat"
    ollama_base = OLLAMA_URL.rsplit('/api/', 1)[0] if '/api/' in OLLAMA_URL else OLLAMA_URL
    ollama_endpoint = '/api/' + OLLAMA_URL.rsplit('/api/', 1)[1] if '/api/' in OLLAMA_URL else '/api/chat'

    return {
        "api_settings": {
            "api_mode": "local",
            "real_api": {
                "base_url": "http://NCSIST_API_HOST/api/v1",
                "timeout": LLM_API_TIMEOUT,
                "endpoints": {
                    "import_scenario": "/import_scenario",
                    "star_scenario": "/star_scenario",
                    "get_wta": "/get_wta",
                    "get_answer": "/get_answer",
                    "get_track": "/get_track"
                }
            },
            "local_api": {
                "base_url": NODE_API_BASE,
                "timeout": LLM_API_TIMEOUT,
                "endpoints": {
                    "import_scenario": "/import_scenario",
                    "star_scenario": "/star_scenario",
                    "get_wta": "/get_wta",
                    "get_answer": "/get_answer",
                    "get_track": "/get_track"
                }
            },
            "local_data": {
                "db_file": "db_v2.json",
                "track_file": "track_data.json",
                "mock_responses_dir": "mock_responses"
            }
        },
        "llm_settings": {
            "active_provider": "ollama",
            "providers": {
                "ollama": {
                    "name": "Ollama",
                    "base_url": ollama_base,
                    "chat_endpoint": ollama_endpoint,
                    "timeout": LLM_API_TIMEOUT,
                    "default_model": DEFAULT_LLM_MODEL,
                    "models": [
                        {"id": DEFAULT_LLM_MODEL, "name": DEFAULT_LLM_MODEL, "speed": "快速", "quality": "良好"}
                    ]
                }
            }
        },
        "rag_settings": {
            "default_mode": RAG_DEFAULT_MODE,
            "default_model": RAG_DEFAULT_MODEL,
            "default_prompt": RAG_DEFAULT_PROMPT,
            "max_sources": RAG_MAX_SOURCES
        }
    }


def get_api_settings():
    """取得 API 設定區塊"""
    config = load_system_config()
    return config.get('api_settings', {})


def get_api_mode():
    """
    取得當前 API 模式

    返回:
        str: "local" | "mock" | "real"
    """
    return get_api_settings().get('api_mode', 'real')


def get_real_api_config():
    """取得中科院 real API 設定（base_url, timeout, endpoints）"""
    return get_api_settings().get('real_api', {})


def get_local_api_config():
    """取得本地 Node.js mock API 設定（base_url, timeout, endpoints）"""
    return get_api_settings().get('local_api', {})


def get_node_api_config():
    """向後相容：指向 local_api 設定"""
    return get_local_api_config()


def get_local_data_config():
    """取得本地資料檔案設定"""
    return get_api_settings().get('local_data', {})


def get_llm_settings():
    """取得 LLM 設定區塊"""
    config = load_system_config()
    return config.get('llm_settings', {})


def get_active_provider_name():
    """
    取得當前啟用的 Provider 名稱

    返回:
        str: "ollama" | "openai" | "anthropic"
    """
    return get_llm_settings().get('active_provider', 'ollama')


def get_active_provider_config():
    """
    取得當前啟用的 Provider 完整設定

    返回:
        dict: Provider 設定（含 base_url, chat_endpoint, timeout, default_model, models 等）
    """
    llm_settings = get_llm_settings()
    provider_name = llm_settings.get('active_provider', 'ollama')
    providers = llm_settings.get('providers', {})

    if provider_name not in providers:
        logger.warning("Provider '%s' 不存在於配置中，回退到 ollama", provider_name)
        provider_name = 'ollama'

    if provider_name not in providers:
        # 最終回退：使用 config.py 預設值
        from config import OLLAMA_URL, DEFAULT_LLM_MODEL, LLM_API_TIMEOUT
        ollama_base = OLLAMA_URL.rsplit('/api/', 1)[0] if '/api/' in OLLAMA_URL else OLLAMA_URL
        ollama_endpoint = '/api/' + OLLAMA_URL.rsplit('/api/', 1)[1] if '/api/' in OLLAMA_URL else '/api/chat'
        return {
            "name": "Ollama",
            "base_url": ollama_base,
            "chat_endpoint": ollama_endpoint,
            "timeout": LLM_API_TIMEOUT,
            "default_model": DEFAULT_LLM_MODEL,
            "models": []
        }

    return providers[provider_name]


def get_provider_config(provider_name):
    """
    取得指定 Provider 的設定

    參數:
        provider_name: Provider 名稱（"ollama", "openai", "anthropic"）

    返回:
        dict: Provider 設定，若不存在則返回 None
    """
    providers = get_llm_settings().get('providers', {})
    return providers.get(provider_name)


def get_rag_settings():
    """取得 RAG 設定區塊"""
    config = load_system_config()
    return config.get('rag_settings', {})


def get_all_providers():
    """
    取得所有已配置的 Provider 資訊（供前端模型選擇器使用）

    返回:
        dict: {provider_name: {name, models, default_model, ...}, ...}
    """
    return get_llm_settings().get('providers', {})


def reload_config():
    """強制重新載入配置（供管理 API 使用）"""
    return load_system_config(force_reload=True)
