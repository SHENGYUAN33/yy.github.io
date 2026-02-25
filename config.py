"""
配置檔案 - 集中管理系統所有配置常數
用途：定義 API URL、目錄路徑、飛彈顏色映射、地圖參數等全域配置
支持 .env 環境變數覆寫
"""
import json
import os
import threading
from dotenv import load_dotenv

# 載入 .env 環境變數（如果 .env 檔案存在）
load_dotenv()

# ==================== 環境模式 ====================
# development（預設）| production
ENV = os.getenv('ENV', 'development')

# ==================== 伺服器配置 ====================
# Flask 開發伺服器綁定位址和端口
FLASK_HOST = os.getenv('FLASK_HOST', '0.0.0.0')
FLASK_PORT = int(os.getenv('FLASK_PORT', '5000'))
_debug_default = 'True' if ENV == 'development' else 'False'
FLASK_DEBUG = os.getenv('FLASK_DEBUG', _debug_default).lower() in ('true', '1', 'yes')

# ==================== API 配置 ====================
# Ollama LLM API 端點 URL
OLLAMA_URL = os.getenv('OLLAMA_URL', 'http://localhost:11434/api/chat')

# Node.js 後端 API 基礎 URL
NODE_API_BASE = os.getenv('NODE_API_BASE', 'http://localhost:3000/api/v1')

# ==================== LLM 預設配置 ====================
# 預設 LLM 模型名稱
DEFAULT_LLM_MODEL = os.getenv('DEFAULT_LLM_MODEL', 'llama3.2:3b')

# LLM API 請求超時秒數
LLM_API_TIMEOUT = int(os.getenv('LLM_API_TIMEOUT', '300'))

# 預設 Prompt 配置名稱
DEFAULT_PROMPT_CONFIG = os.getenv('DEFAULT_PROMPT_CONFIG', '預設配置')

# LLM 重試配置
LLM_MAX_RETRIES = int(os.getenv('LLM_MAX_RETRIES', '2'))
LLM_RETRY_DELAY = float(os.getenv('LLM_RETRY_DELAY', '1.0'))

# ==================== RAG 配置 ====================
# RAG 預設模式
RAG_DEFAULT_MODE = os.getenv('RAG_DEFAULT_MODE', 'military_qa')

# RAG 預設 LLM 模型
RAG_DEFAULT_MODEL = os.getenv('RAG_DEFAULT_MODEL', 'TAIDE8B')

# RAG 預設 System Prompt
RAG_DEFAULT_PROMPT = os.getenv('RAG_DEFAULT_PROMPT', '請回答軍事問題')

# RAG 最大來源數量
RAG_MAX_SOURCES = int(os.getenv('RAG_MAX_SOURCES', '5'))

# ==================== 目錄配置 ====================
# 地圖 HTML 檔案儲存目錄
MAP_DIR = os.getenv('MAP_DIR', 'maps')

# 使用者反饋資料儲存目錄
FEEDBACK_DIR = os.getenv('FEEDBACK_DIR', 'feedbacks')

# COP（Common Operational Picture，共同作戰圖像）截圖儲存目錄
COP_DIR = os.getenv('COP_DIR', 'cops')

# 場景存檔儲存目錄
SCENARIO_DIR = os.getenv('SCENARIO_DIR', 'scenarios')

# ==================== 配置檔案路徑 ====================
# SYSTEM PROMPT 配置檔案路徑（儲存各種 LLM prompt 模板）
PROMPTS_CONFIG_FILE = "prompts_config.json"

# 系統配置檔案路徑（儲存系統設定，如顯示選項等）
CONFIG_FILE = "config.json"

# config.json 預設值（每次啟動時重置用）
CONFIG_DEFAULTS = {
    "show_source_btn": False,
    "enable_animation": False,
    "enable_3d_globe": False,
    "enable_measurement": True,
    "cesium_ion_token": "",
    "google_maps_api_key": "AIzaSyBCFhSG2jtlF2oZyvNnZc0PNyhRZwiahUo",
    "custom_layers": []
}

# ==================== CORS 配置 ====================
# 允許的跨域來源（逗號分隔，設為 * 允許所有來源）
CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:5000,http://127.0.0.1:5000').split(',')

# ==================== 會話管理配置 ====================
# Client ID 最大長度（安全限制）
MAX_CLIENT_ID_LENGTH = int(os.getenv('MAX_CLIENT_ID_LENGTH', '80'))

# 最大並行會話數（超過時觸發清理）
MAX_CONCURRENT_SESSIONS = int(os.getenv('MAX_CONCURRENT_SESSIONS', '200'))

# 每次清理的會話數量
SESSION_CLEANUP_BATCH = int(os.getenv('SESSION_CLEANUP_BATCH', '50'))

# 檔案保留天數（超過此天數的檔案將被清理）
FILE_RETENTION_DAYS = int(os.getenv('FILE_RETENTION_DAYS', '30'))

