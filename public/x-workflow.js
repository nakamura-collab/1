document.addEventListener('DOMContentLoaded', () => {
  // ── 状態 ───────────────────────────────────────────────────
  const state = {
    date: todayJST(),
    generationText: '',
    parsedPosts: [],
    analysisText: '',
    improvementText: '',
    xConfigured: false,
  };

  // ── 初期化 ─────────────────────────────────────────────────
  init();

  async function init() {
    await Promise.all([checkStatus(), checkXStatus()]);
  }

  async function checkStatus() {
    try {
      const res = await fetch(`/api/workflow/status?date=${state.date}`);
      const data = await res.json();

      if (data.hasImprovement) {
        document.getElementById('improvementNotice').style.display = 'flex';
      }

      // 既存セッションがあれば復元
      if (data.hasGeneration || data.hasAnalysis || data.hasImprovement_session) {
        const sessionRes = await fetch(`/api/workflow/session?date=${state.date}`);
        const session = await sessionRes.json();
        restoreSession(session);
      }
    } catch (e) { console.error(e); }
  }

  async function checkXStatus() {
    try {
      const res = await fetch('/api/x-status');
      const { xConfigured } = await res.json();
      state.xConfigured = xConfigured;
    } catch (e) { /* ignore */ }
  }

  function restoreSession(session) {
    if (session.generation) {
      state.generationText = session.generation.text;
      state.parsedPosts = parseGeneratedPosts(session.generation.text);
      showStreamResult('stream1', session.generation.text);
      renderPostCards(state.parsedPosts);
      unlockStep(2);

      if (session.analysis) {
        state.analysisText = session.analysis.text;
        renderMetricsCards(state.parsedPosts, session.analysis.metrics);
        showStreamResult('stream2', session.analysis.text);
        unlockStep(3);

        if (session.improvement) {
          state.improvementText = session.improvement.text;
          showStreamResult('stream3', session.improvement.text);
          document.getElementById('saveImprovementArea').style.display = 'block';
        }
      }
    }
  }

  // ── Step 1: 投稿生成 ───────────────────────────────────────
  document.getElementById('generatePostsBtn').addEventListener('click', async () => {
    const btn = document.getElementById('generatePostsBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>生成中...';

    const stream1 = document.getElementById('stream1');
    stream1.style.display = 'block';
    stream1.textContent = '';
    state.generationText = '';

    try {
      const eventSource = await ssePost('/api/workflow/generate-posts', {}, {
        onText: (text) => {
          state.generationText += text;
          stream1.textContent = state.generationText;
          stream1.scrollTop = stream1.scrollHeight;
        },
        onInfo: (msg) => {
          const notice = document.getElementById('improvementNotice');
          notice.style.display = 'flex';
        },
        onDone: () => {
          state.parsedPosts = parseGeneratedPosts(state.generationText);
          renderPostCards(state.parsedPosts);
          unlockStep(2);
          btn.disabled = false;
          btn.textContent = '再生成';
          setDot(1, 'done');
        },
        onError: (err) => {
          stream1.textContent += `\nエラー: ${err}`;
          btn.disabled = false;
          btn.textContent = '投稿案を生成（Claude）';
        },
      });
    } catch (e) {
      stream1.textContent = 'エラー: ' + e.message;
      btn.disabled = false;
      btn.textContent = '投稿案を生成（Claude）';
    }
  });

  // ── Step 2: 結果分析 ───────────────────────────────────────
  document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const btn = document.getElementById('analyzeBtn');
    const metrics = collectMetrics();
    if (!metrics) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>分析中...';

    const stream2 = document.getElementById('stream2');
    stream2.style.display = 'block';
    stream2.textContent = '';
    state.analysisText = '';

    await ssePost('/api/workflow/analyze-results', { metrics, date: state.date }, {
      onText: (text) => {
        state.analysisText += text;
        stream2.textContent = state.analysisText;
        stream2.scrollTop = stream2.scrollHeight;
      },
      onDone: () => {
        unlockStep(3);
        btn.disabled = false;
        btn.textContent = '再分析';
        setDot(2, 'done');
      },
      onError: (err) => {
        stream2.textContent += `\nエラー: ${err}`;
        btn.disabled = false;
        btn.textContent = '分析する（Claude）';
      },
    });
  });

  // ── Step 3: 改善ループ ─────────────────────────────────────
  document.getElementById('improveBtn').addEventListener('click', async () => {
    const btn = document.getElementById('improveBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>生成中...';

    const stream3 = document.getElementById('stream3');
    stream3.style.display = 'block';
    stream3.textContent = '';
    state.improvementText = '';

    await ssePost('/api/workflow/generate-improvement', { date: state.date }, {
      onText: (text) => {
        state.improvementText += text;
        stream3.textContent = state.improvementText;
        stream3.scrollTop = stream3.scrollHeight;
      },
      onDone: () => {
        document.getElementById('saveImprovementArea').style.display = 'block';
        btn.disabled = false;
        btn.textContent = '再生成';
        setDot(3, 'done');
      },
      onError: (err) => {
        stream3.textContent += `\nエラー: ${err}`;
        btn.disabled = false;
        btn.textContent = '改善ルールを生成（Claude）';
      },
    });
  });

  // 改善ルール保存
  document.getElementById('saveImprovementBtn').addEventListener('click', async () => {
    const btn = document.getElementById('saveImprovementBtn');
    btn.disabled = true;
    btn.textContent = '保存中...';
    try {
      const res = await fetch('/api/workflow/save-improvement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: state.improvementText }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      btn.textContent = '保存しました！明日の生成に反映されます';
      btn.className = 'btn btn-saved wf-btn';
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
      btn.textContent = '明日の生成に保存する';
    }
  });

  // ── 投稿カード描画 ─────────────────────────────────────────
  function renderPostCards(posts) {
    const area = document.getElementById('postsArea');
    if (!posts.length) {
      area.style.display = 'none';
      return;
    }
    area.style.display = 'block';
    area.innerHTML = `
      <h3 class="posts-heading">生成された投稿案</h3>
      ${posts.map((p, i) => `
        <div class="post-card" data-idx="${i}">
          <div class="post-card-meta">
            <span class="badge-category">${esc(p.category)}</span>
            <span class="post-target">${esc(p.target)}</span>
          </div>
          <div class="post-strategy">狙い：${esc(p.strategy)}</div>
          <div class="post-body">${esc(p.body)}</div>
          <div class="post-card-actions">
            <span class="post-char-count ${p.body.length > 280 ? 'over' : ''}">${p.body.length}文字</span>
            ${state.xConfigured
              ? `<button class="btn btn-x btn-sm post-x-btn" data-idx="${i}">X に投稿</button>`
              : `<button class="btn btn-secondary btn-sm" disabled title="X API 未設定">X に投稿</button>`
            }
          </div>
        </div>
      `).join('')}
    `;

    area.querySelectorAll('.post-x-btn').forEach((btn) => {
      btn.addEventListener('click', () => openXPostModal(state.parsedPosts[btn.dataset.idx].body));
    });
  }

  // ── メトリクス入力カード描画 ───────────────────────────────
  function renderMetricsCards(posts, savedMetrics) {
    const container = document.getElementById('metricsCards');
    container.innerHTML = posts.map((p, i) => {
      const m = (savedMetrics && savedMetrics[i]) || {};
      return `
        <div class="metrics-card">
          <div class="metrics-card-header">
            <span class="badge-category">${esc(p.category)}</span>
            <span class="metrics-post-body">${esc(p.body.slice(0, 60))}${p.body.length > 60 ? '…' : ''}</span>
          </div>
          <div class="metrics-grid">
            <label>投稿時間<input type="text" name="postedAt_${i}" value="${esc(m.postedAt || '')}" placeholder="例: 12:30"></label>
            <label>インプレッション<input type="number" name="impressions_${i}" value="${m.impressions || ''}" placeholder="0" min="0"></label>
            <label>いいね<input type="number" name="likes_${i}" value="${m.likes || ''}" placeholder="0" min="0"></label>
            <label>返信<input type="number" name="replies_${i}" value="${m.replies || ''}" placeholder="0" min="0"></label>
            <label>リポスト<input type="number" name="reposts_${i}" value="${m.reposts || ''}" placeholder="0" min="0"></label>
            <label>ブックマーク<input type="number" name="bookmarks_${i}" value="${m.bookmarks || ''}" placeholder="0" min="0"></label>
            <label>PV遷移<input type="number" name="profileVisits_${i}" value="${m.profileVisits || ''}" placeholder="0" min="0"></label>
            <label>フォロー増<input type="number" name="newFollowers_${i}" value="${m.newFollowers || ''}" placeholder="0" min="0"></label>
            <label class="metrics-wide">初速の反応<input type="text" name="initialResponse_${i}" value="${esc(m.initialResponse || '')}" placeholder="例: 最初の1時間でいいね5、知人からDM"></label>
            <label class="metrics-wide">補足コメント<input type="text" name="notes_${i}" value="${esc(m.notes || '')}" placeholder="気づいたことや感想"></label>
          </div>
        </div>
      `;
    }).join('');
  }

  function collectMetrics() {
    const posts = state.parsedPosts;
    if (!posts.length) { alert('先に投稿案を生成してください'); return null; }
    return posts.map((p, i) => ({
      body: p.body,
      category: p.category,
      postedAt: val(`postedAt_${i}`),
      impressions: num(`impressions_${i}`),
      likes: num(`likes_${i}`),
      replies: num(`replies_${i}`),
      reposts: num(`reposts_${i}`),
      bookmarks: num(`bookmarks_${i}`),
      profileVisits: num(`profileVisits_${i}`),
      newFollowers: num(`newFollowers_${i}`),
      initialResponse: val(`initialResponse_${i}`),
      notes: val(`notes_${i}`),
    }));
  }

  function val(name) { return (document.querySelector(`[name="${name}"]`)?.value || '').trim(); }
  function num(name) { return parseInt(document.querySelector(`[name="${name}"]`)?.value || '0', 10) || 0; }

  // ── X 投稿モーダル ─────────────────────────────────────────
  function openXPostModal(text) {
    const modal = document.getElementById('xPostModal');
    const textarea = document.getElementById('xPostTextarea');
    const charCount = document.getElementById('xPostCharCount');
    const status = document.getElementById('xPostStatus');

    textarea.value = text;
    charCount.textContent = `${text.length} / 280`;
    charCount.className = 'char-count' + (text.length > 280 ? ' over' : text.length > 240 ? ' warn' : '');
    status.textContent = '';
    status.className = 'modal-status';
    modal.style.display = 'flex';

    textarea.oninput = () => {
      const l = textarea.value.length;
      charCount.textContent = `${l} / 280`;
      charCount.className = 'char-count' + (l > 280 ? ' over' : l > 240 ? ' warn' : '');
    };
  }

  document.getElementById('xPostModalClose').onclick = () => {
    document.getElementById('xPostModal').style.display = 'none';
  };
  document.getElementById('xPostCancel').onclick = () => {
    document.getElementById('xPostModal').style.display = 'none';
  };
  document.getElementById('xPostModal').onclick = (e) => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  };

  document.getElementById('xPostConfirm').onclick = async () => {
    const text = document.getElementById('xPostTextarea').value.trim();
    if (!text) return;
    if (text.length > 280) return alert('280文字以内にしてください');

    const btn = document.getElementById('xPostConfirm');
    const status = document.getElementById('xPostStatus');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>投稿中...';

    try {
      const res = await fetch('/api/post-to-x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweetText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      status.textContent = '投稿しました！';
      status.className = 'modal-status success';
      setTimeout(() => { document.getElementById('xPostModal').style.display = 'none'; }, 1500);
    } catch (e) {
      status.textContent = 'エラー: ' + e.message;
      status.className = 'modal-status error';
    } finally {
      btn.disabled = false;
      btn.textContent = '今すぐ投稿';
    }
  };

  // ── ヘルパー ───────────────────────────────────────────────
  function unlockStep(step) {
    const card = document.getElementById(`card${step}`);
    card.classList.remove('wf-card-locked');
    document.getElementById(`locked${step}`)?.style && (document.getElementById(`locked${step}`).style.display = 'none');

    if (step === 2) {
      const area = document.getElementById('metricsArea');
      area.style.display = 'block';
      if (!document.getElementById('metricsCards').innerHTML) {
        renderMetricsCards(state.parsedPosts);
      }
    }
    if (step === 3) {
      document.getElementById('improvementArea').style.display = 'block';
    }

    setDot(step - 1, 'done');
    setDot(step, 'active');
    const line = document.getElementById(`line1${step === 2 ? '2' : '23'}`);
    if (line) line.classList.add('done');
  }

  function setDot(num, state) {
    const dot = document.getElementById(`dot${num}`);
    if (!dot) return;
    dot.classList.remove('active', 'done');
    dot.classList.add(state);
  }

  function showStreamResult(streamId, text) {
    const el = document.getElementById(streamId);
    el.style.display = 'block';
    el.textContent = text;
  }

  // SSE POST（fetch + ReadableStream）
  function ssePost(url, body, { onText, onInfo, onDone, onError }) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) return res.json().then((d) => { throw new Error(d.error || 'エラー'); });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      function read() {
        return reader.read().then(({ done, value }) => {
          if (done) return;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const msg = JSON.parse(raw);
              if (msg.type === 'text' && onText) onText(msg.text);
              else if (msg.type === 'info' && onInfo) onInfo(msg.message);
              else if (msg.type === 'done' && onDone) onDone(msg);
              else if (msg.type === 'error' && onError) onError(msg.error);
            } catch (e) { /* skip */ }
          }
          return read();
        });
      }
      return read();
    }).catch((e) => { if (onError) onError(e.message); });
  }

  // 投稿テキストのパース
  function parseGeneratedPosts(text) {
    const posts = [];
    const regex = /投稿(\d)\s*\nカテゴリ[：:]\s*([^\n]*)\n想定ターゲット[：:]\s*([^\n]*)\n狙い[：:]\s*([^\n]*)\n本文[：:]\s*([\s\S]*?)(?=\n投稿\d|\n補足メモ|$)/g;
    let m;
    while ((m = regex.exec(text)) !== null) {
      posts.push({
        number: m[1],
        category: m[2].trim(),
        target: m[3].trim(),
        strategy: m[4].trim(),
        body: m[5].trim(),
      });
    }
    // パース失敗時のフォールバック
    if (!posts.length) {
      const bodyMatches = [...text.matchAll(/本文[：:]\s*([\s\S]*?)(?=\n投稿\d|\n補足メモ|\n------|$)/g)];
      const catMatches = [...text.matchAll(/カテゴリ[：:]\s*([^\n]*)/g)];
      bodyMatches.forEach((bm, i) => {
        posts.push({
          number: String(i + 1),
          category: catMatches[i]?.[1]?.trim() || `投稿${i + 1}`,
          target: '',
          strategy: '',
          body: bm[1].trim(),
        });
      });
    }
    return posts;
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function todayJST() {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
});
