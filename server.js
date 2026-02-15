const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
    {
      title: '課題の整理',
      items: buildChallengeItems(c),
    },
    {
      title: '提案ソリューション',
      items: buildSolutionItems(c, 'it_consulting'),
    },
    {
      title: '導入スケジュール',
      content: buildSchedule(c, 'it_consulting'),
    },
    {
      title: '費用見積',
      content: buildCostEstimate(c, 'it_consulting'),
    },
  ];
}

function generateSystemDevSections(c) {
  return [
    {
      title: 'プロジェクト概要',
      content: `${c.companyName}様向け${c.projectName || 'システム開発'}プロジェクトについて、以下の通りご提案いたします。${c.challenges ? `\n\n背景・目的：\n${c.challenges}` : ''}`,
    },
    {
      title: '要件整理',
      items: buildChallengeItems(c),
    },
    {
      title: 'システム構成',
      items: buildSolutionItems(c, 'system_development'),
    },
    {
      title: '開発スケジュール',
      content: buildSchedule(c, 'system_development'),
    },
    {
      title: '費用見積',
      content: buildCostEstimate(c, 'system_development'),
    },
  ];
}

function generateDigitalMarketingSections(c) {
  return [
    {
      title: '市場分析',
      content: `${c.industry || '—'}業界における${c.companyName}様のデジタルマーケティング戦略について分析いたしました。${c.challenges ? `\n\n現状の課題：\n${c.challenges}` : ''}`,
    },
    {
      title: '現状の課題',
      items: buildChallengeItems(c),
    },
    {
      title: '施策提案',
      items: buildSolutionItems(c, 'digital_marketing'),
    },
    {
      title: '実施スケジュール',
      content: buildSchedule(c, 'digital_marketing'),
    },
    {
      title: '費用見積',
      content: buildCostEstimate(c, 'digital_marketing'),
    },
  ];
}

function generateCloudMigrationSections(c) {
  return [
    {
      title: '現行インフラ分析',
      content: `${c.companyName}様の現行インフラ環境を分析し、クラウド移行計画をご提案いたします。${c.challenges ? `\n\n移行の背景：\n${c.challenges}` : ''}`,
    },
    {
      title: '移行計画',
      items: buildChallengeItems(c),
    },
    {
      title: 'アーキテクチャ設計',
      items: buildSolutionItems(c, 'cloud_migration'),
    },
    {
      title: '移行スケジュール',
      content: buildSchedule(c, 'cloud_migration'),
    },
    {
      title: '費用見積',
      content: buildCostEstimate(c, 'cloud_migration'),
    },
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
