/* 팝업·백그라운드·콘텐츠 스크립트가 함께 쓰는 설정 */

// 파이어폭스는 browser, 크롬은 chrome 네임스페이스 (둘 다 Promise 반환)
const ext = globalThis.browser ?? globalThis.chrome;

const DEFAULT_SETTINGS = {
  blockedHandles: [],
  customWords: [],         // 욕설 목록은 내장하지 않고 사용자가 직접 등록 (비우면 욕설 필터가 꺼짐)
  profanityAction: 'mask', // 'mask' = 별표로 가림 / 'hide' = 댓글 숨김
  profanityLevel: 'loose', // 'loose' = "ㅅ ㅂ" 같은 우회 표기까지 / 'exact' = 적은 그대로만
  spamFilter: true,
  spamSensitivity: 'medium', // 'low' | 'medium' | 'high'
  chatFlood: true,
  chatFloodMax: 5,         // 10초 안에 이보다 많이 보내면 도배로 판단
  hideReplies: false,
  hideComments: false,
  hideSuggestions: false
};

// "@Handle", "handle", "https://www.youtube.com/@handle/videos" 를 모두 "handle"로 통일
function normalizeHandle(value) {
  let handle = String(value || '').trim();
  const match = /\/@([^/?#\s]+)/.exec(handle);
  if (match) handle = match[1];
  try {
    handle = decodeURIComponent(handle);
  } catch (e) {
    // 잘못 인코딩된 주소는 그대로 사용
  }
  return handle.replace(/^@/, '').toLowerCase();
}

function loadSettings() {
  return ext.storage.local.get(DEFAULT_SETTINGS);
}

function saveSettings(changes) {
  return ext.storage.local.set(changes);
}

async function blockHandle(value) {
  const handle = normalizeHandle(value);
  if (!handle) return;
  const { blockedHandles } = await loadSettings();
  if (!blockedHandles.includes(handle)) {
    await saveSettings({ blockedHandles: [...blockedHandles, handle] });
  }
}

async function unblockHandle(handle) {
  const { blockedHandles } = await loadSettings();
  await saveSettings({ blockedHandles: blockedHandles.filter(blocked => blocked !== handle) });
}
