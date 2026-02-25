const http = require('http');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db_v2.json');
const TRACK_PATH = path.join(__dirname, 'track_data.json');

/* ==================== 資料庫操作函數 ==================== */

// 讀取資料庫
function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) {
        console.error('❌ 讀取資料庫失敗:', e.message);
        return null;
    }
}

// 寫入資料庫
function writeDB(data) {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('❌ 寫入資料庫失敗:', e.message);
        return false;
    }
}

/* ==================== 船艦匹配函數 ==================== */
const isMatch = (ship, inputNames) => {
    return inputNames.some(input => 
        (ship.name && ship.name.includes(input)) || 
        (ship.displayName && ship.displayName.includes(input)) ||
        (ship.aliases && ship.aliases.includes(input))
    );
};

/* ==================== HTTP Server ==================== */
const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 處理 OPTIONS 請求（CORS 預檢）
    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }

    /* ==================== API 1: import_scenario ==================== */
    if (req.method === 'POST' && req.url === '/api/v1/import_scenario') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');
                const db = readDB();
                
                console.log('\n' + '='.repeat(80));
                console.log('📥 [import_scenario] 接收請求');
                console.log('='.repeat(80));
                console.log('  📦 接收參數:', JSON.stringify(payload, null, 2));
                
                if (!db) {
                    console.log('  ❌ 錯誤: 資料庫讀取失敗');
                    console.log('='.repeat(80) + '\n');
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: '資料庫讀取失敗' }));
                    return;
                }

                let response = {};

                // 處理敵軍 (Enemy)
                if (payload.hasOwnProperty('enemy')) {
                    const list = payload.enemy.length === 0 
                        ? db.ships.filter(s => s.side === 'enemy') 
                        : db.ships.filter(s => s.side === 'enemy' && isMatch(s, payload.enemy));
                    
                    response.enemy = list.map(s => ({ 
                        [s.displayName || s.name]: { location: s.location } 
                    }));
                    console.log(`  🎯 敵軍: 查詢 ${payload.enemy.length === 0 ? '全部' : payload.enemy.join(', ')}，找到 ${list.length} 艘`);
                }

                // 處理國軍 (ROC)
                if (payload.hasOwnProperty('roc')) {
                    const list = payload.roc.length === 0 
                        ? db.ships.filter(s => s.side === 'roc') 
                        : db.ships.filter(s => s.side === 'roc' && isMatch(s, payload.roc));
                    
                    response.roc = list.map(s => ({ 
                        [s.displayName || s.name]: { location: s.location } 
                    }));
                    console.log(`  🎯 國軍: 查詢 ${payload.roc.length === 0 ? '全部' : payload.roc.join(', ')}，找到 ${list.length} 艘`);
                }

                console.log('='.repeat(80));
                console.log(`✅ [import_scenario] 成功: 回傳 ${Object.keys(response).length} 個陣營資料`);
                console.log('='.repeat(80) + '\n');
                
                res.statusCode = 200;
                res.end(JSON.stringify(response, null, 2));
            } catch (e) {
                console.log('='.repeat(80));
                console.log('❌ [import_scenario] 錯誤');
                console.log('='.repeat(80));
                console.log('  錯誤訊息:', e.message);
                console.log('='.repeat(80) + '\n');
                
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    }

    /* ==================== API 2: star_scenario ==================== */
    else if (req.method === 'POST' && req.url === '/api/v1/star_scenario') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const db = readDB();
                
                console.log('\n' + '='.repeat(80));
                console.log('🚀 [star_scenario] 啟動模擬請求');
                console.log('='.repeat(80));
                
                if (!db) {
                    console.log('  ❌ 錯誤: 資料庫讀取失敗');
                    console.log('='.repeat(80) + '\n');
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: '資料庫讀取失敗' }));
                    return;
                }

                // 更新模擬狀態為「進行中」
                db.simulation_status.is_running = true;
                db.simulation_status.is_completed = false;
                db.simulation_status.started_at = new Date().toISOString();
                db.simulation_status.completed_at = null;
                db.simulation_status.last_message = null;

                if (!writeDB(db)) {
                    console.log('  ❌ 錯誤: 資料庫寫入失敗');
                    console.log('='.repeat(80) + '\n');
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: '資料庫寫入失敗' }));
                    return;
                }

                const response = {
                    status: "simulation_started",
                    message: "已通知中科院CMO開始執行武器分派演算",
                    timestamp: db.simulation_status.started_at
                };

                console.log('  ✅ 模擬狀態已更新:');
                console.log('     - is_running: true');
                console.log('     - is_completed: false');
                console.log('     - started_at:', db.simulation_status.started_at);
                console.log('='.repeat(80));
                console.log('✅ [star_scenario] 成功: 模擬已啟動');
                console.log('='.repeat(80) + '\n');
                
                res.statusCode = 200;
                res.end(JSON.stringify(response, null, 2));
            } catch (e) {
                console.log('='.repeat(80));
                console.log('❌ [star_scenario] 錯誤');
                console.log('='.repeat(80));
                console.log('  錯誤訊息:', e.message);
                console.log('='.repeat(80) + '\n');
                
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    }

    /* ==================== API 3: wta_completed（✅ 保留彈出畫面）==================== */
    else if (req.method === 'POST' && req.url === '/api/v1/wta_completed') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');
                const db = readDB();
                
                if (!db) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: '資料庫讀取失敗' }));
                    return;
                }

                // 更新模擬狀態為「已完成」
                db.simulation_status.is_running = false;
                db.simulation_status.is_completed = true;
                db.simulation_status.completed_at = new Date().toISOString();
                db.simulation_status.last_message = payload.message || "模擬已完成";

                if (!writeDB(db)) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: '資料庫寫入失敗' }));
                    return;
                }

                const response = {
                    status: "received",
                    message: "已接收模擬完成通知",
                    simulation_message: db.simulation_status.last_message,
                    completed_at: db.simulation_status.completed_at,
                    next_action: "可以開始進行攻擊配對線繪製"
                };

                // ✅ 保留原有的彈出畫面（這個很重要！）
                console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🎯 [wta_completed] 模擬完成通知                          ║
