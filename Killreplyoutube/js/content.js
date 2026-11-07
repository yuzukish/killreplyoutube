/* 유튜브 페이지와 실시간 채팅 창(iframe)에서 실행되어, 설정에 따라 댓글·채팅을 숨기거나 욕설을 가립니다 */

const COMMENT_SELECTOR = 'ytd-comment-view-model, ytd-comment-renderer';
const CHAT_SELECTOR = 'yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer';
// 이 요소들 안에서 변화가 생길 때만 다시 검사 (영상 재생 중 다른 DOM 변화는 무시)
const WATCH_ROOTS = 'ytd-comments, ytd-engagement-panel-section-list-renderer, yt-live-chat-app';
const HIDDEN_CLASS = 'krt-hidden';
const LAYOUT_CLASSES = {
  hideReplies: 'krt-hide-replies',
  hideComments: 'krt-hide-comments',
  hideSuggestions: 'krt-hide-suggestions'
};

let settings = DEFAULT_SETTINGS;
let blockedHandles = new Set();
let profanityMatcher = null;
let scanQueued = false;
const checkFlood = filtering.createFloodTracker();
// 요소별 처리 결과: 유튜브가 요소를 재사용했는지 확인할 signature, 되돌릴 마스킹 기록, 도배 판정
const processed = new WeakMap();

function commentHandle(el) {
  const link = el.querySelector('#author-text, #author-comment-badge a, #header-author a');
  if (!link) return '';
  const href = link.getAttribute('href') || '';
  return normalizeHandle(href.includes('/@') ? href : link.textContent);
}

function judge(handle, text, floodReason, trusted) {
  if (handle && blockedHandles.has(handle)) return { hide: '차단한 사용자' };
  if (floodReason) return { hide: floodReason };

  const normalized = filtering.normalizeText(text);
  if (settings.spamFilter && !trusted) {
    const reasons = filtering.checkSpam(normalized, settings.spamSensitivity);
    if (reasons) return { hide: '광고·스팸 (' + reasons.join(', ') + ')' };
  }
  if (profanityMatcher && filtering.findProfanity(profanityMatcher, normalized).length) {
    return settings.profanityAction === 'hide' ? { hide: '욕설' } : { mask: true };
  }
  return {};
}

function setHidden(el, reason) {
  el.classList.toggle(HIDDEN_CLASS, !!reason);
  if (reason) el.dataset.krtReason = reason;
  else delete el.dataset.krtReason;
}

function maskNodes(root) {
  const masked = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const original = node.nodeValue;
    const normalized = filtering.normalizeText(original);
    const result = filtering.maskText(profanityMatcher, normalized);
    if (result !== normalized) {
      node.nodeValue = result;
      masked.push([node, original, result]);
    }
  }
  return masked;
}

function restoreMasked(record) {
  for (const [node, original, result] of record?.masked || []) {
    // 유튜브가 이미 다른 내용으로 바꾼 노드는 건드리지 않음
    if (node.nodeValue === result) node.nodeValue = original;
  }
}

function processItem(el, item, force) {
  const { handle, content, hideTarget } = item;
  if (!content) return;

  const prev = processed.get(el);
  const signature = handle + '\n' + content.textContent;
  const isNew = !prev || prev.signature !== signature;
  if (!isNew && !force) return;

  restoreMasked(prev);
  const text = content.textContent;

  // 도배 기록은 메시지마다 한 번만 남겨야 하므로 새 메시지일 때만 검사하고 결과를 보관
  let flood = isNew ? null : prev.flood;
  if (isNew && item.isChat && settings.chatFlood && !item.trusted) {
    flood = checkFlood(handle, text, content.querySelectorAll('img').length, settings.chatFloodMax);
  }

  const verdict = judge(handle, text, settings.chatFlood ? flood : null, item.trusted);
  setHidden(hideTarget, verdict.hide);
  const masked = verdict.mask ? maskNodes(content) : [];
  processed.set(el, { signature: handle + '\n' + content.textContent, masked, flood });
}

function scan(force = false) {
  document.querySelectorAll(COMMENT_SELECTOR).forEach(el => processItem(el, {
    handle: commentHandle(el),
    content: el.querySelector('#content-text'),
    // 원댓글이 걸리면 답글까지 스레드 전체를, 답글이면 그 답글만 숨김
    hideTarget: el.closest('ytd-comment-replies-renderer') ? el : el.closest('ytd-comment-thread-renderer') || el
  }, force));

  document.querySelectorAll(CHAT_SELECTOR).forEach(el => processItem(el, {
    handle: normalizeHandle(el.querySelector('#author-name')?.textContent),
    content: el.querySelector('#message'),
    hideTarget: el,
    isChat: true,
    // 방송 주인·매니저 채팅은 도배·광고 판정에서 제외
    trusted: ['owner', 'moderator'].includes(el.getAttribute('author-type'))
  }, force));
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  // 화면에 그리기 전에 처리해서 걸러질 댓글이 잠깐 보이는 것을 막음 (백그라운드 탭에서는 rAF가 멈추므로 타이머 사용)
  const schedule = document.hidden ? callback => setTimeout(callback, 200) : requestAnimationFrame;
  schedule(() => {
    scanQueued = false;
    scan();
  });
}

function applySettings(next) {
  settings = next;
  blockedHandles = new Set(next.blockedHandles.map(normalizeHandle));
  profanityMatcher = filtering.createProfanityMatcher(next.profanityLevel, next.customWords);
  for (const [key, className] of Object.entries(LAYOUT_CLASSES)) {
    document.documentElement.classList.toggle(className, next[key]);
  }
  scan(true);
}

const observer = new MutationObserver(records => {
  const touched = records.some(record => {
    const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
    return target?.closest(WATCH_ROOTS);
  });
  if (touched) queueScan();
});

loadSettings().then(next => {
  applySettings(next);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
});

ext.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') loadSettings().then(applySettings);
});

