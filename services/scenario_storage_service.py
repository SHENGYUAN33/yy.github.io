"""
場景儲存服務
用途：將 MapState 狀態序列化至 JSON 檔案，以及從 JSON 檔案還原 MapState
"""
import json
import os
import logging
from datetime import datetime
from config import SCENARIO_DIR

logger = logging.getLogger(__name__)


class ScenarioStorageService:
    """場景存檔與載入"""

    @staticmethod
    def save(map_state, name):
        """
        儲存當前地圖狀態

        參數:
            map_state: MapState 實例
            name: 場景名稱

        返回:
            dict: {"success": True, "filename": str} 或 {"success": False, "error": str}
        """
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"{timestamp}_{name}.json"
            filepath = os.path.join(SCENARIO_DIR, filename)

            data = {
                "name": name,
                "saved_at": datetime.now().isoformat(),
                "state": map_state.to_json()
            }

            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            logger.info("場景已儲存: %s", filepath)
            return {"success": True, "filename": filename}

        except Exception as e:
            logger.error("儲存場景失敗: %s", e)
            return {"success": False, "error": str(e)}

    @staticmethod
    def list_scenarios():
        """
        列出所有已儲存的場景

        返回:
            list: [{"filename": str, "name": str, "saved_at": str}, ...]
        """
        scenarios = []
        try:
            for fname in sorted(os.listdir(SCENARIO_DIR), reverse=True):
                if not fname.endswith('.json'):
                    continue
                filepath = os.path.join(SCENARIO_DIR, fname)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    scenarios.append({
                        "filename": fname,
                        "name": data.get("name", fname),
                        "saved_at": data.get("saved_at", "")
                    })
                except Exception:
                    scenarios.append({"filename": fname, "name": fname, "saved_at": ""})
        except FileNotFoundError:
            pass
        return scenarios

    @staticmethod
    def load(filename, map_state):
        """
        載入場景並還原到 MapState

        參數:
            filename: 場景檔案名稱
            map_state: 要還原到的 MapState 實例

        返回:
            dict: {"success": True} 或 {"success": False, "error": str}
        """
        filepath = os.path.join(SCENARIO_DIR, filename)

        if not os.path.exists(filepath):
            return {"success": False, "error": "檔案不存在"}

        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)

            state = data.get("state", {})

            # 清空現有狀態
            map_state.clear()

            # 還原 markers
            for marker in state.get("markers", []):
                map_state.add_marker(
                    location=marker['location'],
                    popup=marker.get('popup', ''),
                    color=marker.get('color', 'blue'),
                    icon=marker.get('icon', 'ship'),
                    shape=marker.get('shape', 'circle'),
                    layer=marker.get('layer')
                )

            # 還原 lines
            for line in state.get("lines", []):
                map_state.add_line(
                    start_location=line['start'],
                    end_location=line['end'],
                    color=line.get('color', '#666'),
                    popup=line.get('popup', ''),
                    weight=line.get('weight', 8),
                    dash_array=line.get('dash_array'),
                    layer=line.get('layer')
                )

            # 還原 tracks
            for track in state.get("tracks", []):
                map_state.add_track(track, layer=track.get('layer'))

            # 還原動畫資料
            if state.get("wta_animation_data"):
                map_state.wta_animation_data = state["wta_animation_data"]

            logger.info("場景已載入: %s", filename)
            return {"success": True, "name": data.get("name", filename)}

        except Exception as e:
            logger.error("載入場景失敗: %s", e)
            return {"success": False, "error": str(e)}

    @staticmethod
    def delete(filename):
        """
        刪除場景檔案

        參數:
            filename: 場景檔案名稱

        返回:
            dict: {"success": True} 或 {"success": False, "error": str}
        """
        filepath = os.path.join(SCENARIO_DIR, filename)
        if not os.path.exists(filepath):
            return {"success": False, "error": "檔案不存在"}
        try:
            os.remove(filepath)
            logger.info("場景已刪除: %s", filepath)
            return {"success": True}
        except Exception as e:
            logger.error("刪除場景失敗: %s", e)
            return {"success": False, "error": str(e)}
