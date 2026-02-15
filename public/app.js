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

  // テンプレート一覧を取得して表示
  loadTemplates();

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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
