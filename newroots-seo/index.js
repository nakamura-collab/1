const { chromium } = require('playwright');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

// 分析対象URL（引数または環境変数から取得）
const TARGET_URL = process.argv[2] || process.env.TARGET_URL || 'https://example.com';

async function collectSEOData(url) {
  console.log(`\n[Playwright] クロール開始: ${url}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const data = await page.evaluate(() => {
      const getMeta = (name) => {
        const el =
          document.querySelector(`meta[name="${name}"]`) ||
          document.querySelector(`meta[property="${name}"]`);
        return el ? el.getAttribute('content') : null;
      };

      const headings = {};
      ['h1', 'h2', 'h3'].forEach((tag) => {
        headings[tag] = Array.from(document.querySelectorAll(tag))
          .map((el) => el.innerText.trim())
          .filter(Boolean)
          .slice(0, 10);
      });

      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => ({ text: a.innerText.trim(), href: a.getAttribute('href') }))
        .filter((l) => l.text && l.href)
        .slice(0, 30);

      const images = Array.from(document.querySelectorAll('img'))
        .map((img) => ({ src: img.getAttribute('src'), alt: img.getAttribute('alt') }))
        .slice(0, 20);

      const jsonLd = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]')
      ).map((s) => {
        try {
          return JSON.parse(s.textContent);
        } catch {
          return null;
        }
      }).filter(Boolean);

      return {
        title: document.title,
        metaDescription: getMeta('description'),
        metaKeywords: getMeta('keywords'),
        ogTitle: getMeta('og:title'),
        ogDescription: getMeta('og:description'),
        ogImage: getMeta('og:image'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        lang: document.documentElement.lang,
        headings,
        links,
        images,
        jsonLd,
        wordCount: document.body?.innerText?.split(/\s+/).filter(Boolean).length || 0,
        hasViewport: !!document.querySelector('meta[name="viewport"]'),
        hasRobots: !!document.querySelector('meta[name="robots"]'),
        robotsContent: getMeta('robots'),
      };
    });

    // Core Web Vitals の測定（簡易版）
    const performanceTiming = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) {
        return {
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
          loadTime: Math.round(nav.loadEventEnd - nav.startTime),
        };
      }
      return null;
    });

    await browser.close();

    return { url, ...data, performanceTiming };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

function buildPrompt(seoData) {
  const d = seoData;

  const imagesWithoutAlt = d.images.filter((img) => !img.alt || img.alt.trim() === '').length;
  const internalLinks = d.links.filter(
    (l) => l.href.startsWith('/') || l.href.includes(new URL(d.url).hostname)
  ).length;
  const externalLinks = d.links.length - internalLinks;

  return `あなたはSEOの専門家です。以下のウェブページのSEO情報を詳細に分析し、具体的な改善提案をしてください。

## 対象URL
${d.url}

## 基本情報
- タイトル: ${d.title || '（未設定）'}
- メタディスクリプション: ${d.metaDescription || '（未設定）'}
- メタキーワード: ${d.metaKeywords || '（未設定）'}
- Canonical URL: ${d.canonical || '（未設定）'}
- 言語属性: ${d.lang || '（未設定）'}
- ワード数: ${d.wordCount}

## OGP (Open Graph Protocol)
- OGタイトル: ${d.ogTitle || '（未設定）'}
- OG説明文: ${d.ogDescription || '（未設定）'}
- OG画像: ${d.ogImage || '（未設定）'}

## 見出し構造
- H1: ${d.headings.h1.length > 0 ? d.headings.h1.join(' / ') : '（なし）'}
- H2: ${d.headings.h2.length}個 ${d.headings.h2.slice(0, 3).join(' / ')}${d.headings.h2.length > 3 ? ' ...' : ''}
- H3: ${d.headings.h3.length}個

## テクニカルSEO
- Viewportメタタグ: ${d.hasViewport ? 'あり（モバイル対応）' : 'なし（要対応）'}
- Robotsメタタグ: ${d.hasRobots ? `あり（${d.robotsContent}）` : 'なし'}
- 構造化データ(JSON-LD): ${d.jsonLd.length > 0 ? `${d.jsonLd.length}件 (${d.jsonLd.map((j) => j['@type']).filter(Boolean).join(', ')})` : 'なし'}

## リンク分析
- 総リンク数: ${d.links.length}（内部: ${internalLinks}, 外部: ${externalLinks}）

## 画像SEO
- 総画像数: ${d.images.length}
- alt属性なし: ${imagesWithoutAlt}件${imagesWithoutAlt > 0 ? ' ⚠️' : ''}

## パフォーマンス
${d.performanceTiming ? `- DOMContentLoaded: ${d.performanceTiming.domContentLoaded}ms\n- ページ読み込み時間: ${d.performanceTiming.loadTime}ms` : '- 計測データなし'}

---

以下の観点で分析し、優先度（高/中/低）をつけて改善提案を提示してください：

1. **タイトル・メタディスクリプションの最適化**
2. **見出し構造（H1〜H3）の評価**
3. **コンテンツの質と量**
4. **テクニカルSEO（モバイル対応・構造化データ・Canonical等）**
5. **OGP・SNS共有最適化**
6. **内部リンク・外部リンク戦略**
7. **画像SEO**
8. **パフォーマンス**

最後に、**即座に対応すべきTop3の改善アクション**をまとめてください。`;
}

async function analyzeSEO(seoData) {
  console.log('[Claude] SEO分析中...\n');

  const prompt = buildPrompt(seoData);

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

function printCollectedData(seoData) {
  console.log('='.repeat(60));
  console.log('【収集したSEOデータ】');
  console.log('='.repeat(60));
  console.log(`URL         : ${seoData.url}`);
  console.log(`タイトル    : ${seoData.title || '（未設定）'}`);
  console.log(`Description : ${seoData.metaDescription || '（未設定）'}`);
  console.log(`H1          : ${seoData.headings.h1[0] || '（なし）'}`);
  console.log(`ワード数    : ${seoData.wordCount}`);
  console.log(`画像数      : ${seoData.images.length} (alt無し: ${seoData.images.filter((i) => !i.alt).length})`);
  console.log(`リンク数    : ${seoData.links.length}`);
  console.log(`構造化データ: ${seoData.jsonLd.length}件`);
  if (seoData.performanceTiming) {
    console.log(`ロード時間  : ${seoData.performanceTiming.loadTime}ms`);
  }
  console.log('='.repeat(60));
  console.log();
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('エラー: ANTHROPIC_API_KEY 環境変数が設定されていません。');
    console.error('使い方: ANTHROPIC_API_KEY=your_key node index.js [URL]');
    process.exit(1);
  }

  try {
    const seoData = await collectSEOData(TARGET_URL);
    printCollectedData(seoData);

    const analysis = await analyzeSEO(seoData);

    console.log('='.repeat(60));
    console.log('【Claude SEO分析レポート】');
    console.log('='.repeat(60));
    console.log(analysis);
    console.log('='.repeat(60));
  } catch (err) {
    console.error('エラーが発生しました:', err.message);
    process.exit(1);
  }
}

main();
