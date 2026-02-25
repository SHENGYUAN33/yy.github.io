"""
船艦註冊表模組
用途：載入 ship_registry.json 並生成衍生資料（關鍵字列表、陣營判斷指南文字）
單一資料來源 (Single Source of Truth) 的存取層
"""
import json
import os
import logging

logger = logging.getLogger(__name__)

_REGISTRY_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'ship_registry.json'
)
_registry_cache = None


def _load_registry():
    """載入並快取 ship_registry.json"""
    global _registry_cache
    if _registry_cache is None:
        try:
            with open(_REGISTRY_FILE, 'r', encoding='utf-8') as f:
                _registry_cache = json.load(f)
            logger.info("[ship_registry] Loaded: %s", _REGISTRY_FILE)
        except Exception as e:
            logger.warning("[ship_registry] Cannot load ship_registry.json: %s", e)
            _registry_cache = {"roc": {"faction_terms": [], "additional_keywords": [], "ships": []},
                               "enemy": {"faction_terms": [], "additional_keywords": [], "ships": []}}
    return _registry_cache


def reload_registry():
    """強制重新載入（用於熱更新場景）"""
    global _registry_cache
    _registry_cache = None
    return _load_registry()


def _dedupe(items):
    """去重並保持順序"""
    seen = set()
    result = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def get_enemy_keywords():
    """
    生成 ENEMY_KEYWORDS 列表（廣義，用於指令中的陣營判斷）
    包含：陣營通稱 + 所有敵方船艦 name + aliases + additional_keywords
    """
    reg = _load_registry()
    enemy = reg['enemy']
    keywords = list(enemy['faction_terms'])
    for ship in enemy['ships']:
        keywords.append(ship['name'])
        keywords.extend(ship.get('aliases', []))
    keywords.extend(enemy.get('additional_keywords', []))
    return _dedupe(keywords)


def get_roc_keywords():
    """
    生成 ROC_KEYWORDS 列表（廣義，用於指令中的陣營判斷）
    包含：陣營通稱 + 中文艦名 + 舷號 + 英文艦名 + aliases + additional_keywords
    """
    reg = _load_registry()
    roc = reg['roc']
    keywords = list(roc['faction_terms'])
    # 中文艦名
    for ship in roc['ships']:
        if ship.get('chinese_name'):
            keywords.append(ship['chinese_name'])
    # additional_keywords（如 PGG, 批居居, 成功級）
    keywords.extend(roc.get('additional_keywords', []))
    # 舷號
    for ship in roc['ships']:
        if ship.get('hull_number'):
            keywords.append(ship['hull_number'])
    # 英文艦名
    for ship in roc['ships']:
        keywords.append(ship['name'])
    return _dedupe(keywords)


def get_enemy_ship_names():
    """
    生成 ENEMY_SHIP_NAMES 列表（窄義，用於 fallback 船艦提取）
    包含：所有敵方船艦 name + aliases（不含陣營通稱）
    """
    reg = _load_registry()
    enemy = reg['enemy']
    names = []
    for ship in enemy['ships']:
        names.append(ship['name'])
        names.extend(ship.get('aliases', []))
    return _dedupe(names)


def get_roc_ship_names():
    """
    生成 ROC_SHIP_NAMES 列表（窄義，用於 fallback 船艦提取）
    包含：中文艦名 + 舷號 + 英文艦名 + additional_keywords（不含陣營通稱）
    """
    reg = _load_registry()
    roc = reg['roc']
    names = []
    # 中文艦名
    for ship in roc['ships']:
        if ship.get('chinese_name'):
            names.append(ship['chinese_name'])
    # additional_keywords（如 PGG, 批居居, 成功級）— 用於 fallback 匹配
    names.extend(roc.get('additional_keywords', []))
    # 舷號
    for ship in roc['ships']:
        if ship.get('hull_number'):
            names.append(ship['hull_number'])
    # 英文艦名
    for ship in roc['ships']:
        names.append(ship['name'])
    return _dedupe(names)


def lookup_ship_info(ship_name, faction=None):
    """
    根據船艦名稱查找完整資訊（支援 name / chinese_name / hull_number / alias）

    參數:
        ship_name: 船艦名稱（英文名、中文名、舷號或別名）
        faction: 限定陣營 ('roc' / 'enemy')，None 表示全搜

    返回:
        dict: {'faction': str, 'ship_class': str, 'weapons': list, ...} 或 None
    """
    reg = _load_registry()
    name_lower = ship_name.lower().strip() if ship_name else ''
    if not name_lower:
        return None

    factions = [faction] if faction else ['roc', 'enemy']

    for fac in factions:
        section = reg.get(fac, {})
        for ship in section.get('ships', []):
            # ROC 船艦欄位較多
            if fac == 'roc':
                candidates = [
                    (ship.get('name') or '').lower(),
                    (ship.get('chinese_name') or '').lower(),
                    (ship.get('hull_number') or '').lower(),
                ]
            else:
                candidates = [
                    (ship.get('name') or '').lower(),
                ] + [(a or '').lower() for a in ship.get('aliases', [])]

            if name_lower in candidates:
                result = dict(ship)
                result['faction'] = fac
                return result

    return None


def generate_faction_guide():
    """
    生成陣營判斷指南文字區塊，用於動態注入到 import_scenario 的 system prompt 中

    返回:
        str: 格式化的陣營判斷指南文字
    """
    reg = _load_registry()

    # 敵方船艦列表
    enemy = reg['enemy']
    enemy_items = []
    for ship in enemy['ships']:
        enemy_items.append(ship['name'])
    enemy_items.extend(enemy.get('additional_keywords', []))
    enemy_str = ', '.join(enemy_items)

    # 國軍船艦列表（順序：中文艦名 → additional → 舷號 → 英文艦名）
    roc = reg['roc']
    roc_items = []
    for ship in roc['ships']:
        if ship.get('chinese_name'):
            roc_items.append(ship['chinese_name'])
    roc_items.extend(roc.get('additional_keywords', []))
    for ship in roc['ships']:
        if ship.get('hull_number'):
            roc_items.append(ship['hull_number'])
    for ship in roc['ships']:
        roc_items.append(ship['name'])
    roc_str = ', '.join(_dedupe(roc_items))

    return (
        f"\n\n【陣營判斷指南】\n"
        f"- 解放軍船艦: {enemy_str}\n"
        f"- 國軍船艦: {roc_str}\n"
        f"- 如果不確定編號歸屬，根據用戶指令中的陣營關鍵字判斷"
    )
