/**
 * report.js
 * 分析結果からMarkdownレポートを生成し、ファイルに保存する
 */

import fs from 'fs';
import path from 'path';

/**
 * Markdownレポートを生成する
 * @param {{ pages, overallAnalysis, pageAnalyses, generatedAt }} params
 * @returns {string} Markdownテキスト
 */
export function generateReport({ pages, overallAnalysis, pageAnalyses, generatedAt }) {
  const validPages = pages.filter(p => !p.error);
  const errorPages = pages.filter(p => p.error);
  const date = new Date(generatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  const lines = [];

  // ヘッダー
  lines.push(`# newroots.co.jp SEO分析レポート`);
  lines.push('');
  lines.push(`生成日時: ${date}`);
  lines.push(`対象ページ数: ${pages.length} (正常: ${validPages.length} / エラー: ${errorPages.length})`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // サイト全体分析
  lines.push('## サイト全体分析');
  lines.push('');
  lines.push(overallAnalysis);
  lines.push('');
  lines.push('---');
  lines.push('');

  // サマリーテーブル
  lines.push('## ページ一覧サマリー');
  lines.push('');
  lines.push('| # | URL | タイトル | Description | H1 | ワード数 | ロード(ms) |');
  lines.push('|---|-----|---------|------------|-----|---------|----------|');

  for (let i = 0; i < validPages.length; i++) {
    const p = validPages[i];
    const title = truncate(p.title || '（未設定）', 30);
    const desc = p.metaDescription ? '✅' : '❌';
    const h1count = p.headings?.h1?.length ?? 0;
    const h1status = h1count === 0 ? '❌ なし' : h1count > 1 ? `⚠️ ${h1count}個` : '✅';
    const load = p.performance?.loadTime ?? '-';
    lines.push(`| ${i + 1} | ${p.url} | ${title} | ${desc} | ${h1status} | ${p.wordCount ?? '-'} | ${load} |`);
  }

  if (errorPages.length > 0) {
    lines.push('');
    lines.push('### エラーページ');
    for (const p of errorPages) {
      lines.push(`- ${p.url}: ${p.error}`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // ページ別詳細分析
  lines.push('## ページ別詳細分析');
  lines.push('');

  const analyzedUrls = Object.keys(pageAnalyses);
  for (let i = 0; i < analyzedUrls.length; i++) {
    const url = analyzedUrls[i];
    const analysis = pageAnalyses[url];
    const page = pages.find(p => p.url === url);

    lines.push(`### ${i + 1}. ${url}`);
    lines.push('');

    // ページ基本情報
    if (page && !page.error) {
      lines.push('**基本情報**');
      lines.push('');
      lines.push(`- タイトル: ${page.title || '（未設定）'}`);
      lines.push(`- メタディスクリプション: ${page.metaDescription || '（未設定）'}`);
      lines.push(`- H1: ${page.headings?.h1?.join(' / ') || '（なし）'}`);
      lines.push(`- ワード数: ${page.wordCount ?? '-'}`);
      if (page.performance?.loadTime) {
        lines.push(`- ロード時間: ${page.performance.loadTime}ms`);
      }
      lines.push('');
    }

    lines.push('**Claude分析**');
    lines.push('');
    lines.push(analysis);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // チェックリスト（全ページ共通タスク）
  lines.push('## 共通改善チェックリスト');
  lines.push('');
  lines.push('以下の項目を全ページで確認してください:');
  lines.push('');
  lines.push('- [ ] タイトルタグが設定されており、30〜60文字である');
  lines.push('- [ ] メタディスクリプションが設定されており、70〜120文字である');
  lines.push('- [ ] H1タグが1つだけ存在する');
  lines.push('- [ ] Canonical URLが設定されている');
  lines.push('- [ ] og:title / og:description / og:image が設定されている');
  lines.push('- [ ] 全画像にalt属性が設定されている');
  lines.push('- [ ] 構造化データ (JSON-LD) が実装されている');
  lines.push('- [ ] Viewportメタタグが設定されている（モバイル対応）');
  lines.push('- [ ] ページロード時間が3秒以内である');
  lines.push('');

  return lines.join('\n');
}

/**
 * レポートをファイルに保存する
 */
export function saveReport(content, filePath) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`📄 レポート保存: ${filePath}`);
}

/**
 * JSONデータをファイルに保存する
 */
export function saveJson(data, filePath) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`💾 JSONデータ保存: ${filePath}`);
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}
