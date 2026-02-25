"""
配置服務模組
用途：管理 SYSTEM PROMPT 配置和系統配置的載入與保存
"""
import json
import os
import logging
from datetime import datetime
from config import PROMPTS_CONFIG_FILE, CONFIG_FILE, CONFIG_DEFAULTS

logger = logging.getLogger(__name__)


# ==================== SYSTEM PROMPT 配置管理 ====================

def load_prompts_config():
    """
    載入 SYSTEM PROMPT 配置
    用途：從 prompts_config.json 載入所有 LLM prompt 模板配置

    返回:
        dict: 配置字典，包含多組 prompt 配置和預設配置名稱
    """
    if not os.path.exists(PROMPTS_CONFIG_FILE):
        # 如果配置檔案不存在，創建預設配置
        default_config = {
            "prompts": {
                "預設配置": {
                    "name": "預設配置",
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                    "import_scenario": {
                        "editable": "你是一個精確的軍事船艦座標參數提取器。",
                        "fixed": "\\n    【規則】:\\n    1. 僅提取指令中提到的船艦。\\n    2. 中國/解放軍/敵軍 -> enemy, 國軍/我方/中華民國國軍 -> roc。\\n    3. 當指令包含「所有」或「全部」某陣營時，使用空陣列 []。\\n       - 範例: \\\"標示所有解放軍\\\" -> {\\\"enemy\\\": []}\\n       - 範例: \\\"顯示全部國軍\\\" -> {\\\"roc\\\": []}\\n    4. 嚴禁將「解放軍」放入 \\\"roc\\\" 欄位。\\n    5. 嚴禁將「國軍」放入 \\\"enemy\\\" 欄位。\\n    6. **【核心規則】沒提到的陣營，『絕對不要』出現在 JSON 裡！**\\n    7. 提取指令中的船艦名稱時，請「保留原始文字」，不要翻譯成英文。\\n    8. 指令提到「全部」、「所有」、「態勢」、「全覽」且指向特定陣營時：\\n        - 解放軍/敵軍 -> {\\\"enemy\\\": []}\\n        - 國軍/我方 -> {\\\"roc\\\": []}\\n    \\n    【正確範例】:\\n    指令: 繪製解放軍054A和055\\n    輸出: {\\\"tool\\\": \\\"import_scenario\\\", \\\"parameters\\\": {\\\"enemy\\\": [\\\"054A\\\", \\\"055\\\"]}}\\n    \\n    指令: 繪製大型驅逐艦和成功艦\\n    輸出: {\\\"tool\\\": \\\"import_scenario\\\", \\\"parameters\\\": {\\\"enemy\\\": [\\\"大型驅逐艦\\\"], \\\"roc\\\": [\\\"成功艦\\\"]}}\\n    \\n    指令: 標示所有敵軍\\n    輸出: {\\\"tool\\\": \\\"import_scenario\\\", \\\"parameters\\\": {\\\"enemy\\\": []}}\\n    \\n    指令: 顯示1101位置\\n    輸出: {\\\"tool\\\": \\\"import_scenario\\\", \\\"parameters\\\": {\\\"roc\\\": [\\\"1101\\\"]}}\\n    \\n    【錯誤範例 - 嚴禁以下錯誤】:\\n    指令: 繪製PGG\\n    ❌ 錯誤: {\\\"tool\\\": \\\"import_scenario\\\", \\\"parameters\\\": {\\\"enemy\\\": [], \\\"roc\\\": [\\\"PGG\\\"]}}\\n    ✅ 正確: {\\\"tool\\\": \\\"import_scenario\\\", \\\"parameters\\\": {\\\"roc\\\": [\\\"PGG\\\"]}}\\n    說明: 指令只提到我軍，不要出現 enemy 欄位\\n    \\n    指令: 標示所有解放軍\\n    ❌ 錯誤: {\\\"tool\\\": \\\"import_scenario\\\", \\\"parameters\\\": {\\\"enemy\\\": [], \\\"roc\\\": []}}\\n    ✅ 正確: {\\\"tool\\\": \\\"import_scenario\\\", \\\"parameters\\\": {\\\"enemy\\\": []}}\\n    說明: 指令只提到敵軍，不要出現 roc 欄位\\n    \\n    指令: 繪製052D\\n    ❌ 錯誤: {\\\"tool\\\": \\\"import_scenario\\\", \\\"parameters\\\": {\\\"enemy\\\": [\\\"052D\\\"], \\\"roc\\\": []}}\\n    ✅ 正確: {\\\"tool\\\": \\\"import_scenario\\\", \\\"parameters\\\": {\\\"enemy\\\": [\\\"052D\\\"]}}\\n    說明: 指令只提到敵軍，不要出現 roc 欄位"
                    },
                    "star_scenario": {
                        "editable": "你是一個軍事模擬啟動識別器。",
                        "fixed": "\\n    【規則】:\\n    識別以下觸發詞，如果匹配則返回啟動指令：\\n    - \\\"開始模擬\\\"\\n    - \\\"開始進行兵推\\\"\\n    - \\\"開始戰鬥\\\"\\n    - \\\"執行CMO兵推\\\"\\n    - \\\"啟動模擬\\\"\\n    - \\\"開始兵推\\\"\\n    \\n    【範例】:\\n    指令: 開始進行兵推模擬\\n    輸出: {\\\"tool\\\": \\\"star_scenario\\\", \\\"parameters\\\": {}}\\n    \\n    指令: 執行CMO兵推\\n    輸出: {\\\"tool\\\": \\\"star_scenario\\\", \\\"parameters\\\": {}}\\n    \\n    指令: 請幫我分析戰局\\n    輸出: {\\\"tool\\\": \\\"unknown\\\", \\\"parameters\\\": {}}"
                    },
                    "get_wta": {
                        "editable": "你是一個武器分派參數提取器。",
                        "fixed": "\\n    【規則】:\\n    1. 提取要查詢的敵艦參數\\n    2. 「所有」、「全部」、「全部的」-> 空陣列 []\\n    3. 特定船艦名稱 -> 保留原始文字\\n    4. 嚴禁使用 \\\"all\\\" 字串\\n    \\n    【範例】:\\n    指令: 查看所有敵軍的武器分派結果\\n    輸出: {\\\"tool\\\": \\\"get_wta\\\", \\\"parameters\\\": {\\\"enemy\\\": []}}\\n    \\n    指令: 查看052D的武器分派\\n    輸出: {\\\"tool\\\": \\\"get_wta\\\", \\\"parameters\\\": {\\\"enemy\\\": [\\\"052D\\\"]}}\\n    \\n    指令: 顯示054A和055的攻擊配對\\n    輸出: {\\\"tool\\\": \\\"get_wta\\\", \\\"parameters\\\": {\\\"enemy\\\": [\\\"054A\\\", \\\"055\\\"]}}"
                    },
                    "text_generation": {
                        "editable": "你是一位軍事專家，請生成軍事行動準據。行動準據範本如下：\\n支隊行動準據↵\\n任務：<任務內容>↵\\n編組：<編組內容>↵\\n指揮權責：<指揮權責內容>↵",
                        "fixed": "\\n    【規則】:\\n    1. 必須按照範本格式生成\\n    2. 使用專業軍事用語\\n    3. 內容需具體且可執行\\n    \\n    【範例】:\\n    指令: 生成海上巡邏行動準據\\n    輸出: {\\\"tool\\\": \\\"text_generation\\\", \\\"parameters\\\": {\\\"task\\\": \\\"海上巡邏\\\"}}"
                    },
                    "military_rag": {
                        "editable": "你是一位軍事專家，請回答問題。請根據你的知識判斷問答題屬於軍事常識，請直接憑著下答案敘述；如果是邏輯推理，請一步一步思考，寫出推理過程和答案敘述。",
                        "fixed": "\\n    【規則】:\\n    1. 問題提取必須完整\\n    2. 不要修改或翻譯問題\\n    3. 保持原始問題格式\\n    \\n    【範例】:\\n    指令: 雄三飛彈的射程是多少？\\n    輸出: {\\\"tool\\\": \\\"get_answer\\\", \\\"parameters\\\": {\\\"question\\\": \\\"雄三飛彈的射程是多少？\\\"}}\\n    \\n    指令: 請說明掩護的種類\\n    輸出: {\\\"tool\\\": \\\"get_answer\\\", \\\"parameters\\\": {\\\"question\\\": \\\"請說明掩護的種類\\\"}}"
                    }
                }
            },
            "default_config": "預設配置"
        }
        save_prompts_config(default_config)
        return default_config

    with open(PROMPTS_CONFIG_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_prompts_config(config):
    """
    保存 SYSTEM PROMPT 配置
    用途：將配置字典保存到 prompts_config.json

    參數:
        config: 配置字典
    """
    with open(PROMPTS_CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def get_system_prompt(config_name, function_name):
    """
    獲取指定配置和功能的完整 SYSTEM PROMPT
    用途：根據配置名稱和功能名稱，組合完整的 LLM system prompt

    參數:
        config_name: 配置名稱（例如："預設配置"）
        function_name: 功能名稱（例如："import_scenario", "get_wta"）

    返回:
        str: 完整的 system prompt（可編輯部分 + 固定部分），若失敗則返回 None
    """
    logger.info("[System Prompt 獲取]")
    logger.info("  請求配置: %s", config_name)
    logger.info("  請求功能: %s", function_name)

    config = load_prompts_config()

    if config_name not in config['prompts']:
        logger.warning("  配置 '%s' 不存在，切換到預設配置: %s", config_name, config['default_config'])
        config_name = config['default_config']

    prompt_config = config['prompts'][config_name]

    if function_name not in prompt_config:
        logger.error("  錯誤: 功能 '%s' 不存在於配置中", function_name)
        return None

    func_prompt = prompt_config[function_name]
    full_prompt = func_prompt['editable'] + func_prompt['fixed']

    # 動態注入陣營判斷指南（僅 import_scenario 需要，資料來自 ship_registry.json）
    if function_name == 'import_scenario':
        from utils.ship_registry import generate_faction_guide
        full_prompt += generate_faction_guide()

    logger.info("  成功獲取 System Prompt")
    logger.info("  可編輯部分長度: %s 字元", len(func_prompt['editable']))
    logger.info("  固定部分長度: %s 字元", len(func_prompt['fixed']))
    logger.info("  完整 Prompt 長度: %s 字元", len(full_prompt))
    logger.info("  Prompt 內容預覽 (前 200 字): %s...", full_prompt[:200])

    return full_prompt


# ==================== CONFIG.JSON 配置管理（安全版本）====================

def load_config():
    """
    載入系統配置（安全版本，失敗時返回默認值）
    用途：從 config.json 載入系統設定（如顯示選項、動畫開關等）

    返回:
        dict: 配置字典，包含 show_source_btn, enable_animation 等設定
    """
    try:
        if not os.path.exists(CONFIG_FILE):
            # 創建預設配置
            try:
                save_config(CONFIG_DEFAULTS)
            except:
                pass  # 寫入失敗也不影響
            return dict(CONFIG_DEFAULTS)

        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.warning("載入 config.json 失敗: %s，使用預設配置", e)
        return dict(CONFIG_DEFAULTS)


def save_config(config):
    """
    保存系統配置（安全版本，失敗時不中斷）
    用途：將配置字典保存到 config.json

    參數:
        config: 配置字典
    """
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        logger.info("配置已保存到 %s", CONFIG_FILE)
    except Exception as e:
        logger.warning("保存 config.json 失敗: %s", e)
