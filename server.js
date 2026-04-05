const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;
const { TwitterApi } = require('twitter-api-v2');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// ── X (Twitter) クライアント ──────────────────────────────────
function createXClient() {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) return null;
  return new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_TOKEN_SECRET,
  });
}

// ── Anthropic クライアント ────────────────────────────────────
function createAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

// ── スケジュール投稿ストア（メモリ） ─────────────────────────
const scheduledPosts = new Map();
let scheduleIdCounter = 1;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 提案テンプレート定義
const proposalTemplates = {
  it_consulting: {
    name: 'ITコンサルティング',
    sections: ['現状分析', '課題の整理', '提案ソリューション', '導入スケジュール', '費用見積'],
  },
  system_development: {
    name: 'システム開発',
    sections: ['プロジェクト概要', '要件整理', 'システム構成', '開発スケジュール', '費用見積'],
  },
  digital_marketing: {
    name: 'デジタルマーケティング',
    sections: ['市場分析', '現状の課題', '施策提案', '実施スケジュール', '費用見積'],
  },
  cloud_migration: {
    name: 'クラウド移行',
    sections: ['現行インフラ分析', '移行計画', 'アーキテクチャ設計', '移行スケジュール', '費用見積'],
  },
};

// テンプレート一覧取得
app.get('/api/templates', (_req, res) => {
  const list = Object.entries(proposalTemplates).map(([id, t]) => ({
    id,
    name: t.name,
    sections: t.sections,
  }));
  res.json(list);
});

// 提案資料生成
app.post('/api/generate', (req, res) => {
  const { customer, templateId } = req.body;

  if (!customer || !templateId) {
    return res.status(400).json({ error: '顧客情報とテンプレートIDは必須です' });
  }

  const template = proposalTemplates[templateId];
  if (!template) {
    return res.status(400).json({ error: '無効なテンプレートIDです' });
  }

  const proposal = generateProposal(customer, template, templateId);
  res.json(proposal);
});

// ── X 投稿用ツイート生成（Claude） ───────────────────────────
app.post('/api/generate-tweet', async (req, res) => {
  const { proposal } = req.body;
  if (!proposal) return res.status(400).json({ error: 'proposalが必要です' });

  const anthropic = createAnthropicClient();
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY が設定されていません' });
  }

  const solutionSection = proposal.sections.find(
    (s) => s.items && (
      s.title.includes('ソリューション') ||
      s.title.includes('施策') ||
      s.title.includes('アーキテクチャ') ||
      s.title.includes('システム構成')
    )
  );
  const solutionItems = solutionSection
    ? solutionSection.items.slice(0, 3).join('、')
    : '';

  const prompt = `以下の提案資料の概要をもとに、X（Twitter）への投稿文を1つ作成してください。

【提案タイトル】${proposal.title}
【顧客業界】${proposal.customer.industry || '—'}
【主な提案内容】${solutionItems || '詳細は資料をご参照ください'}

【要件】
- 日本語で作成
- 280文字以内（絵文字含む）
- ビジネス向けの専門的なトーン
- 具体的なソリューションや価値を簡潔に伝える
- 末尾に関連ハッシュタグを2〜3個付ける（例: #ITコンサルティング #DX推進）
- 会社名や個人名は含めない（「お客様」などの汎用表現を使う）

投稿文のみ出力してください（説明文や前置きは不要）。`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const tweetText = message.content.find((b) => b.type === 'text')?.text?.trim() || '';
    res.json({ tweetText });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'ツイート生成に失敗しました: ' + err.message });
  }
});

// ── X に即時投稿 ───────────────────────────────────────────────
app.post('/api/post-to-x', async (req, res) => {
  const { tweetText } = req.body;
  if (!tweetText || !tweetText.trim()) {
    return res.status(400).json({ error: 'tweetTextが必要です' });
  }

  const xClient = createXClient();
  if (!xClient) {
    return res.status(503).json({ error: 'X API の認証情報が設定されていません' });
  }

  try {
    const result = await xClient.v2.tweet(tweetText.trim());
    res.json({ success: true, tweetId: result.data.id, tweetText: tweetText.trim() });
  } catch (err) {
    console.error('X API error:', err.message);
    res.status(500).json({ error: 'X への投稿に失敗しました: ' + err.message });
  }
});

