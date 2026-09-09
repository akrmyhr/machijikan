// 宮平医院 — お知らせ表示の共通処理（トップページとお知らせ一覧で使う）
// スタッフが入力した文章は textContent で差し込むため、HTML が混ざっても実行されない。
window.NewsView = (function () {
  'use strict';

  var CATEGORY = {
    news:    { label: 'お知らせ',    cls: '' },
    closure: { label: '休診・時間',  cls: 'tag-closure' },
    vaccine: { label: '予防接種',    cls: 'tag-vaccine' },
    checkup: { label: '健診',        cls: 'tag-checkup' }
  };

  function categoryOf(key) {
    return CATEGORY[key] || CATEGORY.news;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function buildItem(post) {
    var li = document.createElement('li');
    li.className = 'news-item' + (post.pinned ? ' is-pinned' : '');

    var meta = document.createElement('p');
    meta.className = 'news-meta';

    var date = document.createElement('span');
    date.className = 'news-date';
    date.textContent = formatDate(post.createdAt);
    meta.appendChild(date);

    var cat = categoryOf(post.category);
    var tag = document.createElement('span');
    tag.className = 'tag ' + cat.cls;
    tag.textContent = cat.label;
    meta.appendChild(tag);

    if (post.pinned) {
      var pin = document.createElement('span');
      pin.className = 'tag tag-pin';
      pin.textContent = '重要';
      meta.appendChild(pin);
    }

    var title = document.createElement('h3');
    title.className = 'news-title';
    title.textContent = post.title;

    var body = document.createElement('p');
    body.className = 'news-body';
    body.textContent = post.body;

    li.appendChild(meta);
    li.appendChild(title);
    li.appendChild(body);
    return li;
  }

  function render(container, posts, emptyMessage) {
    container.textContent = '';

    if (!posts || posts.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = emptyMessage || '現在お知らせはありません。';
      container.appendChild(empty);
      return;
    }

    var ul = document.createElement('ul');
    ul.className = 'news-list';
    posts.forEach(function (post) {
      ul.appendChild(buildItem(post));
    });
    container.appendChild(ul);
  }

  return {
    CATEGORY: CATEGORY,
    categoryOf: categoryOf,
    formatDate: formatDate,
    render: render
  };
})();
