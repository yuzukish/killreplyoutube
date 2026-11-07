/* 팝업: 설정을 바꾸면 바로 저장되고, 열려 있는 유튜브 탭에 즉시 반영됩니다 */
/* ext, DEFAULT_SETTINGS, normalizeHandle, loadSettings, saveSettings, blockHandle, unblockHandle 는
   js/settings.js 에 있습니다. 같은 이름을 여기서 다시 선언하면 전역 렉시컬 스코프가 겹쳐
   이 파일 전체가 SyntaxError로 실행되지 않습니다. */

const handleForm = document.getElementById("handle-form");
const handleInput = document.getElementById("handle-input");
const handleList = document.getElementById("handle-list");
const clearForm = document.getElementById("clear-form");
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
const blockedHandleList = document.getElementById("blocked-handles");
const settingInputs = document.querySelectorAll("[data-setting]");

// 검색창은 저장소를 다시 읽지 않고 마지막으로 그린 목록에서 걸러냅니다
let blockedHandles = [];

function readInput(input) {
    const key = input.dataset.setting;
    const fallback = DEFAULT_SETTINGS[key];

    if (input.type === "checkbox") return input.checked;
    if (Array.isArray(fallback)) return input.value.split("\n").map(line => line.trim()).filter(Boolean);
    if (typeof fallback === "number") {
        const number = Number(input.value);
        return input.value !== "" && number >= Number(input.min || 0) ? number : fallback;
    }
    return input.value;
}

function writeInput(input, value) {
    if (input.type === "checkbox") input.checked = value;
    else input.value = Array.isArray(value) ? value.join("\n") : value;
}

function createRow(handle, actionLabel, onActivate) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const action = document.createElement("button");

    name.textContent = "@" + handle;
    action.type = "button";
    action.className = "remove-button";
    action.textContent = actionLabel;
    action.addEventListener("click", onActivate);

    item.append(name, action);
    return item;
}

function createNotice(message) {
    const item = document.createElement("li");
    item.className = "alert";
    item.textContent = message;
    return item;
}

function renderHandles(handles) {
    handleList.replaceChildren(...handles.map(handle =>
        createRow(handle, "해제", () => unblockHandle(handle))));
}

/* 아래쪽 읽기 전용 전체 목록 */
function renderBlockedList(handles) {
    if (!handles.length) {
        blockedHandleList.replaceChildren(createNotice("지금은 차단된 사용자가 없습니다."));
        return;
    }
    blockedHandleList.replaceChildren(...handles.map(handle => {
        const item = document.createElement("li");
        item.textContent = "@" + handle;
        return item;
    }));
}

function renderSearch(handles) {
    // 입력값도 핸들과 같은 방식으로 다듬어야 "@Name" 으로 검색해도 걸립니다
    const keyword = normalizeHandle(searchInput.value);
    if (!keyword) {
        searchResults.replaceChildren();
        return;
    }
    const matched = handles.filter(handle => handle.includes(keyword));
    if (!matched.length) {
        searchResults.replaceChildren(createNotice("검색 결과가 없습니다."));
        return;
    }
    searchResults.replaceChildren(...matched.map(handle =>
        createRow(handle, "차단 해제", () => unblockHandle(handle))));
}

function render(handles) {
    blockedHandles = handles || [];
    renderHandles(blockedHandles);
    renderBlockedList(blockedHandles);
    renderSearch(blockedHandles);
}

/* 입력이 멈추고 잠시 뒤 저장 (금지어 입력 중 매 글자마다 유튜브 탭을 다시 검사하지 않도록) */

settingInputs.forEach(input => {
    let timer = null;
    input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => saveSettings({ [input.dataset.setting]: readInput(input) }), 300);
    });
});

handleForm.addEventListener("submit", async event => {
    event.preventDefault();
    await blockHandle(handleInput.value);
    handleInput.value = "";
});

clearForm.addEventListener("submit", event => {
    event.preventDefault();
    saveSettings({ blockedHandles: [] });
});

searchInput.addEventListener("input", () => renderSearch(blockedHandles));

/* 우클릭 메뉴로 차단해도 목록이 갱신되도록 저장소 변경을 기준으로 다시 그림 */
ext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.blockedHandles) render(changes.blockedHandles.newValue);
});

loadSettings().then(settings => {
    settingInputs.forEach(input => writeInput(input, settings[input.dataset.setting]));
    render(settings.blockedHandles);
});
