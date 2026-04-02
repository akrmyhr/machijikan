// 宮平医院 — スタッフページ JS
(function () {
  'use strict';

  // --- 要素取得 ---
  const authOverlay = document.getElementById('auth-overlay');
  const authForm = document.getElementById('auth-form');
  const passwordInput = document.getElementById('password-input');
  const authError = document.getElementById('auth-error');
  const mainContainer = document.getElementById('main-container');

  const countEl = document.getElementById('count-number');
  const directInput = document.getElementById('direct-count');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const lastUpdatedEl = document.getElementById('last-updated');

  const btnPlus = document.getElementById('btn-plus');
  const btnMinus = document.getElementById('btn-minus');
  const btnSet = document.getElementById('btn-set');
  const btnReset = document.getElementById('btn-reset');

  let password = '';
  let currentCount = 0;
  let eventSource = null;

  // --- 時刻フォーマット ---
  function formatTime(isoString) {
    const d = new Date(isoString);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // --- 表示更新 ---
  function updateDisplay(data) {
    const newCount = data.count;
    if (currentCount !== newCount) {
      countEl.textContent = newCount;
      countEl.classList.add('bump');
      setTimeout(() => countEl.classList.remove('bump'), 300);
      currentCount = newCount;
      directInput.value = newCount;
    }
    if (data.lastUpdated) {
      lastUpdatedEl.textContent = formatTime(data.lastUpdated);
    }
  }

  // --- API 呼び出し ---
  async function apiUpdate(body) {
    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, ...body })
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          // パスワード無効 → 再認証
          password = '';
          mainContainer.style.display = 'none';
          authOverlay.classList.remove('hidden');
          authError.textContent = 'セッションが切れました。再ログインしてください。';
        }
        console.error('API エラー:', data.error);
        return;
      }

      updateDisplay(data);
    } catch (err) {
      console.error('通信エラー:', err);
    }
  }

  // --- SSE 接続 ---
  function connectSSE() {
    if (eventSource) eventSource.close();

    eventSource = new EventSource('/api/events');

    eventSource.onopen = function () {
      statusDot.className = 'status-dot connected';
      statusText.textContent = '接続中';
    };

    eventSource.onmessage = function (e) {
      try {
        updateDisplay(JSON.parse(e.data));
      } catch (err) {
        console.error('データ解析エラー:', err);
      }
    };

    eventSource.onerror = function () {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = '再接続中...';
      eventSource.close();
      setTimeout(connectSSE, 3000);
    };
  }

  // --- 認証 ---
  authForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    authError.textContent = '';

    const pw = passwordInput.value.trim();
    if (!pw) return;

    // パスワード検証（/api/status にダミーリクエストで確認 → /api/update で検証）
    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw, delta: 0 })
      });

      if (res.ok) {
        password = pw;
        authOverlay.classList.add('hidden');
        mainContainer.style.display = 'block';
        connectSSE();
      } else {
        authError.textContent = 'パスワードが正しくありません';
        passwordInput.value = '';
        passwordInput.focus();
      }
    } catch (err) {
      authError.textContent = '接続エラーが発生しました';
    }
  });

  // --- ボタンイベント ---
  // タッチ操作でのズーム防止
  [btnPlus, btnMinus, btnSet, btnReset].forEach(function (btn) {
    btn.addEventListener('touchend', function (e) {
      e.preventDefault();
      btn.click();
    });
  });

  btnPlus.addEventListener('click', () => apiUpdate({ delta: 1 }));
  btnMinus.addEventListener('click', () => apiUpdate({ delta: -1 }));

  btnSet.addEventListener('click', () => {
    const val = parseInt(directInput.value, 10);
    if (!isNaN(val) && val >= 0) {
      apiUpdate({ count: val });
    }
  });

  btnReset.addEventListener('click', () => {
    if (confirm('待ち人数を0にリセットしますか？')) {
      apiUpdate({ count: 0 });
    }
  });

  // --- Enter キーで直接入力を設定 ---
  directInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnSet.click();
    }
  });

  // --- 初期フォーカス ---
  passwordInput.focus();

  // --- QRコード機能 ---
  const btnQrToggle = document.getElementById('btn-qr-toggle');
  const qrPanel = document.getElementById('qr-panel');
  const qrUrl = document.getElementById('qr-url');
  const qrCanvas = document.getElementById('qr-canvas');

  btnQrToggle.addEventListener('click', function () {
    const isHidden = qrPanel.classList.contains('hidden');
    if (isHidden) {
      qrPanel.classList.remove('hidden');
      btnQrToggle.textContent = '📱 QRコードを閉じる';
      const patientUrl = window.location.origin + '/';
      qrUrl.textContent = patientUrl;
      generateQR(patientUrl);
    } else {
      qrPanel.classList.add('hidden');
      btnQrToggle.textContent = '📱 患者用QRコードを表示';
    }
  });

  // --- 軽量QRコード生成（Canvas） ---
  function generateQR(text) {
    // QRコード生成（Google Charts API を利用）
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      qrCanvas.width = 200;
      qrCanvas.height = 200;
      const ctx = qrCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 200, 200);
      ctx.drawImage(img, 0, 0, 200, 200);
    };
    img.onerror = function () {
      // フォールバック: URLを表示するだけ
      qrCanvas.width = 200;
      qrCanvas.height = 200;
      const ctx = qrCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 200, 200);
      ctx.fillStyle = '#333';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('QR生成エラー', 100, 90);
      ctx.fillText('下記URLを共有してください', 100, 120);
    };
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(text);
  }
})();