# ==================== COP 截圖配置 ====================
# Selenium 無頭瀏覽器視窗寬度
SELENIUM_WINDOW_WIDTH = int(os.getenv('SELENIUM_WINDOW_WIDTH', '1920'))

# Selenium 無頭瀏覽器視窗高度
SELENIUM_WINDOW_HEIGHT = int(os.getenv('SELENIUM_WINDOW_HEIGHT', '1080'))

# 頁面載入等待時間（秒）
COP_PAGE_LOAD_WAIT = int(os.getenv('COP_PAGE_LOAD_WAIT', '3'))

# COP 截圖檔名格式
COP_FILENAME_FORMAT = os.getenv('COP_FILENAME_FORMAT', 'COP_%Y%m%d_%H%M%S')

# ==================== 地圖預設配置 ====================
# 地圖中心座標（台灣海峽）
MAP_DEFAULT_CENTER = [23.5, 120.5]

# 預設縮放等級
MAP_DEFAULT_ZOOM = 7

# 地圖圖磚來源
MAP_DEFAULT_TILES = 'OpenStreetMap'

# ==================== 軍事符號配置 ====================
# MIL-STD-2525 符號大小（像素）
MIL_SYMBOL_SIZE = 35

# milsymbol 載入重試次數上限
MIL_SYMBOL_RETRY_MAX = 50

# milsymbol 載入重試間隔（毫秒）
MIL_SYMBOL_RETRY_INTERVAL = 100

# 菱形標記最小尺寸（像素）
DIAMOND_MIN_SIZE = 6

# 圖標尺寸（寬, 高）
ICON_SIZE = (35, 35)

# 圖標錨點（x, y）
ICON_ANCHOR = (17, 17)

# ==================== 航跡配置 ====================
# 航跡線條粗細
TRACK_LINE_WEIGHT = 3

# ==================== 攻擊線配置 ====================
# 靜態攻擊線預設粗細（map_state.py 中使用）
ATTACK_LINE_WEIGHT_DEFAULT = 5

# WTA 攻擊線粗細（map_service.py 中使用）
ATTACK_LINE_WEIGHT_WTA = 4

# 飛彈軌跡線粗細（動畫中使用）
MISSILE_TRAIL_WEIGHT = 5

# ==================== 箭頭配置 ====================
# 箭頭圖標尺寸 [寬, 高]
ARROW_ICON_SIZE = [24, 24]

# 箭頭圖標錨點 [x, y]
ARROW_ICON_ANCHOR = [12, 12]

# ==================== 動畫配置 ====================
# 飛彈飛行時間（毫秒）
MISSILE_FLIGHT_TIME = 2500

# 波次間隔（毫秒）
WAVE_INTERVAL = 1000

# 動畫預設開關
ENABLE_ANIMATION_DEFAULT = True

# ==================== 3D 地球儀配置（完全免費，無需 Token）====================
# 飛彈 3D 弧線最高海拔（公尺）
MISSILE_3D_MAX_ALTITUDE = 50000

# 攻擊弧線採樣點數（越多越平滑，影響效能）
ATTACK_ARC_SEGMENTS = 50

# 3D 軍事符號 Billboard 大小（像素）
MIL_SYMBOL_3D_SIZE = 48

# ==================== 陣營顏色配置 ====================
# 用途：定義不同陣營在地圖上的顯示顏色
FACTION_COLORS = {
    'enemy_marker': 'red',           # 敵方標記顏色（Folium named color）
    'roc_marker': 'blue',            # 我方標記顏色（Folium named color）
    'enemy_track': '#FF5252',        # 敵方航跡顏色
    'roc_track': '#1A237E',          # 我方航跡顏色
    'unknown_track': '#757575',      # 未知陣營航跡顏色
    'default_weapon': '#666666',     # 未知武器預設顏色
}

# ==================== 飛彈顏色映射 ====================
# 用途：在地圖上以不同顏色標示不同類型的飛彈攻擊線
# 格式：飛彈名稱 -> 顏色代碼（HEX）
WEAPON_COLORS = {
    # 雄風三型（紅色系）
    "雄三飛彈": "#FF0000",
    "雄風三型": "#FF0000",
    "雄三": "#FF0000",
    # 標準二型（藍色系）
    "標準二型飛彈": "#0066FF",
    "標準二型": "#0066FF",
    "標準": "#0066FF",
    # 雄風二型（橙色系）
    "雄二飛彈": "#FF6600",
    "雄風二型": "#FF6600",
    "雄二": "#FF6600",
    # 天劍飛彈（紫色）
    "天劍飛彈": "#9900CC",
    "天劍": "#9900CC",
    # 魚叉飛彈（綠色）
    "魚叉飛彈": "#00CC66",
    "魚叉": "#00CC66",
    # 標準三型（品紅色）
    "標準三型": "#FF00FF",
    # 愛國者（黃色）
    "愛國者": "#FFFF00",
    # 海麻雀（青色）
    "海麻雀": "#00FFFF",
    # 英文名稱
    "SM-2": "#0066FF",
    "SM-3": "#FF00FF",
    "Patriot": "#FFFF00",
    "Sea Sparrow": "#00FFFF",
    "Harpoon": "#00CC66",
}

