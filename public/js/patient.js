// 宮平医院 — 患者ページ JS
(function () {
  'use strict';

  const countEl = document.getElementById('count-number');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const lastUpdatedEl = document.getElementById('last-updated');
  const messageText = document.getElementById('message-text');

  let currentCount = null;
  let eventSource = null;

  // --- メッセージ ---
  function getMessage(count) {
    if (count === 0) return '現在お待ちの方はいません 🎉';
    if (count <= 3) return 'まもなくお呼びできます';
    if (count <= 7) return 'しばらくお待ちください';
    return '大変混み合っております';
  }

  // --- 時刻フォーマット ---
  function formatTime(isoString) {
    const d = new Date(isoString);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `最終更新: ${h}:${m}`;
  }

  // --- カウント更新 ---
  function updateDisplay(data) {
    const newCount = data.count;

    if (currentCount !== newCount) {
      countEl.textContent = newCount;
      countEl.classList.add('bump');
      setTimeout(() => countEl.classList.remove('bump'), 300);
      currentCount = newCount;
    }

    messageText.textContent = getMessage(newCount);
    lastUpdatedEl.textContent = formatTime(data.lastUpdated);
  }

  // --- SSE 接続 ---
  function connectSSE() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource('/api/events');

    eventSource.onopen = function () {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'リアルタイム接続中';
    };

    eventSource.onmessage = function (e) {
      try {
        const data = JSON.parse(e.data);
        updateDisplay(data);
      } catch (err) {
        console.error('データ解析エラー:', err);
      }
    };

    eventSource.onerror = function () {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = '再接続中...';
      eventSource.close();
      // 3秒後に再接続
      setTimeout(connectSSE, 3000);
    };
  }

  // --- 初期化 ---
  connectSSE();
})();
