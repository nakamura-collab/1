/**
 *
 * index.js
 * newroots.co.jp SEO自動分析ツール エントリーポイント
 * 使い方:
 *   node index.js                # フル実行（クロール → 分析 → レポート生成）
 *   node index.js --crawl-only   # クロールのみ（JSONを保存）
 *   node index.js --report-only  # 既存JSONからレポートのみ生成
 *   node index.js --max-pages 20 # 最大ページ数を指定
 */

import fs from 'fs';
import path from 'path';
import { crawlSite } from './crawler.js';
import { analyzePage, analyzeSiteOverall } from './analyzer.js';
import { generateReport, saveReport, saveJson } from './report.js';

const args = process.argv.slice(2);
const crawlOnly = args.includes('--crawl-only');
const reportOnly = args.includes('--report-only');

const maxPagesIdx = args.indexOf('--max-pages');
const maxPages = maxPagesIdx !== -1 ? parseInt(args[maxPagesIdx + 1], 10) : 50;

const now = new Date();
const dateTag = now.toISOString().slice(0, 10);
const OUTPUT_DIR = './output';
const JSON_PATH = path.join(OUTPUT_DIR, `crawl-${dateTag}.json`);
const REPORT_PATH = path.join(OUTPUT_DIR, `seo-report-${dateTag}.md`);

async function main() {
  console.log('=== NewRoots SEO分析ツール ===\n');

  let pages;

  // --- クロール ---
  if (!reportOnly) {
    pages = await crawlSite({ maxPages });
    saveJson({ pages, generatedAt: now.toISOString() }, JSON_PATH);

    if (crawlOnly) {
      console.log('\n✅ クロール完了。--report-onlyで分析レポートを生成できます。');
      process.exit(0);
    }
  } else {
    // 既存JSONを読み込み
    if (!fs.existsSync(JSON_PATH)) {
      console.error(`❌ JSONファイルが見つかりません: ${JSON_PATH}`);
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    pages = raw.pages;
    console.log(`📂 既存データ読み込み: ${pages.length}ページ`);
  }

  // --- 分析 ---
  console.log('\n🤖 Claude APIで分析中...\n');

  // サイト全体分析
  console.log('  サイト全体を分析中...');
  const overallAnalysis = await analyzeSiteOverall(pages);

  // ページ別分析（最大15ページ、エラーページはスキップ）
  const validPages = pages.filter(p => !p.error);
  const targetPages = validPages.slice(0, 15);
  const pageAnalyses = {};

  for (let i = 0; i < targetPages.length; i++) {
    const p = targetPages[i];
    console.log(`  ページ分析 (${i + 1}/${targetPages.length}): ${p.url}`);
    pageAnalyses[p.url] = await analyzePage(p);
    // レート制限対策
    await new Promise(r => setTimeout(r, 500));
  }

  // --- レポート生成 ---
  console.log('\n📝 レポート生成中...');
  const reportContent = generateReport({
    pages,
    overallAnalysis,
    pageAnalyses,
    generatedAt: now.toISOString(),
  });

  saveReport(reportContent, REPORT_PATH);
  console.log(`\n✅ 完了！\nレポート: ${REPORT_PATH}`);
}

main().catch(err => {
  console.error('❌ エラー:', err);
  process.exit(1);
});
