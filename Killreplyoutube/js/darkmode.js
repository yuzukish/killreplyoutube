/* 다크 모드 토글: 현재 테마(지정값 없으면 시스템 설정)를 기준으로 반전하고, 다음에 열 때도 유지 */

const root = document.documentElement;
const toggleSwitch = document.getElementById("toggle-darkmode");

// 손잡이가 움직이는 건 CSS의 #toggle-darkmode:checked + .toggle-switch 규칙이 맡으므로
// 여기서는 체크 상태만 맞춰 주면 됩니다
function applyTheme(theme) {
  root.setAttribute("color-theme", theme);
  if (toggleSwitch) toggleSwitch.checked = theme === "dark";
}

const savedTheme = localStorage.getItem("color-theme");
applyTheme(savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

toggleSwitch.addEventListener("change", () => {
  const newTheme = toggleSwitch.checked ? "dark" : "light";
  applyTheme(newTheme);
  localStorage.setItem("color-theme", newTheme);
}); 