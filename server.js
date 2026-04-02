const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'miyahira2024';
const DATA_FILE = path.join(__dirname, 'data.json');

// --- データ管理 ---
let waitCount = 0;
let lastUpdated = new Date().toISOString();

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      waitCount = data.count || 0;
      lastUpdated = data.lastUpdated || new Date().toISOString();
    }
  } catch (e) {
    console.error('データファイル読み込みエラー:', e.message);
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ count: waitCount, lastUpdated }, null, 2), 'utf-8');
  } catch (e) {
    console.error('データファイル保存エラー:', e.message);
  }
}

loadData();

// --- ミドルウェア ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- SSE クライアント管理 ---
const sseClients = new Set();

function broadcastSSE() {
  const data = JSON.stringify({ count: waitCount, lastUpdated });
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

// --- API エンドポイント ---

// 現在のステータス取得
app.get('/api/status', (req, res) => {
  res.json({ count: waitCount, lastUpdated });
});

// SSE 接続
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // 初回データ送信
  res.write(`data: ${JSON.stringify({ count: waitCount, lastUpdated })}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// 待ち人数更新（スタッフ用）
app.post('/api/update', (req, res) => {
  const { password, count, delta } = req.body;

  if (password !== STAFF_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが正しくありません' });
  }

  if (typeof count === 'number') {
    waitCount = Math.max(0, Math.floor(count));
  } else if (typeof delta === 'number') {
    waitCount = Math.max(0, waitCount + Math.floor(delta));
  } else {
    return res.status(400).json({ error: '無効なリクエストです' });
  }

  lastUpdated = new Date().toISOString();
  saveData();
  broadcastSSE();

  res.json({ count: waitCount, lastUpdated });
});

// ヘルスチェック（Render用）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', count: waitCount });
});

// --- サーバー起動 ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 宮平医院 待ち人数システム起動`);
  console.log(`   患者ページ:   http://localhost:${PORT}/`);
  console.log(`   スタッフページ: http://localhost:${PORT}/staff.html`);
  console.log(`   ポート: ${PORT}`);
});
