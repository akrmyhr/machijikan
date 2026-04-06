// 宮平医院 — スタッフページ JS
(function () {
  'use strict';

  // --- 要素取得 ---
  var authOverlay = document.getElementById('auth-overlay');
  var authForm = document.getElementById('auth-form');
  var passwordInput = document.getElementById('password-input');
  var authError = document.getElementById('auth-error');
  var mainContainer = document.getElementById('main-container');

  var countEl = document.getElementById('count-number');
  var statusDot = document.getElementById('status-dot');
  var statusText = document.getElementById('status-text');
  var lastUpdatedEl = document.getElementById('last-updated');

  var btnPlus = document.getElementById('btn-plus');
  var btnMinus = document.getElementById('btn-minus');
  var btnReset = document.getElementById('btn-reset');

  var btnOpen = document.getElementById('btn-open');
  var btnClosed = document.getElementById('btn-closed');
  var controlsPanel = document.getElementById('controls-panel');
  var closedPanel = document.getElementById('closed-panel');

  var password = '';
  var currentCount = 0;
  var currentClinicStatus = 'open';
  var eventSource = null;
  var SESSION_DURATION = 3 * 60 * 60 * 1000; // 3時間

  // --- セッション管理 ---
  function saveSession(pw) {
    localStorage.setItem('staff_pw', pw);
    localStorage.setItem('staff_expires', Date.now() + SESSION_DURATION);
  }

  function loadSession() {
    var pw = localStorage.getItem('staff_pw');
    var expires = parseInt(localStorage.getItem('staff_expires'), 10);
    if (pw && expires && Date.now() < expires) {
      return pw;
    }
    clearSession();
    return null;
  }

  function clearSession() {
    localStorage.removeItem('staff_pw');
    localStorage.removeItem('staff_expires');
  }

  // --- 時刻フォーマット ---
  function formatTime(isoString) {
    var d = new Date(isoString);
    var h = d.getHours().toString().padStart(2, '0');
    var m = d.getMinutes().toString().padStart(2, '0');
    return h + ':' + m;
  }

  // --- UI ステータス切り替え ---
  function updateClinicStatusUI(status) {
    currentClinicStatus = status;

    if (status === 'open') {
      btnOpen.classList.add('active');
      btnClosed.classList.remove('active');
      controlsPanel.classList.remove('hidden');
      closedPanel.classList.add('hidden');
      btnPlus.disabled = false;
      btnMinus.disabled = false;
    } else {
      btnOpen.classList.remove('active');
      btnClosed.classList.add('active');
      controlsPanel.classList.add('hidden');
      closedPanel.classList.remove('hidden');
      btnPlus.disabled = true;
      btnMinus.disabled = true;
    }
  }

  // --- 通知音（Web Audio API） ---
  var audioCtx = null;

  function playChime() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      var now = audioCtx.currentTime;

      // 音1: C5 (523Hz)
      var osc1 = audioCtx.createOscillator();
      var gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.value = 523;
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);

      // 音2: E5 (659Hz) — 少し遅れて
      var osc2 = audioCtx.createOscillator();
      var gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.value = 659;
      gain2.gain.setValueAtTime(0, now + 0.15);
      gain2.gain.linearRampToValueAtTime(0.12, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.8);
    } catch (e) {
      // Audio API未対応時は無視
    }
  }

  // --- 表示更新 ---
  function updateDisplay(data) {
    var newCount = data.count;
    if (currentCount !== newCount) {
      // 0→1 の変化で通知音
      if (currentCount === 0 && newCount >= 1) {
        playChime();
      }
      countEl.textContent = newCount;
      countEl.classList.add('bump');
      setTimeout(function () { countEl.classList.remove('bump'); }, 300);
      currentCount = newCount;
    }
    if (data.lastUpdated) {
      lastUpdatedEl.textContent = formatTime(data.lastUpdated);
    }
    if (data.clinicStatus) {
      updateClinicStatusUI(data.clinicStatus);
    }
  }

  // --- API 呼び出し（人数） ---
  async function apiUpdate(body) {
    try {
      var res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ password: password }, body))
      });

      var data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          password = '';
          clearSession();
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

  // --- API 呼び出し（ステータス変更） ---
  async function apiSetClinicStatus(status) {
    try {
      var res = await fetch('/api/clinic-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password, status: status })
      });

      var data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          password = '';
          clearSession();
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

  // --- 認証成功時の処理 ---
  function onAuthSuccess(pw) {
    password = pw;
    saveSession(pw);
    authOverlay.classList.add('hidden');
    mainContainer.style.display = 'block';
    connectSSE();
  }

  // --- 認証 ---
  authForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    authError.textContent = '';

    var pw = passwordInput.value.trim();
    if (!pw) return;

    try {
      var res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw, delta: 0 })
      });

      if (res.ok) {
        onAuthSuccess(pw);
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
  [btnPlus, btnMinus, btnReset, btnOpen, btnClosed].forEach(function (btn) {
    btn.addEventListener('touchend', function (e) {
      e.preventDefault();
      btn.click();
    });
  });

  btnPlus.addEventListener('click', function () {
    if (currentClinicStatus === 'open') apiUpdate({ delta: 1 });
  });

  btnMinus.addEventListener('click', function () {
    if (currentClinicStatus === 'open') apiUpdate({ delta: -1 });
  });

  btnReset.addEventListener('click', function () {
    if (confirm('待ち人数を0にリセットしますか？')) {
      apiUpdate({ count: 0 });
    }
  });

  // --- ステータス切り替えボタン ---
  btnOpen.addEventListener('click', function () {
    if (currentClinicStatus !== 'open') {
      apiSetClinicStatus('open');
    }
  });

  btnClosed.addEventListener('click', function () {
    if (currentClinicStatus !== 'closed') {
      if (confirm('受付を終了しますか？\n（待ち人数は0にリセットされます）')) {
        apiSetClinicStatus('closed');
      }
    }
  });

  // --- 自動ログイン試行 ---
  var savedPw = loadSession();
  if (savedPw) {
    fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: savedPw, delta: 0 })
    }).then(function (res) {
      if (res.ok) {
        onAuthSuccess(savedPw);
      } else {
        clearSession();
        passwordInput.focus();
      }
    }).catch(function () {
      passwordInput.focus();
    });
  } else {
    passwordInput.focus();
  }

  // --- QRコード機能 ---
  var btnQrToggle = document.getElementById('btn-qr-toggle');
  var qrPanel = document.getElementById('qr-panel');
  var qrUrl = document.getElementById('qr-url');
  var qrCanvas = document.getElementById('qr-canvas');

  btnQrToggle.addEventListener('click', function () {
    var isHidden = qrPanel.classList.contains('hidden');
    if (isHidden) {
      qrPanel.classList.remove('hidden');
      btnQrToggle.textContent = '📱 QRコードを閉じる';
      var patientUrl = window.location.origin + '/';
      qrUrl.textContent = patientUrl;
      generateQR(patientUrl);
    } else {
      qrPanel.classList.add('hidden');
      btnQrToggle.textContent = '📱 患者用QRコードを表示';
    }
  });

  function generateQR(text) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      qrCanvas.width = 200;
      qrCanvas.height = 200;
      var ctx = qrCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 200, 200);
      ctx.drawImage(img, 0, 0, 200, 200);
    };
    img.onerror = function () {
      qrCanvas.width = 200;
      qrCanvas.height = 200;
      var ctx = qrCanvas.getContext('2d');
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
