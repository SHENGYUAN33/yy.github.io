"""
API 模式切換服務
用途：根據 system_config.json 的 api_mode 設定，決定資料來源（real API / local Node.js / mock）
"""
import requests
import json
import os
import logging

from services.config_loader import get_api_mode, get_real_api_config, get_local_api_config, get_local_data_config

logger = logging.getLogger(__name__)


class APIModeService:
    """
    API 模式切換服務

    根據 api_mode 決定資料來源：
    - real: 呼叫中科院真實 API
    - local: 呼叫本地 Node.js mock server（server_v2_fixed.js）
    - mock: 返回預定義的 mock 回應（從 mock_responses/ 目錄讀取）
    """

    @staticmethod
    def call_api(endpoint_key, json_data=None, method='POST'):
        """
        統一 API 呼叫入口

        參數:
            endpoint_key (str): 端點名稱（"import_scenario", "star_scenario", "get_wta", "get_answer", "get_track"）
            json_data (dict, optional): 請求資料
            method (str): HTTP 方法（預設 POST）

        返回:
            Response: API 回應（requests.Response 或 _LocalResponse）

        例外:
            requests.exceptions.Timeout: API 超時
            requests.exceptions.ConnectionError: 無法連接
            Exception: 其他錯誤
        """
        api_mode = get_api_mode()

        logger.info("[API Mode: %s] 呼叫端點: %s", api_mode, endpoint_key)

        if api_mode == 'real':
            return APIModeService._call_http_api(get_real_api_config(), endpoint_key, json_data, method)
        elif api_mode == 'local':
            return APIModeService._call_http_api(get_local_api_config(), endpoint_key, json_data, method)
        elif api_mode == 'mock':
            return APIModeService._get_mock_response(endpoint_key, json_data)
        else:
            logger.warning("未知的 API 模式: %s，回退到 local", api_mode)
            return APIModeService._call_http_api(get_local_api_config(), endpoint_key, json_data, method)

    @staticmethod
    def _call_http_api(api_config, endpoint_key, json_data=None, method='POST'):
        """
        統一的 HTTP API 呼叫（real 和 local 共用）

        real 模式：呼叫中科院 API（real_api 配置）
        local 模式：呼叫本地 Node.js server（local_api 配置）
        """
        base_url = api_config.get('base_url', 'http://localhost:3000/api/v1')
        timeout = api_config.get('timeout', 300)
        endpoints = api_config.get('endpoints', {})

        endpoint_path = endpoints.get(endpoint_key, f'/{endpoint_key}')
        url = f"{base_url}{endpoint_path}"

        logger.info("   URL: %s", url)
        logger.info("   Timeout: %ss", timeout)
        if json_data:
            logger.info("   Request Body: %s", json.dumps(json_data, ensure_ascii=False))

        headers = {'Content-Type': 'application/json'}

        # Postman Mock Server 需要此 header 才會依 request body 匹配不同 example
        # get_answer 不需要 body 匹配（每次的 system_prompt 和 user 輸入都不同，回應格式固定）
        # 僅 POST 且有 body 時才啟用，GET 無 body 會導致 Mock Server 匹配失敗
        BODY_MATCH_ENDPOINTS = {'import_scenario', 'star_scenario', 'get_wta', 'get_track'}
        if 'mock.pstmn.io' in base_url and method.upper() == 'POST' and json_data and endpoint_key in BODY_MATCH_ENDPOINTS:
            headers['x-mock-match-request-body'] = 'true'

        logger.info("   Method: %s", method.upper())

        if method.upper() == 'POST':
            response = requests.post(url, json=json_data, headers=headers, timeout=timeout)
        elif method.upper() == 'GET':
            response = requests.get(url, params=json_data, headers=headers, timeout=timeout)
        else:
            raise ValueError(f"不支援的 HTTP 方法: {method}")

        logger.info("   Response Status: %s", response.status_code)
        logger.info("   Response Body: %s", response.text[:1000])

        return response

    @staticmethod
    def call_api_stream(endpoint_key, json_data=None):
        """
        串流 API 呼叫（僅 real 模式支援）

        參數:
            endpoint_key (str): 端點名稱
            json_data (dict, optional): 請求資料

        返回:
            requests.Response (stream=True) 或 None（非 real 模式時回傳 None，由呼叫端降級為模擬串流）
        """
        api_mode = get_api_mode()

        if api_mode != 'real':
            logger.info("[API Mode: %s] 不支援串流，將使用模擬串流", api_mode)
            return None

        api_config = get_real_api_config()
        base_url = api_config.get('base_url', '')
        timeout = api_config.get('timeout', 300)
        endpoints = api_config.get('endpoints', {})
        endpoint_path = endpoints.get(endpoint_key, f'/{endpoint_key}')
        url = f"{base_url}{endpoint_path}"

        logger.info("[API Mode: real / Stream] 呼叫端點: %s", endpoint_key)
        logger.info("   URL: %s", url)
        logger.info("   Timeout: %ss", timeout)

        headers = {'Content-Type': 'application/json'}

        response = requests.post(
            url, json=json_data, headers=headers,
            timeout=timeout, stream=True
        )

        logger.info("   Response Status: %s", response.status_code)
        return response

    @staticmethod
    def _get_mock_response(endpoint_key, json_data=None):
        """
        返回預定義的 Mock 回應

        從 mock_responses/ 目錄讀取對應的 JSON 檔案
        """
        local_config = get_local_data_config()
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        mock_dir = local_config.get('mock_responses_dir', 'mock_responses')
        mock_path = os.path.join(project_root, mock_dir, f'{endpoint_key}_response.json')

        logger.info("   模式: Mock 回應")

        if os.path.exists(mock_path):
            with open(mock_path, 'r', encoding='utf-8') as f:
                mock_data = json.load(f)
            logger.info("   從 %s 載入 Mock 回應", mock_path)
            return _LocalResponse(200, mock_data)

        # 若無 Mock 檔案，返回基本的成功回應
        logger.warning("   Mock 檔案不存在: %s，返回預設回應", mock_path)
        return _LocalResponse(200, {"status": "mock", "message": f"Mock response for {endpoint_key}"})


class _LocalResponse:
    """
    模擬 requests.Response 的物件

    用途：讓 mock 模式的回應格式與 real/local API 的 requests.Response 一致，
    使 route 層程式碼可以統一處理。
    """

    def __init__(self, status_code, data):
        self.status_code = status_code
        self._data = data
        self.text = json.dumps(data, ensure_ascii=False)

    def json(self):
        return self._data
