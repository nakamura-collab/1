/**
 * analyzer.js
 * Claude APIを使ってSEOデータを分析する
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const MODEL = 'claude-opus-4-6';

/**
 * 単一ページのSEO分析
 * @param {object} page クローラーが収集したページデータ
 * @returns {Promise<string>} 分析結果テキスト
 */
export async function analyzePage(page) {
  const imagesWithoutAlt = (page.images ?? []).filter(
    img => img.alt === null || img.alt === ''
  ).length;

  const prompt = `あなたはSEOの専門家です。以下のページデータを分析し、具体的な改善提案を箇条書きで示してください。
優先度（🔴高 / 🟡中 / 🟢低）を各項目に付けてください。

## URL
${page.url}

## 基本メタデータ
- タイトル（${page.title?.length ?? 0}文字）: ${page.title || '（未設定）'}
- メタディスクリプション（${page.metaDescription?.length ?? 0}文字）: ${page.metaDescription || '（未設定）'}
- Canonical: ${page.canonical || '（未設定）'}
- 言語属性: ${page.lang || '（未設定）'}
- HTTPステータス: ${page.statusCode ?? '不明'}

## 見出し構造
- H1 (${page.headings?.h1?.length ?? 0}個): ${page.headings?.h1?.join(' / ') || '（なし）'}
- H2 (${page.headings?.h2?.length ?? 0}個): ${page.headings?.h2?.slice(0, 5).join(' / ') || '（なし）'}
- H3 (${page.headings?.h3?.length ?? 0}個)

## コンテンツ
- 本文ワード数: ${page.wordCount ?? 0}
- 本文冒頭: ${page.bodyTextSnippet ? page.bodyTextSnippet.slice(0, 200) : '（取得不可）'}

## OGP / SNS
- og:title: ${page.ogTitle || '（未設定）'}
- og:description: ${page.ogDescription || '（未設定）'}
- og:image: ${page.ogImage || '（未設定）'}
- twitter:card: ${page.twitterCard || '（未設定）'}

## テクニカル
- Viewportメタタグ: ${page.hasViewport ? 'あり' : 'なし'}
- robots: ${page.robotsMeta || '（未設定）'}
- 構造化データ (JSON-LD): ${page.jsonLd?.length ? page.jsonLd.map(j => j['@type']).filter(Boolean).join(', ') : 'なし'}

## 画像
- 総数: ${page.images?.length ?? 0} / alt属性なし: ${imagesWithoutAlt}件

## リンク
- 内部リンク: ${page.internalLinks?.length ?? 0}件 / 外部リンク: ${page.externalLinks?.length ?? 0}件

## パフォーマンス
${page.performance
  ? `- TTFB: ${page.performance.ttfb}ms\n- DOMContentLoaded: ${page.performance.domContentLoaded}ms\n- ロード時間: ${page.performance.loadTime}ms`
  : '- 計測データなし'}

---
以下の観点で簡潔に分析し、優先度付きの改善リストを出力してください:
1. タイトル・ディスクリプションの最適化
2. 見出し構造の評価
3. コンテンツ品質と量
4. テクニカルSEO
5. OGP・SNS最適化
6. 画像SEO
7. パフォーマンス`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

/**
 * サイト全体のSEO俯瞰分析
 * @param {Array} pages クロール済み全ページデータ
 * @returns {Promise<string>} 分析結果テキスト
 */
export async function analyzeSiteOverall(pages) {
  const errorPages = pages.filter(p => p.error);
  const validPages = pages.filter(p => !p.error);

  const noTitle = validPages.filter(p => !p.title).length;
  const noDescription = validPages.filter(p => !p.metaDescription).length;
  const noH1 = validPages.filter(p => !p.headings?.h1?.length).length;
  const multiH1 = validPages.filter(p => (p.headings?.h1?.length ?? 0) > 1).length;
  const noCanonical = validPages.filter(p => !p.canonical).length;
  const noOgImage = validPages.filter(p => !p.ogImage).length;
  const noJsonLd = validPages.filter(p => !p.jsonLd?.length).length;
  const avgWordCount = validPages.length
    ? Math.round(validPages.reduce((s, p) => s + (p.wordCount ?? 0), 0) / validPages.length)
    : 0;
  const avgLoad = validPages.filter(p => p.performance?.loadTime).length
    ? Math.round(
        validPages
          .filter(p => p.performance?.loadTime)
          .reduce((s, p) => s + p.performance.loadTime, 0) /
          validPages.filter(p => p.performance?.loadTime).length
      )
    : null;

  // 重複タイトル検出
  const titleMap = {};
  for (const p of validPages) {
    if (p.title) {
      titleMap[p.title] = (titleMap[p.title] || 0) + 1;
    }
  }
  const duplicateTitles = Object.entries(titleMap)
    .filter(([, count]) => count > 1)
    .map(([title, count]) => `"${title}" (${count}件)`);

  const prompt = `あなたはSEOの専門家です。newroots.co.jpのサイト全体クロール結果を分析し、サイト全体の課題と優先改善事項を示してください。

## クロール概要
- 総ページ数: ${pages.length}
- 正常取得: ${validPages.length}ページ
- エラー: ${errorPages.length}ページ ${errorPages.length > 0 ? '(' + errorPages.slice(0, 3).map(p => p.url).join(', ') + ')' : ''}

## メタデータ充足率
- タイトル未設定: ${noTitle}/${validPages.length}ページ
- メタディスクリプション未設定: ${noDescription}/${validPages.length}ページ
- H1なし: ${noH1}/${validPages.length}ページ
- H1複数: ${multiH1}/${validPages.length}ページ
- Canonical未設定: ${noCanonical}/${validPages.length}ページ
- og:image未設定: ${noOgImage}/${validPages.length}ページ
- 構造化データなし: ${noJsonLd}/${validPages.length}ページ

## コンテンツ
- 平均ワード数: ${avgWordCount}語

## パフォーマンス
- 平均ページロード時間: ${avgLoad !== null ? avgLoad + 'ms' : '計測データなし'}

## 重複タイトル
${duplicateTitles.length > 0 ? duplicateTitles.join('\n') : 'なし'}

## クロール済みURL一覧（上位20件）
${validPages.slice(0, 20).map(p => `- ${p.url}`).join('\n')}

---
以下を含むサイト全体の分析レポートを作成してください:
1. サイト全体のSEO総評（100文字程度）
2. 緊急対応が必要な課題（🔴）
3. 重要な改善項目（🟡）
4. 長期的に取り組むべき施策（🟢）
5. 最優先で対応すべきTop5アクション`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}