# ==================== WTA 表格配置 ====================
# 表頭背景色
WTA_TABLE_HEADER_BG = '#1e3c72'

# 表格交替行背景色
WTA_TABLE_ALT_ROW_BG = '#f9f9f9'

# ==================== 陣營關鍵字配置 ====================
# 用途：用於 LLM fallback 解析和參數修正
# 資料來源：ship_registry.json（單一資料來源，新增船艦只需編輯該檔案）
# 注意：直接載入 JSON 而非透過 utils.ship_registry，避免與 utils/__init__.py 的循環匯入

def _load_ship_registry():
    """從 ship_registry.json 載入船艦資料（config.py 內部用）"""
    _registry_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ship_registry.json')
    try:
        with open(_registry_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        import logging as _logging
        _logging.getLogger(__name__).warning("Cannot load ship_registry.json: %s", e)
        return {"roc": {"faction_terms": [], "additional_keywords": [], "ships": []},
                "enemy": {"faction_terms": [], "additional_keywords": [], "ships": []}}

def _dedupe_list(items):
    """去重並保持順序"""
    seen = set()
    return [x for x in items if x and x not in seen and not seen.add(x)]

_ship_registry = _load_ship_registry()

# 敵方關鍵字
_enemy = _ship_registry['enemy']
ENEMY_KEYWORDS = _dedupe_list(
    list(_enemy['faction_terms']) +
    [s['name'] for s in _enemy['ships']] +
    [a for s in _enemy['ships'] for a in s.get('aliases', [])] +
    _enemy.get('additional_keywords', [])
)

# 我方關鍵字
_roc = _ship_registry['roc']
ROC_KEYWORDS = _dedupe_list(
    list(_roc['faction_terms']) +
    [s['chinese_name'] for s in _roc['ships'] if s.get('chinese_name')] +
    _roc.get('additional_keywords', []) +
    [s['hull_number'] for s in _roc['ships'] if s.get('hull_number')] +
    [s['name'] for s in _roc['ships']]
)

# 敵方船艦名稱（窄義，用於 fallback 船艦提取）
ENEMY_SHIP_NAMES = _dedupe_list(
    [s['name'] for s in _enemy['ships']] +
    [a for s in _enemy['ships'] for a in s.get('aliases', [])]
)

# 我方船艦名稱（窄義，用於 fallback 船艦提取）
ROC_SHIP_NAMES = _dedupe_list(
    [s['chinese_name'] for s in _roc['ships'] if s.get('chinese_name')] +
    _roc.get('additional_keywords', []) +
    [s['hull_number'] for s in _roc['ships'] if s.get('hull_number')] +
    [s['name'] for s in _roc['ships']]
)

# 啟動模擬關鍵字
SIMULATION_START_KEYWORDS = [
    '開始模擬', '開始進行兵推', '開始戰鬥', '執行CMO兵推',
    '啟動模擬', '開始兵推', '啟動兵推', '進行模擬'
]

# WTA 查詢關鍵字
WTA_KEYWORDS = ['武器分派', '攻擊配對', 'WTA', '分派結果', '攻擊']

# 航跡繪製關鍵字
TRACK_KEYWORDS = [
    '顯示航跡', '顯示軌跡', '繪製航跡', '繪製軌跡',
    '航行軌跡', '航行路徑', '移動路徑', '船艦軌跡', '航跡', '軌跡'
]

# 問答判斷標記（問號/疑問詞）
QUESTION_MARKERS = ['?', '？', '什麼', '如何', '為何', '是否', '請問', '請說明']

# ==================== 會話狀態管理 ====================
# 用途：儲存每個客戶端的地圖狀態（多分頁/多會話隔離）
# 格式：client_id -> {"state": MapState 實例, "last_access": 時間戳}
_STATE_LOCK = threading.Lock()  # 執行緒安全鎖
_STATES = {}

# ==================== 全域模擬狀態（供 real mode 前端輪詢）====================
# 用途：儲存中科院回調的模擬完成狀態，不依賴 Node.js / db_v2.json
_SIMULATION_STATUS = {
    'is_completed': False,
    'last_message': '',
    'completion_time': None
}

# ==================== 初始化函數 ====================
def ensure_directories():
    """
    確保所有必要的目錄存在
    用途：在應用程式啟動時創建必要的目錄結構
    """
    os.makedirs(MAP_DIR, exist_ok=True)
    os.makedirs(FEEDBACK_DIR, exist_ok=True)
    os.makedirs(COP_DIR, exist_ok=True)
    os.makedirs(SCENARIO_DIR, exist_ok=True)
    import logging as _logging
    _logging.getLogger(__name__).info("目錄初始化完成: %s, %s, %s, %s", MAP_DIR, FEEDBACK_DIR, COP_DIR, SCENARIO_DIR)
