// 宮平医院 — お知らせ一覧ページ
(function () {
  'use strict';

  var container = document.getElementById('news-list');
  var currentStamp = null;
  var eventSource = null;

  function loadNews() {
    fetch('/api/news')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        currentStamp = data.newsUpdatedAt || null;
        window.NewsView.render(container, data.posts || [], '現在お知らせはありません。');
      })
      .catch(function () {
        window.NewsView.render(container, [], 'お知らせを読み込めませんでした。時間をおいて再度お試しください。');
      });
  }

  // スタッフが更新したら自動で反映されるよう、更新時刻の変化を SSE で監視する
  function connectSSE() {
    if (eventSource) eventSource.close();

    eventSource = new EventSource('/api/events');

    eventSource.onmessage = function (e) {
      try {
        var data = JSON.parse(e.data);
        if (data.newsUpdatedAt && data.newsUpdatedAt !== currentStamp) {
          currentStamp = data.newsUpdatedAt;
          loadNews();
        }
      } catch (err) {
        console.error('データ解析エラー:', err);
      }
    };

    eventSource.onerror = function () {
      eventSource.close();
      setTimeout(connectSSE, 5000);
    };
  }

  loadNews();
  connectSSE();
})();
