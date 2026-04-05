/**
 * crawler.js
 * Playwrightを使ってnewroots.co.jpをクロールし、各ページのSEOデータを収集する
 */

import { chromium } from 'playwright';

const BASE_URL = 'https://newroots.co.jp';

/**
 * サイトをクロールして全ページのSEOデータを返す
 * @param {{ maxPages?: number }} options
 * @returns {Promise<Array>}
 */
export async function crawlSite({ maxPages = 50 } = {}) {
  console.log(`🔍 クロール開始: ${BASE_URL} (最大 ${maxPages} ページ)`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (compatible; NewRootsSEOBot/1.0; +https://newroots.co.jp)',
  });

  const visited = new Set();
  const queue = [BASE_URL];
  const pages = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    const pageData = await scrapePage(context, url);
    pages.push(pageData);
    console.log(`  [${pages.length}/${maxPages}] ${url}`);

    if (!pageData.error) {
      // 同一ドメインの内部リンクをキューに追加
      for (const link of pageData.internalLinks) {
        const normalized = normalizeUrl(link);
        if (normalized && !visited.has(normalized)) {
          queue.push(normalized);
        }
      }
    }
  }

  await browser.close();
  console.log(`\n✅ クロール完了: ${pages.length}ページ取得`);
  return pages;
}

async function scrapePage(context, url) {
  const page = await context.newPage();
  const result = { url };

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });

    result.statusCode = response?.status() ?? null;

    const data = await page.evaluate(() => {
      const getMeta = (name) => {
        const el =
          document.querySelector(`meta[name="${name}"]`) ||
          document.querySelector(`meta[property="${name}"]`);
        return el?.getAttribute('content') ?? null;
      };

      const headings = {};
      for (const tag of ['h1', 'h2', 'h3', 'h4']) {
        headings[tag] = Array.from(document.querySelectorAll(tag))
          .map(el => el.innerText.trim())
          .filter(Boolean)
          .slice(0, 10);
      }

      const allLinks = Array.from(document.querySelectorAll('a[href]'))
        .map(a => a.getAttribute('href'))
        .filter(Boolean);

      const images = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        width: img.naturalWidth || null,
        height: img.naturalHeight || null,
      }));

      const jsonLd = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]')
      )
        .map(s => {
          try { return JSON.parse(s.textContent); } catch { return null; }
        })
        .filter(Boolean);

      const bodyText = document.body?.innerText ?? '';

      return {
        title: document.title,
        metaDescription: getMeta('description'),
        metaKeywords: getMeta('keywords'),
        ogTitle: getMeta('og:title'),
        ogDescription: getMeta('og:description'),
        ogImage: getMeta('og:image'),
        twitterCard: getMeta('twitter:card'),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
        lang: document.documentElement.lang || null,
        headings,
        allLinks,
        images,
        jsonLd,
        wordCount: bodyText.split(/\s+/).filter(Boolean).length,
        hasViewport: !!document.querySelector('meta[name="viewport"]'),
        robotsMeta: getMeta('robots'),
        bodyTextSnippet: bodyText.slice(0, 500),
      };
    });

    // 内部リンクと外部リンクを分類
    const base = new URL(BASE_URL);
    result.internalLinks = data.allLinks
      .map(href => {
        try {
          const resolved = new URL(href, url);
          return resolved.hostname === base.hostname ? resolved.href : null;
        } catch { return null; }
      })
      .filter(Boolean)
      .map(u => u.split('#')[0].replace(/\/$/, '') || u); // フラグメント除去・末尾スラッシュ正規化

    result.externalLinks = data.allLinks
      .map(href => {
        try {
          const resolved = new URL(href, url);
          return resolved.hostname !== base.hostname ? resolved.href : null;
        } catch { return null; }
      })
      .filter(Boolean);

    // パフォーマンス計測
    result.performance = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      if (!nav) return null;
      return {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        loadTime: Math.round(nav.loadEventEnd - nav.startTime),
        ttfb: Math.round(nav.responseStart - nav.startTime),
      };
    });

    Object.assign(result, data);
    delete result.allLinks; // 内部/外部で整理済み

  } catch (err) {
    result.error = err.message;
    result.internalLinks = [];
    result.externalLinks = [];
  } finally {
    await page.close();
  }

  return result;
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // クロール対象外: ハッシュのみ・非HTMLリソース・外部ドメイン
    if (u.hostname !== new URL(BASE_URL).hostname) return null;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|css|js|zip|xml)$/i.test(u.pathname)) return null;
    u.hash = '';
    u.search = '';
    return u.href.replace(/\/$/, '') || BASE_URL;
  } catch {
    return null;
  }
}
