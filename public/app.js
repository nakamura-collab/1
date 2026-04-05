document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('customerForm');
  const formSection = document.getElementById('formSection');
  const previewSection = document.getElementById('previewSection');
  const proposalPreview = document.getElementById('proposalPreview');
  const generateBtn = document.getElementById('generateBtn');
  const backBtn = document.getElementById('backBtn');
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  const templateCards = document.getElementById('templateCards');
  const templateIdInput = document.getElementById('templateId');
  const postToXBtn = document.getElementById('postToXBtn');

  let currentProposal = null;

  // テンプレート一覧を取得して表示
  loadTemplates();
  checkXStatus();
  loadScheduledPosts();

  async function loadTemplates() {
    try {
      const res = await fetch('/api/templates');
      const templates = await res.json();
      renderTemplateCards(templates);
    } catch {
      templateCards.innerHTML = '<p style="color:red;">テンプレートの読み込みに失敗しました</p>';
    }
  }

  function renderTemplateCards(templates) {
    templateCards.innerHTML = templates
      .map(
        (t) => `
      <div class="template-card" data-id="${t.id}">
        <h3>${t.name}</h3>
        <p>${t.sections.join(' / ')}</p>
      </div>
    `
      )
      .join('');

    templateCards.querySelectorAll('.template-card').forEach((card) => {
      card.addEventListener('click', () => {
        templateCards.querySelectorAll('.template-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        templateIdInput.value = card.dataset.id;
      });
    });
  }

  // X API 設定状態を確認してボタン表示を調整
  async function checkXStatus() {
    try {
      const res = await fetch('/api/x-status');
      const { xConfigured, claudeConfigured } = await res.json();
      if (postToXBtn) {
        postToXBtn.title = !claudeConfigured
          ? 'ANTHROPIC_API_KEY が未設定です'
          : !xConfigured
          ? 'X API 認証情報が未設定です'
          : 'Claudeがツイートを生成してXに投稿します';
        postToXBtn.disabled = false;
      }
    } catch { /* ignore */ }
  }

  // フォーム送信
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!templateIdInput.value) {
      alert('提案テンプレートを選択してください');
      return;
    }

    const customer = {
      companyName: document.getElementById('companyName').value.trim(),
      industry: document.getElementById('industry').value,
      department: document.getElementById('department').value.trim(),
      contactName: document.getElementById('contactName').value.trim(),
      employeeCount: document.getElementById('employeeCount').value,
      budget: document.getElementById('budget').value.trim(),
      projectName: document.getElementById('projectName').value.trim(),
      challenges: document.getElementById('challenges').value.trim(),
      timeline: document.getElementById('timeline').value.trim(),
    };

    generateBtn.disabled = true;
    generateBtn.innerHTML = '<span class="spinner"></span>生成中...';

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer, templateId: templateIdInput.value }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '生成に失敗しました');
      }

      const proposal = await res.json();
      currentProposal = proposal;
      renderProposal(proposal);
      formSection.style.display = 'none';
      previewSection.style.display = 'block';
      window.scrollTo(0, 0);
    } catch (err) {
      alert(err.message);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '提案資料を生成';
    }
  });

  // プレビュー描画
  function renderProposal(proposal) {
    const sectionsHtml = proposal.sections
      .map((s) => {
        let body = '';
        if (s.items) {
          body = `<ul>${s.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
        } else if (s.content) {
          body = `<div class="section-content">${escapeHtml(s.content)}</div>`;
        }
        return `
        <div class="proposal-section">
          <h2>${escapeHtml(s.title)}</h2>
          ${body}
        </div>
      `;
      })
      .join('');

    proposalPreview.innerHTML = `
      <div class="proposal-cover">
        <h1>${escapeHtml(proposal.title)}</h1>
        <div class="meta">
          <div>提出日: ${escapeHtml(proposal.date)}</div>
          ${proposal.customer.companyName ? `<div>${escapeHtml(proposal.customer.companyName)} 御中</div>` : ''}
          ${proposal.customer.department ? `<div>${escapeHtml(proposal.customer.department)} ${proposal.customer.contactName ? escapeHtml(proposal.customer.contactName) + ' 様' : ''}</div>` : ''}
        </div>
      </div>
      ${sectionsHtml}
      <div class="proposal-footer">
        本資料は ${escapeHtml(proposal.customer.companyName)} 様向けに作成されたものです。無断転載・複製はご遠慮ください。
      </div>
    `;
  }

  // 戻るボタン
  backBtn.addEventListener('click', () => {
    previewSection.style.display = 'none';
    formSection.style.display = 'block';
  });

  // PDFダウンロード
  downloadPdfBtn.addEventListener('click', () => {
    const element = document.getElementById('proposalPreview');
    const companyName = document.getElementById('companyName').value.trim() || '提案資料';

    const opt = {
      margin: 0,
      filename: `${companyName}_提案資料.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    downloadPdfBtn.disabled = true;
    downloadPdfBtn.textContent = 'PDF生成中...';

    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(() => {
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.textContent = 'PDFダウンロード';
      })
      .catch(() => {
        alert('PDF生成に失敗しました');
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.textContent = 'PDFダウンロード';
      });
  });

  // ── X 投稿ボタン ───────────────────────────────────────────
  if (postToXBtn) {
    postToXBtn.addEventListener('click', async () => {
      if (!currentProposal) return;
      openXModal(currentProposal);
    });
  }

  // ── X 投稿モーダル ─────────────────────────────────────────
  async function openXModal(proposal) {
    const modal = document.getElementById('xModal');
    const tweetTextarea = document.getElementById('tweetTextarea');
    const charCount = document.getElementById('charCount');
    const generateTweetBtn = document.getElementById('generateTweetBtn');
    const postNowBtn = document.getElementById('postNowBtn');
    const scheduleBtn = document.getElementById('scheduleBtn');
    const scheduleSection = document.getElementById('scheduleSection');
    const scheduledAtInput = document.getElementById('scheduledAt');
    const confirmScheduleBtn = document.getElementById('confirmScheduleBtn');
    const modalStatus = document.getElementById('modalStatus');

    modal.style.display = 'flex';
    modalStatus.textContent = '';
    scheduleSection.style.display = 'none';

    // 文字数カウント
    function updateCharCount() {
      const len = tweetTextarea.value.length;
      charCount.textContent = `${len} / 280`;
      charCount.className = 'char-count' + (len > 280 ? ' over' : len > 240 ? ' warn' : '');
    }
    tweetTextarea.addEventListener('input', updateCharCount);
    updateCharCount();

    // ツイート自動生成
    async function generateTweet() {
      generateTweetBtn.disabled = true;
      generateTweetBtn.innerHTML = '<span class="spinner spinner-dark"></span>生成中...';
      modalStatus.textContent = '';
      try {
        const res = await fetch('/api/generate-tweet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposal }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        tweetTextarea.value = data.tweetText;
        updateCharCount();
      } catch (err) {
        modalStatus.textContent = 'エラー: ' + err.message;
        modalStatus.className = 'modal-status error';
      } finally {
        generateTweetBtn.disabled = false;
        generateTweetBtn.textContent = '再生成';
      }
    }

    // 初回は自動生成
    await generateTweet();

    generateTweetBtn.onclick = generateTweet;

    // 即時投稿
    postNowBtn.onclick = async () => {
      const text = tweetTextarea.value.trim();
      if (!text) return alert('投稿内容を入力してください');
      if (text.length > 280) return alert('280文字以内にしてください');

      postNowBtn.disabled = true;
      postNowBtn.innerHTML = '<span class="spinner"></span>投稿中...';
      modalStatus.textContent = '';

      try {
        const res = await fetch('/api/post-to-x', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tweetText: text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        modalStatus.textContent = 'Xへの投稿が完了しました！';
        modalStatus.className = 'modal-status success';
        setTimeout(() => closeXModal(), 2000);
      } catch (err) {
        modalStatus.textContent = 'エラー: ' + err.message;
        modalStatus.className = 'modal-status error';
      } finally {
        postNowBtn.disabled = false;
        postNowBtn.textContent = '今すぐ投稿';
      }
    };

    // スケジュール投稿セクション表示
    scheduleBtn.onclick = () => {
      scheduleSection.style.display = scheduleSection.style.display === 'none' ? 'block' : 'none';
      // デフォルト: 1時間後
      if (!scheduledAtInput.value) {
        const d = new Date(Date.now() + 60 * 60 * 1000);
        d.setSeconds(0, 0);
        scheduledAtInput.value = d.toISOString().slice(0, 16);
      }
    };

    // スケジュール確定
    confirmScheduleBtn.onclick = async () => {
      const text = tweetTextarea.value.trim();
      if (!text) return alert('投稿内容を入力してください');
      if (text.length > 280) return alert('280文字以内にしてください');
      if (!scheduledAtInput.value) return alert('投稿日時を選択してください');

      confirmScheduleBtn.disabled = true;
      confirmScheduleBtn.innerHTML = '<span class="spinner"></span>登録中...';
      modalStatus.textContent = '';

      try {
        const res = await fetch('/api/schedule-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tweetText: text, scheduledAt: new Date(scheduledAtInput.value).toISOString() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        modalStatus.textContent = `スケジュール登録完了: ${formatDate(data.scheduledAt)}`;
        modalStatus.className = 'modal-status success';
        loadScheduledPosts();
        setTimeout(() => closeXModal(), 2000);
      } catch (err) {
        modalStatus.textContent = 'エラー: ' + err.message;
        modalStatus.className = 'modal-status error';
      } finally {
        confirmScheduleBtn.disabled = false;
        confirmScheduleBtn.textContent = '登録する';
      }
    };
  }

  function closeXModal() {
    document.getElementById('xModal').style.display = 'none';
  }

  document.getElementById('closeModal').addEventListener('click', closeXModal);
  document.getElementById('xModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeXModal();
  });

  // ── スケジュール投稿一覧 ────────────────────────────────────
  async function loadScheduledPosts() {
    try {
      const res = await fetch('/api/scheduled-posts');
      const posts = await res.json();
      renderScheduledPosts(posts);
    } catch { /* ignore */ }
  }

  function renderScheduledPosts(posts) {
    const section = document.getElementById('scheduledPostsSection');
    const list = document.getElementById('scheduledPostsList');
    if (!posts.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    list.innerHTML = posts.map((p) => `
      <div class="scheduled-post-item" data-id="${p.id}">
        <div class="scheduled-post-status status-${p.status}">${statusLabel(p.status)}</div>
        <div class="scheduled-post-time">${formatDate(p.scheduledAt)}</div>
        <div class="scheduled-post-text">${escapeHtml(p.tweetText)}</div>
        ${p.status === 'pending' ? `<button class="btn btn-cancel" data-id="${p.id}">キャンセル</button>` : ''}
      </div>
    `).join('');

    list.querySelectorAll('.btn-cancel').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('このスケジュールをキャンセルしますか？')) return;
        try {
          await fetch(`/api/schedule-post/${btn.dataset.id}`, { method: 'DELETE' });
          loadScheduledPosts();
        } catch {
          alert('キャンセルに失敗しました');
        }
      });
    });
  }

  function statusLabel(status) {
    return { pending: '待機中', posted: '投稿済', failed: '失敗' }[status] || status;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