// ── スケジュール投稿の登録 ────────────────────────────────────
app.post('/api/schedule-post', (req, res) => {
  const { tweetText, scheduledAt } = req.body;
  if (!tweetText || !scheduledAt) {
    return res.status(400).json({ error: 'tweetText と scheduledAt が必要です' });
  }

  const targetDate = new Date(scheduledAt);
  if (isNaN(targetDate.getTime()) || targetDate <= new Date()) {
    return res.status(400).json({ error: '未来の日時を指定してください' });
  }

  const id = String(scheduleIdCounter++);
  const min = targetDate.getMinutes();
  const hour = targetDate.getHours();
  const day = targetDate.getDate();
  const month = targetDate.getMonth() + 1;
  const cronExpr = `${min} ${hour} ${day} ${month} *`;

  const cronJob = cron.schedule(cronExpr, async () => {
    const xClient = createXClient();
    if (!xClient) {
      console.error(`[schedule ${id}] X API 認証情報が未設定のため投稿スキップ`);
      updateScheduleStatus(id, 'failed');
      return;
    }
    try {
      await xClient.v2.tweet(tweetText.trim());
      console.log(`[schedule ${id}] X 投稿成功`);
      updateScheduleStatus(id, 'posted');
    } catch (err) {
      console.error(`[schedule ${id}] X 投稿失敗:`, err.message);
      updateScheduleStatus(id, 'failed');
    }
  }, { scheduled: true, timezone: 'Asia/Tokyo' });

  scheduledPosts.set(id, {
    id,
    tweetText: tweetText.trim(),
    scheduledAt: targetDate.toISOString(),
    cronJob,
    status: 'pending',
  });

  res.json({ id, tweetText: tweetText.trim(), scheduledAt: targetDate.toISOString(), status: 'pending' });
});

function updateScheduleStatus(id, status) {
  const entry = scheduledPosts.get(id);
  if (entry) {
    entry.status = status;
    if (status === 'posted' || status === 'failed') {
      entry.cronJob.stop();
    }
  }
}

// ── スケジュール投稿一覧 ──────────────────────────────────────
app.get('/api/scheduled-posts', (_req, res) => {
  const list = [...scheduledPosts.values()].map(({ id, tweetText, scheduledAt, status }) => ({
    id, tweetText, scheduledAt, status,
  }));
  list.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  res.json(list);
});

// ── スケジュール投稿のキャンセル ──────────────────────────────
app.delete('/api/schedule-post/:id', (req, res) => {
  const entry = scheduledPosts.get(req.params.id);
  if (!entry) return res.status(404).json({ error: '該当のスケジュールが見つかりません' });
  if (entry.status !== 'pending') {
    return res.status(400).json({ error: 'キャンセルできる状態ではありません' });
  }
  entry.cronJob.stop();
  scheduledPosts.delete(req.params.id);
  res.json({ success: true });
});

// ── X API 設定状態の確認 ──────────────────────────────────────
app.get('/api/x-status', (_req, res) => {
  res.json({
    xConfigured: !!createXClient(),
    claudeConfigured: !!createAnthropicClient(),
  });
});

