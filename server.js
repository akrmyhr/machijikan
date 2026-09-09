const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// --- データ保存先 ---
// Render の通常のファイルシステムは再デプロイ・再起動のたびに初期化される。
// 永続ディスクをマウントし、DATA_DIR にそのパス（例: /var/data）を指定すると
// お知らせなどのデータが失われなくなる。
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');

// --- スタッフパスワード ---
// パスワードは環境変数 STAFF_PASSWORD からのみ読み込む（ソースには直書きしない）。
// 未設定の場合は推測不能なランダム値を使うため、スタッフログインは事実上できなくなる。
// （患者向けページは通常どおり動作する）
const STAFF_PASSWORD = process.env.STAFF_PASSWORD;
const EFFECTIVE_PASSWORD = STAFF_PASSWORD || crypto.randomBytes(32).toString('hex');

if (!STAFF_PASSWORD) {
  console.warn('⚠️  環境変数 STAFF_PASSWORD が設定されていません。');
  console.warn('   スタッフページにログインできません。Render の環境変数に STAFF_PASSWORD を設定してください。');
}

// --- 入力の上限 ---
const ANNOUNCEMENT_MAX_LENGTH = 200;
const NEWS_TITLE_MAX = 100;
const NEWS_BODY_MAX = 2000;
const NEWS_MAX_POSTS = 100;
const NEWS_CATEGORIES = ['news', 'closure', 'vaccine', 'checkup'];

// --- データ管理 ---
let waitCount = 0;
let clinicStatus = 'closed'; // 'open' | 'closed'
let announcement = '';       // 待合室向けの短い告知（空文字なら非表示）
let newsPosts = [];          // お知らせ記事の配列
let newsUpdatedAt = new Date().toISOString();
let lastUpdated = new Date().toISOString();

// 保存されていた記事を、想定どおりの形にそろえて読み込む
function normalizePost(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!title || !body) return null;

  const now = new Date().toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    title: title.slice(0, NEWS_TITLE_MAX),
    body: body.slice(0, NEWS_BODY_MAX),
    category: NEWS_CATEGORIES.includes(raw.category) ? raw.category : 'news',
    pinned: raw.pinned === true,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now
  };
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const data = JSON.parse(raw);
      waitCount = data.count || 0;
      clinicStatus = data.clinicStatus || 'closed';
      announcement = typeof data.announcement === 'string' ? data.announcement : '';
      newsPosts = Array.isArray(data.newsPosts)
        ? data.newsPosts.map(normalizePost).filter(Boolean)
        : [];
      newsUpdatedAt = data.newsUpdatedAt || new Date().toISOString();
      lastUpdated = data.lastUpdated || new Date().toISOString();
    }
  } catch (e) {
    console.error('データファイル読み込みエラー:', e.message);
  }
}

function saveData() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      count: waitCount,
      clinicStatus,
      announcement,
      newsPosts,
      newsUpdatedAt,
      lastUpdated
    }, null, 2), 'utf-8');
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

// SSE には記事本文は載せず、newsUpdatedAt の変化だけを伝える。
// クライアントはそれを見て /api/news を取り直す。
function getPayload() {
  return { count: waitCount, clinicStatus, announcement, newsUpdatedAt, lastUpdated };
}

function broadcastSSE() {
  const data = JSON.stringify(getPayload());
  for (const res of sseClients) {
    res.write(`data: ${data}\n\n`);
  }
}

// --- 認証 ---
function requireStaff(req, res) {
  const password = req.body && req.body.password;
  if (password !== EFFECTIVE_PASSWORD) {
    res.status(401).json({ error: 'パスワードが正しくありません' });
    return false;
  }
  return true;
}