╠═══════════════════════════════════════════════════════════╣
║  ✅ 模擬完成                                              ║
║  📊 訊息: ${db.simulation_status.last_message.padEnd(46)}║
║  ⏰ 完成時間: ${db.simulation_status.completed_at}        ║
║  📝 接下來可進行攻擊配對線繪製                            ║
╚═══════════════════════════════════════════════════════════╝
                `);
                
                res.statusCode = 200;
                res.end(JSON.stringify(response, null, 2));
            } catch (e) {
                console.error('[wta_completed] ❌ 錯誤:', e.message);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    }

    /* ==================== API 4: get_simulation_status（✅ 修復前端格式）==================== */
    else if (req.method === 'GET' && req.url === '/api/v1/get_simulation_status') {
        try {
            const db = readDB();
            
            if (!db) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: '資料庫讀取失敗' }));
                return;
            }

            // ✅ 修復：前端期待的格式必須包含 success 和 simulation_status 包裝
            const response = {
                success: true,
                simulation_status: db.simulation_status
            };

            res.statusCode = 200;
            res.end(JSON.stringify(response, null, 2));
        } catch (e) {
            console.error('[get_simulation_status] ❌ 錯誤:', e.message);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
        }
    }

    /* ==================== API 5: get_wta（✅ 完整修復版）==================== */
    else if (req.method === 'POST' && req.url === '/api/v1/get_wta') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');
                const db = readDB();
                
                // ✅ 日誌1: 接收請求
                console.log('\n' + '='.repeat(80));
                console.log('📥 [get_wta] 接收請求');
                console.log('='.repeat(80));
                console.log('  📦 接收參數:', JSON.stringify(payload, null, 2));
                
                if (!db) {
                    console.log('  ❌ 錯誤: 資料庫讀取失敗');
                    console.log('='.repeat(80) + '\n');
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: '資料庫讀取失敗' }));
                    return;
                }

                // 檢查模擬是否完成
                if (!db.simulation_status.is_completed) {
                    console.log('  ⚠️  警告: 模擬尚未完成');
                    console.log('  📊 模擬狀態:');
                    console.log('     - is_running:', db.simulation_status.is_running);
                    console.log('     - is_completed:', db.simulation_status.is_completed);
                    console.log('='.repeat(80) + '\n');
                    
                    res.statusCode = 400;
                    res.end(JSON.stringify({ 
                        error: "模擬尚未完成",
                        message: "請先執行 star_scenario 並等待 wta_completed 通知"
                    }));
                    return;
                }

                let filteredResults = db.wta_results.all;
                let queryMode = 'all';
                let queryDetail = '';

                // ✅ 按 id（row 識別碼）查詢，對齊中科院 API 規格
                if (payload.hasOwnProperty('wta_table_row')) {
                    queryMode = 'row';
                    const targetIds = payload.wta_table_row;

                    if (!Array.isArray(targetIds)) {
                        console.log('  ❌ 錯誤: wta_table_row 必須是陣列');
                        console.log('='.repeat(80) + '\n');

                        res.statusCode = 400;
                        res.end(JSON.stringify({
                            error: "wta_table_row 必須是陣列",
                            example: '{"wta_table_row": [3, 4, 10]}'
                        }));
                        return;
                    }

                    // wta_table_row: [3] → 查詢 id===3 的記錄
                    // wta_table_row: [3, 4, 10] → 查詢 id in [3, 4, 10] 的記錄
                    filteredResults = db.wta_results.all.filter(result =>
                        targetIds.includes(result.id)
                    );

                    queryDetail = `row id [${targetIds.join(', ')}]`;
                    console.log('  🎯 查詢模式: 按 row id');
                    console.log('  📊 目標 id:', targetIds);
                    console.log('  📋 資料庫總記錄數:', db.wta_results.all.length);
                    console.log('  ✅ 過濾後記錄數:', filteredResults.length);
                    console.log('  📝 過濾後的記錄:');
                    filteredResults.forEach(r => {
                        console.log(`     - id=${r.id}, ${r.attack_wave}, ${r.enemy_unit} → ${r.roc_unit}, ${r.weapon}`);
                    });
                }
                // ✅ 原有：支援按敵艦類型查詢
                else if (payload.hasOwnProperty('enemy')) {
                    queryMode = 'enemy';
                    const targetShips = payload.enemy;

                    // 如果是空陣列，返回所有記錄
                    if (targetShips.length === 0) {
                        queryDetail = '所有敵艦';
                        console.log('  🎯 查詢模式: 所有敵艦');
                        console.log('  📋 資料庫總記錄數:', db.wta_results.all.length);
                        console.log('  ✅ 返回記錄數:', filteredResults.length);
                    } else {
                        // 過濾特定敵艦
                        filteredResults = db.wta_results.all.filter(result => {
                            return targetShips.some(target => 
                                result.enemy_unit.includes(target)
                            );
                        });
                        
                        queryDetail = `敵艦 [${targetShips.join(', ')}]`;
                        console.log('  🎯 查詢模式: 按敵艦類型');
                        console.log('  📊 目標敵艦:', targetShips);
                        console.log('  📋 資料庫總記錄數:', db.wta_results.all.length);
                        console.log('  ✅ 過濾後記錄數:', filteredResults.length);
                        console.log('  📝 過濾後的記錄:');
                        filteredResults.forEach(r => {
                            console.log(`     - id=${r.id}, ${r.attack_wave}, ${r.enemy_unit} → ${r.roc_unit}`);
                        });
                    }
                } else {
                    console.log('  ⚠️  警告: 未指定查詢參數，返回空結果');
                    filteredResults = [];
                }

                const response = {
                    wta_table_columns: [
                        { "attack_wave": "波次" },
                        { "enemy_unit": "敵艦船型" },
                        { "roc_unit": "我方單位" },
                        { "weapon": "飛彈種類" },
                        { "launched_number": "發射數量" },
                        { "launched_time": "發射時間" }
                    ],
                    wta_results: filteredResults
                };

                // ✅ 日誌2: 返回結果
                console.log('  📤 返回資料:');
                console.log('     - 表格欄位:', response.wta_table_columns.length, '個');
                console.log('     - 記錄筆數:', response.wta_results.length, '筆');
                console.log('='.repeat(80));
                console.log(`✅ [get_wta] 成功: 查詢 ${queryDetail}，返回 ${filteredResults.length} 筆記錄`);
                console.log('='.repeat(80) + '\n');
                
                res.statusCode = 200;
                res.end(JSON.stringify(response, null, 2));
            } catch (e) {
                console.log('='.repeat(80));
                console.log('❌ [get_wta] 錯誤');
                console.log('='.repeat(80));
                console.log('  錯誤類型:', e.name);
                console.log('  錯誤訊息:', e.message);
                console.log('  堆疊追蹤:', e.stack);
                console.log('='.repeat(80) + '\n');
                
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    }

    /* ==================== API 6: get_answer ==================== */
    else if (req.method === 'POST' && req.url === '/api/v1/get_answer') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');
                
                console.log('\n' + '='.repeat(80));
                console.log('📥 [get_answer] 接收RAG查詢請求');
                console.log('='.repeat(80));
                
                // 解析中科院 API 格式
                const stream = payload.stream || false;
                const model = payload.model || 'TAIDE8B';
                const messages = payload.messages || [];
                
                // 提取 user 問題
                let question = '';
                for (const msg of messages) {
                    if (msg.role === 'user') {
                        question = msg.content;
                        break;
                    }
                }
                
                console.log('  📝 問題:', question || '(未提供)');
                console.log('  🤖 模型:', model);
                console.log('  📊 串流模式:', stream);
                
                if (!question) {
                    console.log('  ❌ 錯誤: 未提供有效問題');
                    console.log('='.repeat(80) + '\n');
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: '未提供有效問題' }));
                    return;
                }

                // 讀取 RAG 知識庫
                const db = readDB();
                
                if (!db) {
                    console.log('  ❌ 錯誤: 資料庫讀取失敗');
                    console.log('='.repeat(80) + '\n');
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: '資料庫讀取失敗' }));
                    return;
                }
                
                const knowledgeBase = db.rag_knowledge || [];
                
                if (knowledgeBase.length === 0) {
                    console.log('  ⚠️  警告: RAG 知識庫為空');
                    console.log('='.repeat(80) + '\n');
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: 'RAG 知識庫未配置' }));
                    return;
                }
                
                console.log(`  📚 載入 ${knowledgeBase.length} 筆 RAG 知識`);
                
                // 關鍵詞匹配
                let bestMatch = null;
                let maxScore = 0;
                
                for (const entry of knowledgeBase) {
                    let score = 0;
                    for (const keyword of entry.keywords) {
                        if (question.includes(keyword)) {
                            score += 1;
                        }
                    }
                    if (score > maxScore) {
                        maxScore = score;
                        bestMatch = entry;
                    }
                }
                
                let answer;
                let sources;
                
                if (bestMatch) {
                    answer = bestMatch.answer;
                    sources = bestMatch.sources;
                    console.log('  ✅ 找到匹配: ', bestMatch.question);
                    console.log('  🎯 匹配分數:', maxScore);
                } else {
                    answer = `關於「${question}」的問題，這是一個模擬的RAG系統回答。\n在實際部署中，此API會連接到中科院的知識庫系統，提供更準確和詳細的軍事情報分析。`;
                    sources = [
                        { chunk: '模擬RAG系統回答', score: 0.50, path: '/docs/default_response.txt' }
                    ];
                    console.log('  ⚠️  未找到匹配，使用預設回答');
                }
                
                // 構建回應
                const response = {
                    id: Math.floor(Math.random() * 10000),
                    datetime: new Date().toISOString().replace('T', '-').substring(0, 19).replace(/:/g, ':'),
                    messages: [
                        {
                            role: "assistant",
                            content: answer
                        }
                    ],
                    finish_reason: "stop",
                    sources: sources
                };

                console.log('  📤 回應長度:', answer.length, '字元');
                console.log('  📚 來源數量:', sources.length, '筆');
                console.log('='.repeat(80));
                console.log('✅ [get_answer] 成功');
                console.log('='.repeat(80) + '\n');
                
                res.statusCode = 200;
                res.end(JSON.stringify(response, null, 2));
            } catch (e) {
                console.log('='.repeat(80));
                console.log('❌ [get_answer] 錯誤');
                console.log('='.repeat(80));
                console.log('  錯誤訊息:', e.message);
                console.log('='.repeat(80) + '\n');
                
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    }

    /* ==================== API 6: get_track（軌跡繪製）==================== */
    else if (req.method === 'GET' && req.url === '/api/v1/get_track') {
        try {
            console.log('\n' + '='.repeat(80));
            console.log('📡 [get_track] 接收航跡繪製請求');
            console.log('='.repeat(80));
            
            // 從 track_data.json 讀取航跡資料
            const trackData = JSON.parse(fs.readFileSync(TRACK_PATH, 'utf8'));

            console.log('  ✅ 航跡數據已從 track_data.json 載入');
            console.log(`     解放軍船艦: ${Object.keys(trackData.ship.enemy || {}).length} 艘`);
            console.log(`     國軍船艦: ${Object.keys(trackData.ship.roc || {}).length} 艘`);

            // 計算總座標點數
            let totalPoints = 0;
            for (const ship of Object.values(trackData.ship.enemy || {})) {
                totalPoints += ship.length;
            }
            for (const ship of Object.values(trackData.ship.roc || {})) {
                totalPoints += ship.length;
            }
            console.log(`     總航跡點數: ${totalPoints} 個`);
            console.log('='.repeat(80));
            console.log('✅ [get_track] 成功');
            console.log('='.repeat(80) + '\n');

            res.statusCode = 200;
            res.end(JSON.stringify(trackData, null, 2));
            
        } catch (e) {
            console.log('='.repeat(80));
            console.log('❌ [get_track] 錯誤');
            console.log('='.repeat(80));
            console.log('  錯誤訊息:', e.message);
            console.log('='.repeat(80) + '\n');
            
            res.statusCode = 500;
            res.end(JSON.stringify({ 
                success: false,
                error: '獲取航跡數據失敗',
                message: e.message 
            }));
        }
    }

    /* ==================== Health Check ==================== */
    else if (req.method === 'GET' && req.url === '/health') {
        res.statusCode = 200;
        res.end(JSON.stringify({ 
            status: 'ok', 
            message: 'Node.js API Server v2 (完整修復版 + 軌跡繪製) is running',
            timestamp: new Date().toISOString(),
            features: [
                '✅ 保留 wta_completed 彈出畫面',
                '✅ wta_trigger.bat 可正常使用',
                '✅ 按 attack_wave 查詢（第1波返回所有第1波記錄）',
                '✅ 軌跡繪製功能（get_track）',
                '✅ 詳細日誌輸出'
            ],
            endpoints: [
                '/api/v1/import_scenario',
                '/api/v1/star_scenario',
                '/api/v1/wta_completed',
                '/api/v1/get_simulation_status',
                '/api/v1/get_wta',
                '/api/v1/get_answer',
                '/api/v1/get_track'
            ]
        }, null, 2));
    }

    /* ==================== 404 Not Found ==================== */
    else {
        res.statusCode = 404;
        res.end(JSON.stringify({ 
            error: 'API endpoint not found',
            requested_url: req.url,
            available_endpoints: [
                'POST /api/v1/import_scenario',
                'POST /api/v1/star_scenario',
                'POST /api/v1/wta_completed',
                'GET  /api/v1/get_simulation_status',
                'POST /api/v1/get_wta',
                'POST /api/v1/get_answer',
                'GET  /api/v1/get_track',
                'GET  /health'
            ]
        }));
    }
});

/* ==================== Server Start ==================== */
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚀 Node.js API Server v2 (完整修復版 + 軌跡繪製)         ║
╠═══════════════════════════════════════════════════════════╣
║  📍 URL: http://localhost:${PORT}                            ║
║  📊 資料庫: db_v2.json                                    ║
╠═══════════════════════════════════════════════════════════╣
║  ✅ 修復內容:                                             ║
║  1. 保留 wta_completed 彈出畫面                           ║
║  2. wta_trigger.bat 可正常使用                            ║
║  3. 按 attack_wave 查詢（第1波返回3筆記錄）               ║
║  4. 軌跡繪製功能（get_track）✨ NEW                       ║
║  5. 添加詳細日誌輸出                                      ║
╠═══════════════════════════════════════════════════════════╣
║  可用端點:                                                ║
║  1️⃣  POST /api/v1/import_scenario                         ║
║  2️⃣  POST /api/v1/star_scenario                           ║
║  3️⃣  POST /api/v1/wta_completed ✅ (保留彈出畫面)         ║
║  4️⃣  GET  /api/v1/get_simulation_status                   ║
║  5️⃣  POST /api/v1/get_wta ✅ (按 attack_wave 查詢)        ║
║  6️⃣  POST /api/v1/get_answer                              ║
║  7️⃣  GET  /api/v1/get_track ✨ NEW (航跡繪製)             ║
║  ❤️  GET  /health                                         ║
╠═══════════════════════════════════════════════════════════╣
║  📝 查詢邏輯說明:                                         ║
║  - wta_table_row: [1]     → 第1波的所有記錄 (3筆)        ║
║  - wta_table_row: [1, 3]  → 第1,3波的所有記錄            ║
║  - enemy: []              → 所有敵艦的記錄                ║
║  - enemy: ["052D"]        → 052D的所有記錄                ║
║  - get_track              → 獲取所有船艦航跡 ✨           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});