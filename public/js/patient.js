// 宮平医院 — 患者ページ JS
(function () {
  'use strict';

  const countEl = document.getElementById('count-number');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const lastUpdatedEl = document.getElementById('last-updated');
  const messageText = document.getElementById('message-text');
  const cardOpen = document.getElementById('card-open');
  const cardClosed = document.getElementById('card-closed');
  const messageArea = document.getElementById('message-area');

  let currentCount = null;
  let currentStatus = null;
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
    return '最終更新: ' + h + ':' + m;
  }

  // --- 表示更新 ---
  function updateDisplay(data) {
    var newCount = data.count;
    var newStatus = data.clinicStatus || 'open';

    // ステータス切り替え
    if (newStatus !== currentStatus) {
      currentStatus = newStatus;
      if (newStatus === 'closed') {
        cardOpen.classList.add('hidden');
        cardClosed.classList.remove('hidden');
        messageArea.classList.add('hidden');
      } else {
        cardOpen.classList.remove('hidden');
        cardClosed.classList.add('hidden');
        messageArea.classList.remove('hidden');
      }
    }

    // カウント更新（open時のみ）
    if (newStatus === 'open') {
      if (currentCount !== newCount) {
        countEl.textContent = newCount;
        countEl.classList.add('bump');
        setTimeout(function () { countEl.classList.remove('bump'); }, 300);
        currentCount = newCount;
      }
      messageText.textContent = getMessage(newCount);
    }

    if (data.lastUpdated) {
      lastUpdatedEl.textContent = formatTime(data.lastUpdated);
    }
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
        var data = JSON.parse(e.data);
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
