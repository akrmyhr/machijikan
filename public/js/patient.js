// 宮平医院 — トップページ（受付状況・お知らせ）
(function () {
  'use strict';

  var statusPill = document.getElementById('status-pill');
  var waitOpen = document.getElementById('wait-open');
  var waitClosed = document.getElementById('wait-closed');
  var waitNumber = document.getElementById('wait-number');
  var waitMessage = document.getElementById('wait-message');
  var connDot = document.getElementById('conn-dot');
  var connText = document.getElementById('conn-text');
  var lastUpdatedEl = document.getElementById('last-updated');
  var noticeBanner = document.getElementById('notice-banner');
  var noticeText = document.getElementById('notice-text');
  var newsHome = document.getElementById('news-home');

  var HOME_NEWS_LIMIT = 3;

  var currentCount = null;
  var currentStatus = null;
  var currentNotice = null;
  var currentNewsStamp = null;
  var eventSource = null;

  // --- 待ち人数に応じた案内文 ---
  function getMessage(count) {
    if (count === 0) return 'お待ちの方はいません';
    if (count <= 3) return 'まもなくご案内できます';
    if (count <= 7) return 'しばらくお待ちください';
    return '混み合っております';
  }

  function formatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    return '最終更新 ' + h + ':' + m;
  }

  // --- 診療中／受付終了の切り替え ---
  function applyStatus(status) {
    if (status === 'open') {
      statusPill.textContent = '診療中';
      statusPill.className = 'status-pill is-open';
      waitOpen.classList.remove('hidden');
      waitClosed.classList.add('hidden');
    } else {
      statusPill.textContent = '受付時間外';
      statusPill.className = 'status-pill is-closed';
      waitOpen.classList.add('hidden');
      waitClosed.classList.remove('hidden');
    }
  }

  // --- 受付状況の反映 ---
  function updateDisplay(data) {
    var newStatus = data.clinicStatus || 'closed';
    if (newStatus !== currentStatus) {
      currentStatus = newStatus;
      applyStatus(newStatus);
    }

    if (newStatus === 'open') {
      var newCount = data.count;
      if (currentCount !== newCount) {
        waitNumber.textContent = newCount;
        waitNumber.classList.add('bump');
        setTimeout(function () { waitNumber.classList.remove('bump'); }, 250);
        currentCount = newCount;
      }
      waitMessage.textContent = getMessage(newCount);
    }

    // 短い告知（診療中・受付終了どちらでも表示）
    var newNotice = data.announcement || '';
    if (currentNotice !== newNotice) {
      currentNotice = newNotice;
      if (newNotice) {
        noticeText.textContent = newNotice;
        noticeBanner.classList.remove('hidden');
      } else {
        noticeText.textContent = '';
        noticeBanner.classList.add('hidden');
      }
    }

    if (data.lastUpdated) {
      lastUpdatedEl.textContent = formatTime(data.lastUpdated);
    }

    // お知らせが更新されていたら取り直す
    if (data.newsUpdatedAt && data.newsUpdatedAt !== currentNewsStamp) {
      currentNewsStamp = data.newsUpdatedAt;
      loadNews();
    }
  }

  // --- お知らせ（最新数件） ---
  function loadNews() {
    fetch('/api/news')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var posts = (data.posts || []).slice(0, HOME_NEWS_LIMIT);
        window.NewsView.render(newsHome, posts, '現在お知らせはありません。');
      })
      .catch(function () {
        window.NewsView.render(newsHome, [], 'お知らせを読み込めませんでした。');
      });
  }

  // --- SSE 接続 ---
  function connectSSE() {
    if (eventSource) eventSource.close();

    eventSource = new EventSource('/api/events');

    eventSource.onopen = function () {
      connDot.className = 'conn-dot connected';
      connText.textContent = '自動で更新されます';
    };

    eventSource.onmessage = function (e) {
      try {
        updateDisplay(JSON.parse(e.data));
      } catch (err) {
        console.error('データ解析エラー:', err);
      }
    };

    eventSource.onerror = function () {
      connDot.className = 'conn-dot disconnected';
      connText.textContent = '再接続しています…';
      eventSource.close();
      setTimeout(connectSSE, 3000);
    };
  }

  connectSSE();
})();
