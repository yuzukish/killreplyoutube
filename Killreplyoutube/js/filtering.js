/* 댓글·채팅 텍스트 판정: 욕설 탐지와 마스킹, 광고·스팸 검사, 채팅 도배 추적 */
/* content.js 보다 먼저 불러와야 합니다 (manifest의 content_scripts 순서) */

const filtering = (() => {
    const ZERO_WIDTH = /[​-‍﻿]/g;
    // loose 모드에서 글자 사이에 끼어들 수 있는 우회 문자 ("ㅅ ㅂ", "f*u*c*k")
    const EVASION = '[\\s._*~\\-]*';

    const LINK_PATTERN = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:com|net|org|io|kr|jp|me|ly|gg|xyz|top|click|shop|site|link|tv|cc|biz|info)\b/gi;
    // 연락처 유도: 메신저 이름만으로는 판단하지 않고 "아이디·문의·링크" 같은 유도 표현이 붙을 때만
    const CONTACT_PATTERN = /(?:카톡|카카오톡|텔레그램|telegram|오픈\s*채팅|디스코드|discord)\s*(?:id|아이디|문의|주소|링크|추가)|\d{2,4}[-.\s]\d{3,4}[-.\s]\d{4}/i;
    const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;
    const LATIN_PATTERN = /[A-Za-z]/g;
    // 대문자 비율은 짧은 글에서 쉽게 튀므로 일정 길이 이상일 때만 본다
    const UPPER_MIN_LETTERS = 10;

    const FLOOD_WINDOW = 10000;   // 도배 판정 구간 10초
    const FLOOD_REPEAT_MAX = 3;   // 같은 내용을 이만큼 보내면 도배
    const FLOOD_HISTORY_MAX = 500;

    // 민감도가 높을수록 적은 양으로도 스팸으로 판단
    const SPAM_THRESHOLDS = {
        low: { links: 2, repeat: 8, emoji: 12, upperRatio: 0.9, contact: false },
        medium: { links: 1, repeat: 6, emoji: 8, upperRatio: 0.7, contact: true },
        high: { links: 1, repeat: 4, emoji: 5, upperRatio: 0.5, contact: true }
    };

    // 같은 문자 반복 검사용 정규식은 민감도마다 한 번만 만들어 재사용
    for (const limits of Object.values(SPAM_THRESHOLDS)) {
        limits.repeatPattern = new RegExp('(.)\\1{' + (limits.repeat - 1) + ',}', 'u');
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /* 눈에 보이는 형태는 그대로 두고 비교에 방해되는 것만 걷어냅니다.
       maskText의 결과가 그대로 화면에 들어가므로 대소문자나 글자를 바꾸면 댓글이 변형됩니다. */
    function normalizeText(value) {
        return String(value ?? '')
            .normalize('NFC')
            .replace(ZERO_WIDTH, '')
            .replace(/[^\S\n]+/g, ' ')   // 줄바꿈은 살리고 가로 공백만 축약
            .trim();
    }

    function buildPattern(word, level) {
        const letters = [...normalizeText(word).replace(/\s+/g, '')].map(escapeRegExp);
        if (!letters.length) return '';
        return level === 'exact' ? letters.join('') : letters.join(EVASION);
    }

    /* 등록된 단어가 없으면 null을 돌려줘서 content.js가 욕설 검사를 건너뛰게 합니다 */
    function createProfanityMatcher(level, customWords) {
        const patterns = (customWords || [])
            .map(word => buildPattern(word, level))
            .filter(Boolean);
        if (!patterns.length) return null;
        // 한글에는 \b가 동작하지 않으므로 단어 경계 대신 부분 일치를 허용
        return { regex: new RegExp(patterns.join('|'), 'gi') };
    }

    function findProfanity(matcher, text) {
        if (!matcher || !text) return [];
        // matchAll은 정규식을 복제해서 쓰므로 lastIndex가 남지 않습니다
        return [...text.matchAll(matcher.regex)].map(match => match[0]);
    }

    function maskText(matcher, text) {
        if (!matcher || !text) return text;
        return text.replace(matcher.regex, match => '*'.repeat([...match].length));
    }

    /* 걸린 이유들을 배열로, 깨끗하면 null을 돌려줍니다 */
    function checkSpam(text, sensitivity) {
        if (!text) return null;
        const limits = SPAM_THRESHOLDS[sensitivity] || SPAM_THRESHOLDS.medium;
        const reasons = [];

        if ((text.match(LINK_PATTERN) || []).length >= limits.links) reasons.push('링크');
        if (limits.contact && CONTACT_PATTERN.test(text)) reasons.push('연락처 유도');
        if (limits.repeatPattern.test(text)) reasons.push('문자 반복');
        if ((text.match(EMOJI_PATTERN) || []).length >= limits.emoji) reasons.push('이모지 과다');

        const letters = text.match(LATIN_PATTERN) || [];
        if (letters.length >= UPPER_MIN_LETTERS) {
            const upper = letters.filter(letter => letter === letter.toUpperCase()).length;
            if (upper / letters.length >= limits.upperRatio) reasons.push('대문자 과다');
        }

        return reasons.length ? reasons : null;
    }

    /* 핸들별로 최근 10초 메시지를 기억하는 추적기.
       도배면 이유 문자열을, 아니면 빈 문자열을 돌려줍니다. */
    function createFloodTracker() {
        const history = new Map();

        return (handle, text, imageCount, max) => {
            const limit = Number(max) > 0 ? Number(max) : DEFAULT_SETTINGS.chatFloodMax;
            // 이모지만 잔뜩 붙인 채팅은 보낸 횟수와 무관하게 걸러냄
            if (imageCount >= limit * 2) return '이모지 도배';
            if (!handle) return '';

            const now = Date.now();
            const recent = (history.get(handle) || []).filter(entry => now - entry.time < FLOOD_WINDOW);
            recent.push({ time: now, text });
            history.set(handle, recent);

            // 오래 머무는 방송에서 기록이 계속 쌓이지 않도록 지나간 핸들은 정리
            if (history.size > FLOOD_HISTORY_MAX) {
                for (const [key, entries] of history) {
                    const last = entries[entries.length - 1];
                    if (!last || now - last.time >= FLOOD_WINDOW) history.delete(key);
                }
            }

            if (recent.length > limit) return '채팅 도배';
            if (recent.filter(entry => entry.text === text).length >= FLOOD_REPEAT_MAX) return '같은 내용 반복';
            return '';
        };
    }

    return { normalizeText, createProfanityMatcher, findProfanity, maskText, checkSpam, createFloodTracker };
})();
