const express = require('express');
const path = require('path');
const fs = require('fs');
const { TwitterApi } = require('twitter-api-v2');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'posts.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 認証情報（環境変数またはUIから設定）
let credentials = {
  apiKey: process.env.X_API_KEY || '',
  apiSecret: process.env.X_API_SECRET || '',
  accessToken: process.env.X_ACCESS_TOKEN || '',
  accessSecret: process.env.X_ACCESS_SECRET || '',
};

let posts = loadPosts();
const scheduledTimers = {};

function loadPosts() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('posts.json の読み込みに失敗:', e.message);
  }
  return [];
}

function savePosts() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2));
  } catch (e) {
    console.error('posts.json の保存に失敗:', e.message);
  }
}

function getTwitterClient() {
  const { apiKey, apiSecret, accessToken, accessSecret } = credentials;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error('X API の認証情報が設定されていません');
  }
  return new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken,
    accessSecret,
  });
}

async function postTweet(postId) {
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  try {
    const client = getTwitterClient();
    const result = await client.v2.tweet(post.content);
    post.status = 'posted';
    post.postedAt = new Date().toISOString();
    post.tweetId = result.data.id;
    console.log(`[投稿成功] tweet_id=${post.tweetId}`);
  } catch (e) {
    post.status = 'failed';
    post.error = e.message;
    console.error(`[投稿失敗] ${e.message}`);
  }

  if (scheduledTimers[postId]) {
    clearTimeout(scheduledTimers[postId]);
    delete scheduledTimers[postId];
  }
  savePosts();
}

function schedulePost(post) {
  if (post.status !== 'scheduled' || !post.scheduledAt) return;

  const scheduledTime = new Date(post.scheduledAt);
  const delay = scheduledTime - Date.now();

  if (delay <= 0) {
    postTweet(post.id);
    return;
  }

  scheduledTimers[post.id] = setTimeout(() => postTweet(post.id), delay);
  console.log(`[スケジュール設定] id=${post.id} 投稿予定=${post.scheduledAt}`);
}

// 起動時に pending スケジュール投稿を再スケジュール
posts.filter((p) => p.status === 'scheduled').forEach(schedulePost);

// ─── API ─────────────────────────────────────────────

// 認証情報の確認
app.get('/api/credentials/check', (_req, res) => {
  const { apiKey, apiSecret, accessToken, accessSecret } = credentials;
  res.json({ configured: !!(apiKey && apiSecret && accessToken && accessSecret) });
});

// 認証情報の保存
app.post('/api/credentials', (req, res) => {
  const { apiKey, apiSecret, accessToken, accessSecret } = req.body;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return res.status(400).json({ error: '全ての認証情報を入力してください' });
  }
  credentials = { apiKey, apiSecret, accessToken, accessSecret };
  res.json({ success: true });
});

// 認証情報のテスト
app.post('/api/credentials/test', async (_req, res) => {
  try {
    const client = getTwitterClient();
    const me = await client.v2.me();
    res.json({ success: true, username: me.data.username });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 投稿一覧取得
app.get('/api/posts', (_req, res) => {
  res.json([...posts].reverse());
});

// 投稿作成（即時 or スケジュール）
app.post('/api/posts', async (req, res) => {
  const { content, scheduledAt } = req.body;

  if (!content || content.trim() === '') {
    return res.status(400).json({ error: '投稿内容を入力してください' });
  }
  if (content.length > 280) {
    return res.status(400).json({ error: '投稿内容は280文字以内にしてください' });
  }

  const post = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    content: content.trim(),
    createdAt: new Date().toISOString(),
    scheduledAt: scheduledAt || null,
    status: scheduledAt ? 'scheduled' : 'pending',
    postedAt: null,
    tweetId: null,
    error: null,
  };

  posts.push(post);
  savePosts();

  if (scheduledAt) {
    schedulePost(post);
    return res.json(post);
  }

  // 即時投稿
  try {
    const client = getTwitterClient();
    const result = await client.v2.tweet(post.content);
    post.status = 'posted';
    post.postedAt = new Date().toISOString();
    post.tweetId = result.data.id;
    savePosts();
    res.json(post);
  } catch (e) {
    post.status = 'failed';
    post.error = e.message;
    savePosts();
    res.status(500).json({ error: e.message, post });
  }
});

// スケジュール投稿のキャンセル
app.delete('/api/posts/:id', (req, res) => {
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: '投稿が見つかりません' });
  if (post.status !== 'scheduled') {
    return res.status(400).json({ error: 'スケジュール済みの投稿のみキャンセルできます' });
  }

  if (scheduledTimers[post.id]) {
    clearTimeout(scheduledTimers[post.id]);
    delete scheduledTimers[post.id];
  }
  post.status = 'cancelled';
  savePosts();
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`X 自動投稿アプリ起動 → http://localhost:${PORT}`);
});