// 固定表示を先に、その中では新しい順に並べる
function sortedNews() {
  return newsPosts.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// --- API エンドポイント ---

// 現在のステータス取得
app.get('/api/status', (req, res) => {
  res.json(getPayload());
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
  res.write(`data: ${JSON.stringify(getPayload())}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// 待ち人数更新（スタッフ用）
app.post('/api/update', (req, res) => {
  if (!requireStaff(req, res)) return;

  const { count, delta } = req.body;

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

  res.json(getPayload());
});

// 診療ステータス変更（スタッフ用）
app.post('/api/clinic-status', (req, res) => {
  if (!requireStaff(req, res)) return;

  const { status } = req.body;

  if (status !== 'open' && status !== 'closed') {
    return res.status(400).json({ error: '無効なステータスです' });
  }

  clinicStatus = status;

  // 受付終了時は待ち人数を0にリセット
  if (status === 'closed') {
    waitCount = 0;
  }

  lastUpdated = new Date().toISOString();
  saveData();
  broadcastSSE();

  res.json(getPayload());
});

// 告知メッセージ更新（スタッフ用）
app.post('/api/announcement', (req, res) => {
  if (!requireStaff(req, res)) return;

  const { text } = req.body;

  if (typeof text !== 'string') {
    return res.status(400).json({ error: '無効なリクエストです' });
  }

  // 前後の空白を除去し、最大文字数で切り詰める
  announcement = text.trim().slice(0, ANNOUNCEMENT_MAX_LENGTH);

  lastUpdated = new Date().toISOString();
  saveData();
  broadcastSSE();

  res.json(getPayload());
});

// --- お知らせ（記事）API ---

// 一覧取得（公開）
app.get('/api/news', (req, res) => {
  res.json({ posts: sortedNews(), newsUpdatedAt });
});

// 本文・タイトルを検証して取り出す
function readPostInput(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';

  if (!title) return { error: 'タイトルを入力してください' };
  if (!text) return { error: '本文を入力してください' };

  return {
    title: title.slice(0, NEWS_TITLE_MAX),
    body: text.slice(0, NEWS_BODY_MAX),
    category: NEWS_CATEGORIES.includes(body.category) ? body.category : 'news',
    pinned: body.pinned === true
  };
}

// 新規作成（スタッフ用）
app.post('/api/news', (req, res) => {
  if (!requireStaff(req, res)) return;

  if (newsPosts.length >= NEWS_MAX_POSTS) {
    return res.status(400).json({ error: `お知らせは最大${NEWS_MAX_POSTS}件までです。古いものを削除してください。` });
  }

  const input = readPostInput(req.body);
  if (input.error) {
    return res.status(400).json({ error: input.error });
  }

  const now = new Date().toISOString();
  const post = {
    id: crypto.randomUUID(),
    title: input.title,
    body: input.body,
    category: input.category,
    pinned: input.pinned,
    createdAt: now,
    updatedAt: now
  };

  newsPosts.push(post);
  newsUpdatedAt = now;
  saveData();
  broadcastSSE();

  res.status(201).json({ post, posts: sortedNews() });
});

// 更新（スタッフ用）
app.put('/api/news/:id', (req, res) => {
  if (!requireStaff(req, res)) return;

  const post = newsPosts.find((p) => p.id === req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'お知らせが見つかりません' });
  }

  const input = readPostInput(req.body);
  if (input.error) {
    return res.status(400).json({ error: input.error });
  }

  post.title = input.title;
  post.body = input.body;
  post.category = input.category;
  post.pinned = input.pinned;
  post.updatedAt = new Date().toISOString();

  newsUpdatedAt = post.updatedAt;
  saveData();
  broadcastSSE();

  res.json({ post, posts: sortedNews() });
});

// 削除（スタッフ用）
app.delete('/api/news/:id', (req, res) => {
  if (!requireStaff(req, res)) return;

  const index = newsPosts.findIndex((p) => p.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'お知らせが見つかりません' });
  }

  newsPosts.splice(index, 1);
  newsUpdatedAt = new Date().toISOString();
  saveData();
  broadcastSSE();

  res.json({ posts: sortedNews() });
});

// ヘルスチェック（Render用）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', count: waitCount, clinicStatus, news: newsPosts.length });
});

// --- サーバー起動 ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 宮平医院 ホームページ／待ち人数システム起動`);
  console.log(`   トップページ:   http://localhost:${PORT}/`);
  console.log(`   スタッフページ: http://localhost:${PORT}/staff.html`);
  console.log(`   データ保存先:   ${DATA_FILE}`);
  console.log(`   ポート: ${PORT}`);
});
