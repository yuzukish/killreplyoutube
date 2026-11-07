/* 설치 안내 페이지, 댓글 작성자 우클릭 차단 메뉴 */

// 크롬(서비스 워커)은 여기서 불러오고, 파이어폭스(이벤트 페이지)는 manifest의 background.scripts가 먼저 불러옴
if (typeof importScripts === 'function') importScripts('settings.js');

ext.runtime.onInstalled.addListener(async details => {
  // 업데이트하거나 임시 부가 기능을 다시 읽어들일 때 같은 id로 또 만들면 오류가 나므로 먼저 비움
  await ext.contextMenus.removeAll();

  ext.contextMenus.create({
    id: 'block-handle',
    title: '이 사용자를 차단',
    contexts: ['link'],
    targetUrlPatterns: ['*://*.youtube.com/@*']
  });

  if (details.reason === 'install') {
    ext.tabs.create({ url: ext.runtime.getURL('popup/popup.html') });
  }
});

ext.contextMenus.onClicked.addListener(info => {
  if (info.menuItemId === 'block-handle') blockHandle(info.linkUrl);
});