// ─────────────────────────────────────────────────────────────
// 提案資料生成ロジック
// ─────────────────────────────────────────────────────────────
function generateProposal(customer, template, templateId) {
  const today = new Date();
  const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日`;

  const sectionGenerators = {
    it_consulting: generateITConsultingSections,
    system_development: generateSystemDevSections,
    digital_marketing: generateDigitalMarketingSections,
    cloud_migration: generateCloudMigrationSections,
  };

  const generator = sectionGenerators[templateId];
  const sections = generator(customer);

  return {
    title: `${customer.companyName} 様向け ${template.name}のご提案`,
    date: dateStr,
    customer: {
      companyName: customer.companyName,
      department: customer.department || '',
      contactName: customer.contactName || '',
      industry: customer.industry || '',
      employeeCount: customer.employeeCount || '',
    },
    sections,
  };
}

function generateITConsultingSections(c) {
  return [
    {
      title: '現状分析',
      content: `${c.companyName}様（${c.industry || '—'}業界、従業員${c.employeeCount || '—'}名規模）の現状のIT環境およびビジネスプロセスを分析いたしました。${c.challenges ? `\n\nお伺いした課題：\n${c.challenges}` : ''}`,
    },
    { title: '課題の整理', items: buildChallengeItems(c) },
    { title: '提案ソリューション', items: buildSolutionItems(c, 'it_consulting') },
    { title: '導入スケジュール', content: buildSchedule(c, 'it_consulting') },
    { title: '費用見積', content: buildCostEstimate(c, 'it_consulting') },
  ];
}

function generateSystemDevSections(c) {
  return [
    {
      title: 'プロジェクト概要',
      content: `${c.companyName}様向け${c.projectName || 'システム開発'}プロジェクトについて、以下の通りご提案いたします。${c.challenges ? `\n\n背景・目的：\n${c.challenges}` : ''}`,
    },
    { title: '要件整理', items: buildChallengeItems(c) },
    { title: 'システム構成', items: buildSolutionItems(c, 'system_development') },
    { title: '開発スケジュール', content: buildSchedule(c, 'system_development') },
    { title: '費用見積', content: buildCostEstimate(c, 'system_development') },
  ];
}

function generateDigitalMarketingSections(c) {
  return [
    {
      title: '市場分析',
      content: `${c.industry || '—'}業界における${c.companyName}様のデジタルマーケティング戦略について分析いたしました。${c.challenges ? `\n\n現状の課題：\n${c.challenges}` : ''}`,
    },
    { title: '現状の課題', items: buildChallengeItems(c) },
    { title: '施策提案', items: buildSolutionItems(c, 'digital_marketing') },
    { title: '実施スケジュール', content: buildSchedule(c, 'digital_marketing') },
    { title: '費用見積', content: buildCostEstimate(c, 'digital_marketing') },
  ];
}

function generateCloudMigrationSections(c) {
  return [
    {
      title: '現行インフラ分析',
      content: `${c.companyName}様の現行インフラ環境を分析し、クラウド移行計画をご提案いたします。${c.challenges ? `\n\n移行の背景：\n${c.challenges}` : ''}`,
    },
    { title: '移行計画', items: buildChallengeItems(c) },
    { title: 'アーキテクチャ設計', items: buildSolutionItems(c, 'cloud_migration') },
    { title: '移行スケジュール', content: buildSchedule(c, 'cloud_migration') },
    { title: '費用見積', content: buildCostEstimate(c, 'cloud_migration') },
  ];
}

function buildChallengeItems(c) {
  const items = [];
  if (c.challenges) {
    c.challenges.split('\n').filter(Boolean).forEach((line) => {
      items.push(line.replace(/^[-・●]?\s*/, ''));
    });
  }
  if (c.budget) items.push(`予算規模: ${c.budget}`);
  if (c.timeline) items.push(`希望納期: ${c.timeline}`);
  if (items.length === 0) items.push('ヒアリングにて詳細を確認');
  return items;
}

function buildSolutionItems(_c, templateId) {
  const solutions = {
    it_consulting: [
      '業務プロセスの可視化と最適化',
      'IT基盤の刷新・モダナイゼーション',
      'データ活用基盤の構築',
      'セキュリティ対策の強化',
    ],
    system_development: [
      'クラウドネイティブアーキテクチャの採用',
      'マイクロサービス設計による拡張性確保',
      'CI/CDパイプラインの構築',
      'ユーザビリティを重視したUI/UX設計',
    ],
    digital_marketing: [
      'SEO/SEM最適化施策',
      'コンテンツマーケティング戦略の立案',
      'SNSマーケティングの強化',
      'データドリブンなPDCAサイクルの構築',
    ],
    cloud_migration: [
      'リフト&シフトによる段階的移行',
      'コンテナ化・Kubernetes基盤の構築',
      'マネージドサービスの活用',
      '監視・運用体制の整備',
    ],
  };
  return solutions[templateId] || solutions.it_consulting;
}

function buildSchedule(_c, templateId) {
  const schedules = {
    it_consulting:
      'フェーズ1（1〜2ヶ月目）: 現状調査・分析\nフェーズ2（3〜4ヶ月目）: 改善計画策定\nフェーズ3（5〜6ヶ月目）: 施策実行・効果測定',
    system_development:
      'フェーズ1（1ヶ月目）: 要件定義\nフェーズ2（2〜3ヶ月目）: 基本設計・詳細設計\nフェーズ3（4〜6ヶ月目）: 開発・単体テスト\nフェーズ4（7ヶ月目）: 結合テスト・UAT\nフェーズ5（8ヶ月目）: リリース・運用開始',
    digital_marketing:
      'フェーズ1（1ヶ月目）: 現状分析・戦略策定\nフェーズ2（2〜3ヶ月目）: 施策準備・コンテンツ制作\nフェーズ3（4〜6ヶ月目）: 施策実行・効果測定\nフェーズ4（7ヶ月目以降）: 継続改善・PDCA',
    cloud_migration:
      'フェーズ1（1ヶ月目）: アセスメント・計画策定\nフェーズ2（2〜3ヶ月目）: PoC・検証環境構築\nフェーズ3（4〜5ヶ月目）: 本番移行\nフェーズ4（6ヶ月目）: 最適化・運用安定化',
  };
  return schedules[templateId] || schedules.it_consulting;
}

function buildCostEstimate(c, templateId) {
  const base = {
    it_consulting: { label: 'コンサルティング費用', range: '300万円〜800万円' },
    system_development: { label: '開発費用', range: '500万円〜2,000万円' },
    digital_marketing: { label: 'マーケティング施策費用', range: '200万円〜600万円' },
    cloud_migration: { label: 'クラウド移行費用', range: '400万円〜1,500万円' },
  };
  const est = base[templateId] || base.it_consulting;
  let text = `${est.label}（税別）: ${est.range}\n\n※ 詳細な見積もりは要件確定後にお出しいたします。`;
  if (c.budget) {
    text += `\n\nご予算: ${c.budget}\n上記ご予算を踏まえた最適なプランをご提案いたします。`;
  }
  return text;
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
