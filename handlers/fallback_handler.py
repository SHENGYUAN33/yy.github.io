"""
Fallback 處理器模組
用途：當 LLM 不可用或解析失敗時，提供基於規則的後備解析邏輯
"""
import re

from config import (
    ENEMY_KEYWORDS, ROC_KEYWORDS, ENEMY_SHIP_NAMES, ROC_SHIP_NAMES,
    SIMULATION_START_KEYWORDS, WTA_KEYWORDS, TRACK_KEYWORDS, QUESTION_MARKERS
)


class FallbackHandler:
    """
    Fallback 處理器類別
    用途：提供規則式解析作為 LLM 的後備方案，確保系統在 LLM 失效時仍能運作
    """

    @staticmethod
    def fallback_import_scenario(user_input):
        """
        場景匯入的 Fallback 規則解析
        用途：當 LLM 無法解析時，使用關鍵字匹配來提取船艦資訊

        參數:
            user_input: 用戶輸入的指令

        返回:
            dict: {"tool": "import_scenario", "parameters": {...}} 或 None
        """
        params = {}

        # 檢查是否提到解放軍/敵軍
        has_enemy_keyword = any(keyword in user_input for keyword in ENEMY_KEYWORDS)

        if has_enemy_keyword:
            if '所有' in user_input or '全部' in user_input or '態勢' in user_input:
                params['enemy'] = []
            else:
                ships = []
                for ship in ENEMY_SHIP_NAMES:
                    if ship in user_input:
                        ships.append(ship)
                if ships:
                    params['enemy'] = ships

        # 檢查是否提到國軍
        has_roc_keyword = any(keyword in user_input for keyword in ROC_KEYWORDS)

        if has_roc_keyword:
            if '所有' in user_input or '全部' in user_input or '態勢' in user_input:
                params['roc'] = []
            else:
                ships = []
                for ship in ROC_SHIP_NAMES:
                    if ship in user_input:
                        ships.append(ship)
                if ships:
                    params['roc'] = ships

        if params:
            return {'tool': 'import_scenario', 'parameters': params}
        return None

    @staticmethod
    def fallback_star_scenario(user_input):
        """
        啟動模擬的 Fallback 規則
        用途：根據關鍵字判斷是否為啟動兵推模擬的指令

        參數:
            user_input: 用戶輸入的指令

        返回:
            dict: {"tool": "star_scenario", "parameters": {}} 或 None
        """
        if any(keyword in user_input for keyword in SIMULATION_START_KEYWORDS):
            return {'tool': 'star_scenario', 'parameters': {}}
        return None

    @staticmethod
    def fallback_get_wta(user_input):
        """
        武器分派的 Fallback 規則
        用途：根據關鍵字判斷是否為查詢武器分派的指令

        支援兩種查詢模式（對齊中科院 API）：
        1. enemy: 按敵艦名稱查詢
        2. wta_table_row: 按列編號（id）查詢

        參數:
            user_input: 用戶輸入的指令

        返回:
            dict: {"tool": "get_wta", "parameters": {...}} 或 None
        """
        # 中文數字 → 阿拉伯數字對照
        cn_num_map = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
                      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}

        if any(keyword in user_input for keyword in WTA_KEYWORDS):
            # 優先檢查是否為按列編號查詢
            # 支援格式：「第1筆」「第一筆」「第3,4,10筆」「編號3」
            row_ids = []

            # 模式1: 「第3,4,10筆」逗號分隔數字
            comma_pattern = r'第\s*([\d,，\s]+)\s*[筆列條]'
            comma_match = re.search(comma_pattern, user_input)
            if comma_match:
                nums_str = comma_match.group(1)
                row_ids = [int(n.strip()) for n in re.split(r'[,，\s]+', nums_str) if n.strip().isdigit()]

            # 模式2: 「第一筆」中文數字
            if not row_ids:
                cn_pattern = r'第\s*([一二三四五六七八九十]+)\s*[筆列條]'
                cn_matches = re.findall(cn_pattern, user_input)
                for cn in cn_matches:
                    if cn in cn_num_map:
                        row_ids.append(cn_num_map[cn])

            # 模式3: 「第3筆」「第8筆」個別出現
            if not row_ids:
                single_pattern = r'第\s*(\d+)\s*[筆列條]|編號\s*(\d+)'
                single_matches = re.findall(single_pattern, user_input)
                row_ids = [int(m[0] or m[1]) for m in single_matches]

            if row_ids:
                return {'tool': 'get_wta', 'parameters': {'wta_table_row': row_ids}}

            # 否則按敵艦名稱查詢
            params = {'enemy': []}
            for ship in ENEMY_SHIP_NAMES:
                if ship in user_input:
                    params['enemy'].append(ship)

            return {'tool': 'get_wta', 'parameters': params}
        return None

    @staticmethod
    def fallback_get_answer(user_input):
        """
        RAG 問答的 Fallback 規則
        用途：根據問號或疑問詞判斷是否為問答請求

        參數:
            user_input: 用戶輸入的問題

        返回:
            dict: {"tool": "get_answer", "parameters": {"question": "..."}} 或 None
        """
        # 如果有問號或疑問詞，視為問答
        if any(marker in user_input for marker in QUESTION_MARKERS):
            return {'tool': 'get_answer', 'parameters': {'question': user_input}}
        return None

    @staticmethod
    def fallback_get_track(user_input):
        """
        航跡繪製的 Fallback 規則
        用途：根據關鍵字判斷是否為顯示航跡的指令

        參數:
            user_input: 用戶輸入的指令

        返回:
            dict: {"tool": "get_track", "parameters": {}} 或 None
        """
        if any(keyword in user_input for keyword in TRACK_KEYWORDS):
            return {'tool': 'get_track', 'parameters': {}}
        return None
