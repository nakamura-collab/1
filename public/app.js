document.addEventListener('DOMContentLoaded', () => {
  // ── 要素取得 ──────────────────────────────────────────
  const postContent    = document.getElementById('postContent');
  const charCount      = document.getElementById('charCount');
  const charRing       = document.getElementById('charRing');
  const scheduleToggle = document.getElementById('scheduleToggle');
  const scheduleInputs = document.getElementById('scheduleInputs');
  const scheduledAt    = document.getElementById('scheduledAt');
  const postBtn        = document.getElementById('postBtn');
  const toast          = document.getElementById('toast');
  const credBanner     = document.getElementById('credentialsBanner');

  // モーダル
  const settingsModal  = document.getElementById('settingsModal');
  const settingsBtn    = document.getElementById('settingsBtn');
  const closeModal     = document.getElementById('closeModal');
  const openSettingsFromBanner = document.getElementById('openSettingsFromBanner');
  const saveCredBtn    = document.getElementById('saveCredBtn');
  const testCredBtn    = document.getElementById('testCredBtn');
  const modalStatus    = document.getElementById('modalStatus');

  // タブ
  const tabs           = document.querySelectorAll('.tab');
  const tabContents    = {
    scheduled: document.getElementById('tabScheduled'),
    posted:    document.getElementById('tabPosted'),
    other:     document.getElementById('tabOther'),
  };
  const lists          = {
    scheduled: document.getElementById('listScheduled'),
    posted:    document.getElementById('listPosted'),
    other:     document.getElementById('listOther'),
  };
  const empties        = {
    scheduled: document.getElementById('emptyScheduled'),
    posted:    document.getElementById('emptyPosted'),
    other:     document.getElementById('emptyOther'),
  };
  const badgeScheduled = document.getElementById('badgeScheduled');

  const CIRCUMFERENCE = 2 * Math.PI * 15; // r=15

  // ── 初期化 ──────────────────────────────────────────
  checkCredentials();
  loadPosts();
  setInterval(loadPosts, 15000); // 15秒ごとに更新

  // scheduledAt の最小値を現在時刻に設定
  function updateMinDatetime() {
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(now.getMinutes() + 1);
    scheduledAt.min = now.toISOString().slice(0, 16);
  }
  updateMinDatetime();
  setInterval(updateMinDatetime, 30000);

  // ── 文字数カウンター ──────────────────────────────
  postContent.addEventListener('input', updateCharCount);

  function updateCharCount() {
    const len = postContent.value.length;
    charCount.textContent = len;

    const ratio = len / 280;
    const offset = CIRCUMFERENCE * (1 - Math.min(ratio, 1));
    charRing.style.strokeDashoffset = offset;

    charRing.classList.remove('warn', 'danger');
    if (len > 260) charRing.classList.add('danger');
    else if (len > 230) charRing.classList.add('warn');
  }

  // ── スケジュールトグル ────────────────────────────
  scheduleToggle.addEventListener('change', () => {
    const checked = scheduleToggle.checked;
    scheduleInputs.style.display = checked ? 'flex' : 'none';
    postBtn.innerHTML = checked
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
           <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
           <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
         </svg>スケジュール登録`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
           <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
         </svg>今すぐ投稿`;
  });

  // ── 投稿ボタン ────────────────────────────────────
  postBtn.addEventListener('click', async () => {
    const content = postContent.value.trim();
    if (!content) { showToast('投稿内容を入力してください', true); return; }
    if (content.length > 280) { showToast('280文字以内で入力してください', true); return; }

    const body = { content };
    if (scheduleToggle.checked) {
      if (!scheduledAt.value) { showToast('投稿日時を選択してください', true); return; }
      body.scheduledAt = new Date(scheduledAt.value).toISOString();
    }

    postBtn.disabled = true;
    const origHtml = postBtn.innerHTML;
    postBtn.innerHTML = '<span class="spinner"></span>';

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '投稿に失敗しました');

      postContent.value = '';
      updateCharCount();
      scheduleToggle.checked = false;
      scheduleInputs.style.display = 'none';

      const msg = data.status === 'scheduled'
        ? `✓ ${formatDatetime(data.scheduledAt)} にスケジュール登録しました`
        : '✓ 投稿しました！';
      showToast(msg);
      loadPosts();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      postBtn.disabled = false;
      postBtn.innerHTML = origHtml;
    }
  });

  // ── 投稿一覧の取得・描画 ─────────────────────────
  async function loadPosts() {
    try {
      const res = await fetch('/api/posts');
      const posts = await res.json();
      renderPosts(posts);
    } catch (e) {
      console.error('投稿一覧の取得に失敗:', e);
    }
  }

  function renderPosts(posts) {
    const scheduled = posts.filter((p) => p.status === 'scheduled');
    const posted    = posts.filter((p) => p.status === 'posted');
    const other     = posts.filter((p) => p.status === 'failed' || p.status === 'cancelled');

    renderList('scheduled', scheduled);
    renderList('posted', posted);
    renderList('other', other);

    // スケジュール済みバッジ
    if (scheduled.length > 0) {
      badgeScheduled.style.display = 'inline';
      badgeScheduled.textContent = scheduled.length;
    } else {
      badgeScheduled.style.display = 'none';
    }
  }

  function renderList(key, items) {
    if (items.length === 0) {
      lists[key].innerHTML = '';
      empties[key].style.display = 'block';
      return;
    }
    empties[key].style.display = 'none';
    lists[key].innerHTML = items.map(renderPostItem).join('');

    // キャンセルボタンのイベント登録
    lists[key].querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', () => cancelPost(btn.dataset.id));
    });
  }

  function renderPostItem(post) {
    const statusConfig = {
      scheduled: { dot: 'dot-scheduled', badge: 'badge-scheduled', label: 'スケジュール済み' },
      posted:    { dot: 'dot-posted',    badge: 'badge-posted',    label: '投稿済み' },
      failed:    { dot: 'dot-failed',    badge: 'badge-failed',    label: '失敗' },
      cancelled: { dot: 'dot-cancelled', badge: 'badge-cancelled', label: 'キャンセル' },
    };
    const cfg = statusConfig[post.status] || statusConfig.cancelled;

    let timeHtml = '';
    if (post.status === 'scheduled') {
      timeHtml = `<span class="post-time">投稿予定: ${formatDatetime(post.scheduledAt)}</span>`;
    } else if (post.status === 'posted' && post.postedAt) {
      timeHtml = `<span class="post-time">投稿日時: ${formatDatetime(post.postedAt)}</span>`;
    } else {
      timeHtml = `<span class="post-time">作成: ${formatDatetime(post.createdAt)}</span>`;
    }

    const tweetLink = post.tweetId
      ? `<a class="post-tweet-link" href="https://x.com/i/web/status/${post.tweetId}" target="_blank" rel="noopener">ポストを見る →</a>`
      : '';

    const errorHtml = post.error
      ? `<div class="post-error">エラー: ${escapeHtml(post.error)}</div>`
      : '';

    const cancelBtn = post.status === 'scheduled'
      ? `<button class="btn btn-danger cancel-btn" data-id="${post.id}">キャンセル</button>`
      : '';

    return `
      <div class="post-item">
        <div class="post-status-dot ${cfg.dot}"></div>
        <div class="post-body">
          <div class="post-content">${escapeHtml(post.content)}</div>
          <div class="post-meta">
            <span class="status-badge ${cfg.badge}">${cfg.label}</span>
            ${timeHtml}
            ${tweetLink}
            ${cancelBtn}
          </div>
          ${errorHtml}
        </div>
      </div>
    `;
  }

  // ── スケジュールキャンセル ────────────────────────
  async function cancelPost(id) {
    if (!confirm('この投稿のスケジュールをキャンセルしますか？')) return;
    try {
      const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'キャンセルに失敗しました');
      showToast('スケジュールをキャンセルしました');
      loadPosts();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  // ── タブ切り替え ─────────────────────────────────
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const key = tab.dataset.tab;
      Object.entries(tabContents).forEach(([k, el]) => {
        el.classList.toggle('hidden', k !== key);
      });
    });
  });

  // ── 認証情報チェック ─────────────────────────────
  async function checkCredentials() {
    try {
      const res = await fetch('/api/credentials/check');
      const { configured } = await res.json();
      credBanner.style.display = configured ? 'none' : 'flex';
    } catch (e) {
      credBanner.style.display = 'flex';
    }
  }

  // ── モーダル開閉 ─────────────────────────────────
  function openModal() {
    settingsModal.style.display = 'flex';
    modalStatus.textContent = '';
    modalStatus.className = 'modal-status';
  }
  function closeModalFn() { settingsModal.style.display = 'none'; }

  settingsBtn.addEventListener('click', openModal);
  openSettingsFromBanner.addEventListener('click', openModal);
  closeModal.addEventListener('click', closeModalFn);
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeModalFn();
  });

  // ── 認証情報保存 ─────────────────────────────────
  saveCredBtn.addEventListener('click', async () => {
    const body = {
      apiKey:      document.getElementById('apiKey').value.trim(),
      apiSecret:   document.getElementById('apiSecret').value.trim(),
      accessToken: document.getElementById('accessToken').value.trim(),
      accessSecret: document.getElementById('accessSecret').value.trim(),
    };

    if (!body.apiKey || !body.apiSecret || !body.accessToken || !body.accessSecret) {
      setModalStatus('全ての項目を入力してください', 'error');
      return;
    }

    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      setModalStatus('保存しました', 'success');
      credBanner.style.display = 'none';
      setTimeout(closeModalFn, 1000);
    } catch (err) {
      setModalStatus(err.message, 'error');
    }
  });

  // ── 接続テスト ────────────────────────────────────
  testCredBtn.addEventListener('click', async () => {
    setModalStatus('テスト中...', '');
    testCredBtn.disabled = true;
    try {
      const res = await fetch('/api/credentials/test', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setModalStatus(`接続成功！ @${data.username} として認証されました`, 'success');
    } catch (err) {
      setModalStatus(`接続失敗: ${err.message}`, 'error');
    } finally {
      testCredBtn.disabled = false;
    }
  });

  function setModalStatus(msg, type) {
    modalStatus.textContent = msg;
    modalStatus.className = `modal-status ${type}`;
  }

  // ── ユーティリティ ────────────────────────────────
  let toastTimer = null;

  function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = `toast${isError ? ' error' : ''} show`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  function formatDatetime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
});
