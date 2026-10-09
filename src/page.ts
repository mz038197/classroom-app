import { resolveAppearance } from "./appearance";
import type { ClassroomAppView } from "./classroomApp";
import {
  actionKindLabel,
  type InstallAction,
  type LessonSnippet,
} from "./courseCatalog";

const PRODUCT = "凡思課堂安裝";

const MOON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z"/></svg>`;
const SUN = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/></svg>`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function locked(view: ClassroomAppView): string {
  return view.commandRunning ? " disabled" : "";
}

function clientLabel(client: "codex" | "claude" | "vscode"): string {
  if (client === "codex") return "Codex";
  if (client === "claude") return "Claude Code";
  return "VS Code";
}

function restartHtml(view: ClassroomAppView): string {
  const clients = view.mustRestart ?? [];
  const routes = clients.filter((client) => client !== "vscode");
  const parts: string[] = [];
  if (routes.length > 0) {
    const names = routes.map((client) => clientLabel(client));
    const joined =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join("、")} 與 ${names[names.length - 1]}`;
    parts.push(`<p class="restart">請完全退出 ${escapeHtml(joined)}，再重新打開。</p>`);
  }
  if (clients.includes("vscode")) {
    parts.push(`<p class="restart">請完全退出 VS Code 再打開，不要只重載視窗。</p>`);
  }
  return parts.join("");
}

function statusWord(view: ClassroomAppView): string {
  if (!view.connected) return "未連線";
  return view.mode === "classroom" ? "Classroom" : "Native";
}

function modeLine(view: ClassroomAppView): string {
  const current =
    view.mode === "classroom"
      ? `Classroom${view.modelId ? ` · ${escapeHtml(view.modelId)}` : ""}`
      : "Native";
  return `<p class="mode-line">目前：${current}</p>`;
}

function notices(view: ClassroomAppView): string {
  const detail = view.detail ? `<p class="detail">${escapeHtml(view.detail)}</p>` : "";
  const notice = view.notice ? `<p class="notice">${escapeHtml(view.notice)}</p>` : "";
  const running = view.commandRunning ? `<p class="running">執行中</p>` : "";
  const klass = view.classLabel
    ? `<p class="class-label">${escapeHtml(view.classLabel)}</p>`
    : "";
  return `${klass}${detail}${notice}${running}`;
}

function connectInner(view: ClassroomAppView): string {
  if (view.canCopyKey) {
    const off = locked(view);
    return `<form method="post" action="/copy">
        <button type="submit"${off}>複製 Classroom API Key</button>
      </form>
      <form method="post" action="/clear">
        <button type="submit" class="quiet"${off}>清除連線</button>
      </form>`;
  }
  return `<form class="stack" method="post" action="/redeem">
      <label>邀請碼 <input name="invite_code" autocomplete="off"${locked(view)}></label>
      <label>課堂暱稱 <input name="nickname" autocomplete="off"${locked(view)}></label>
      <button type="submit" class="go"${locked(view)}>連線</button>
    </form>`;
}

function folderInner(view: ClassroomAppView): string {
  const value = view.projectFolder ? ` value="${escapeHtml(view.projectFolder)}"` : "";
  const off = locked(view);
  const note = view.installNotice
    ? `<p class="hint">${escapeHtml(view.installNotice)}</p>`
    : "";
  return `<form class="stack" method="post" action="/project-folder">
      <label>專案資料夾 <input name="project_folder" autocomplete="off"${value}${off}></label>
      <button type="submit" class="go"${off}>設定專案資料夾</button>
      ${note}
    </form>`;
}

function modelInner(view: ClassroomAppView): string {
  const off = locked(view);
  const classroomOn = view.mode === "classroom" ? " on" : "";
  const nativeOn = view.mode === "native" ? " on" : "";
  return `${modeLine(view)}
    ${restartHtml(view)}
    <form class="modes" method="post" action="/switch">
      <button type="submit" name="mode" value="classroom" class="${classroomOn.trim()}"${off}>Classroom</button>
      <button type="submit" name="mode" value="native" class="${nativeOn.trim()}"${off}>Native</button>
    </form>
    <form method="post" action="/reload">
      <button type="submit" class="quiet"${off}>重新載入</button>
    </form>`;
}

function environmentInner(view: ClassroomAppView): string {
  const off = locked(view);
  const confirmOff = view.installAvailable && !view.commandRunning ? "" : " disabled";
  const tools = view.tools
    .map((tool) => {
      const checked = tool.selected ? " checked" : "";
      const mark = tool.installed ? "已安裝" : "未安裝";
      return `<label class="tool"><input type="checkbox" name="tool" value="${escapeHtml(tool.id)}"${checked}${off}> <span>${escapeHtml(tool.label)}</span> <em>${mark}</em></label>`;
    })
    .join("");
  const note = view.environmentNotice
    ? `<p class="hint">${escapeHtml(view.environmentNotice)}</p>`
    : "";
  return `<form method="post" action="/environment-check">
      <button type="submit" class="quiet"${off}>重新檢查</button>
    </form>
    <form class="stack" method="post" action="/environment">
      <div class="tools">${tools}</div>
      <button type="submit" class="go"${confirmOff}>確認安裝</button>
    </form>
    ${note}`;
}

function catalogInner(view: ClassroomAppView): string {
  if (!view.catalog && !view.catalogError) {
    return `<p class="empty">這台電腦還沒有課程清單。</p>`;
  }
  const error = view.catalogError
    ? `<p class="error">${escapeHtml(view.catalogError)}</p>`
    : "";
  const note = view.catalog?.localNote
    ? `<p class="hint">${escapeHtml(view.catalog.localNote)}</p>`
    : "";
  return `${note}${error}`;
}

function commandInner(view: ClassroomAppView): string {
  const hasOutput = view.commandOutput !== undefined;
  if (!view.pendingCommand && !hasOutput) {
    return `<p class="empty">沒有待確認的指令。</p>`;
  }
  const command = view.pendingCommand
    ? `<pre class="pending">${escapeHtml(view.pendingCommand)}</pre>`
    : "";
  const choices =
    view.pendingCommand && !view.commandRunning
      ? `<div class="choices">
          <form method="post" action="/confirm"><button type="submit" class="go">確認執行</button></form>
          <form method="post" action="/cancel"><button type="submit" class="quiet">取消</button></form>
        </div>`
      : "";
  const output = hasOutput
    ? `<h3>指令輸出</h3><pre>${escapeHtml(view.commandOutput ?? "")}</pre>`
    : "";
  return `${command}${choices}${output}`;
}

function snippetInner(snippet: LessonSnippet): string {
  const hint = snippet.pasteHint
    ? `<p class="hint">${escapeHtml(snippet.pasteHint)}</p>`
    : "";
  return `<h3>${escapeHtml(snippet.title)}</h3>
    ${hint}
    <pre>${escapeHtml(snippet.body)}</pre>`;
}

function catalogTable(view: ClassroomAppView): string {
  const head = catalogInner(view);
  const rows = (view.catalog?.actions ?? [])
    .map((action: InstallAction) => {
      const off = view.commandRunning ? " disabled" : "";
      const description = action.description
        ? `<p class="hint">${escapeHtml(action.description)}</p>`
        : "";
      return `<tr>
        <td>${escapeHtml(actionKindLabel(action.kind))}</td>
        <td><strong>${escapeHtml(action.title)}</strong>${description}<code>${escapeHtml(action.command)}</code></td>
        <td><form method="post" action="/prepare">
          <input type="hidden" name="action_id" value="${escapeHtml(action.id)}">
          <button type="submit"${off}>查看完整指令</button>
        </form></td>
      </tr>`;
    })
    .join("");
  const table = rows
    ? `<table><thead><tr><th>種類</th><th>項目</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : "";
  const snippets = (view.catalog?.snippets ?? [])
    .map((snippet) => `<article class="line">${snippetInner(snippet)}</article>`)
    .join("");
  const snippetBlock = snippets ? `<h3>本課片段</h3>${snippets}` : "";
  return `${head}${table}${snippetBlock}`;
}

function stopForm(): string {
  return `<form method="post" action="/stop"><button type="submit" class="stop">停止</button></form>`;
}

function tile(title: string, body: string, wide = false): string {
  return `<section class="tile${wide ? " wide" : ""}"><h2>${title}</h2>${body}</section>`;
}

const CSS = `
  :root {
    color-scheme: light;
    --bg: #f2f2f7;
    --tile: #fff;
    --text: #1d1d1f;
    --muted: #6e6e73;
    --accent: #009999;
    --on-accent: #fff;
    --quiet: #009999;
    --stop: #ff3b30;
    --input: #f2f2f7;
    --modes: rgba(120, 120, 128, 0.16);
    --modes-on: #fff;
    --modes-on-text: #1d1d1f;
    --bar: rgba(242, 242, 247, 0.72);
    --line: rgba(60, 60, 67, 0.12);
    --title-a: #007070;
    --title-b: #009999;
    --title-c: #f8c000;
  }
  [data-appearance="light"] {
    color-scheme: light;
    --bg: #f2f2f7;
    --tile: #fff;
    --text: #1d1d1f;
    --muted: #6e6e73;
    --accent: #009999;
    --on-accent: #fff;
    --quiet: #009999;
    --stop: #ff3b30;
    --input: #f2f2f7;
    --modes: rgba(120, 120, 128, 0.16);
    --modes-on: #fff;
    --modes-on-text: #1d1d1f;
    --bar: rgba(242, 242, 247, 0.72);
    --line: rgba(60, 60, 67, 0.12);
    --title-a: #007070;
    --title-b: #009999;
    --title-c: #f8c000;
  }
  [data-appearance="dark"] {
    color-scheme: dark;
    --bg: #0c0c0e;
    --tile: #1c1c1e;
    --text: #f5f5f7;
    --muted: #98989d;
    --accent: #f8c000;
    --on-accent: #1c1c1e;
    --quiet: #f8c000;
    --stop: #ff453a;
    --input: #2c2c2e;
    --modes: #2c2c2e;
    --modes-on: #3a3a3c;
    --modes-on-text: #f8c000;
    --bar: rgba(28, 28, 30, 0.72);
    --line: rgba(255, 255, 255, 0.08);
    --title-a: #9cf6ee;
    --title-b: #2ec4b6;
    --title-c: #f8c000;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-appearance="light"]) {
      color-scheme: dark;
      --bg: #0c0c0e;
      --tile: #1c1c1e;
      --text: #f5f5f7;
      --muted: #98989d;
      --accent: #f8c000;
      --on-accent: #1c1c1e;
      --quiet: #f8c000;
      --stop: #ff453a;
      --input: #2c2c2e;
      --modes: #2c2c2e;
      --modes-on: #3a3a3c;
      --modes-on-text: #f8c000;
      --bar: rgba(28, 28, 30, 0.72);
      --line: rgba(255, 255, 255, 0.08);
      --title-a: #9cf6ee;
      --title-b: #2ec4b6;
      --title-c: #f8c000;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: system-ui, "Segoe UI", "Microsoft JhengHei", sans-serif;
    line-height: 1.45;
  }
  button, input { font: inherit; color: inherit; }
  button { cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button:active { transform: scale(0.97); transition: transform 100ms ease-out; }
  pre, code { white-space: pre-wrap; overflow-wrap: anywhere; }
  h1, h2, h3, p { margin: 0; }
  .bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1.1rem;
    background: var(--bar);
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    border-bottom: 1px solid var(--line);
  }
  .brand { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }
  .logo-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 3px;
    border-radius: 8px;
    background: #eef5f5;
    box-shadow: 0 0 0 1px rgba(0, 112, 112, 0.18);
    overflow: hidden;
    flex-shrink: 0;
  }
  .logo-badge img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .gradient-text {
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
    background: linear-gradient(135deg, var(--title-a) 0%, var(--title-b) 46%, var(--title-c) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }
  [data-appearance-toggle] {
    width: 2.75rem;
    height: 2.75rem;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: var(--tile);
    color: var(--text);
  }
  [data-appearance-toggle] svg { width: 1.25rem; height: 1.25rem; }
  main { width: min(52rem, 100%); margin: 0 auto; padding: 0.4rem 1.1rem 2rem; }
  .display {
    font-size: clamp(2.4rem, 6vw, 3.4rem);
    font-weight: 700;
    line-height: 1.02;
    letter-spacing: -0.03em;
    margin: 1rem 0 0.35rem;
  }
  .detail, .notice, .class-label { color: var(--text); }
  .hint, .empty, .kind, .mode-line { color: var(--muted); }
  .error, .restart { color: var(--stop); }
  .running { color: var(--accent); font-weight: 700; }
  .modules {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-top: 1.2rem;
  }
  .tile {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.95rem 1rem 1rem;
    border-radius: 16px;
    background: var(--tile);
  }
  .tile.wide { grid-column: 1 / -1; }
  h2 {
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    line-height: 1.3;
    color: var(--muted);
  }
  form.stack, .tools { display: flex; flex-direction: column; gap: 0.65rem; align-items: stretch; width: 100%; }
  label { display: flex; flex-direction: column; gap: 0.3rem; }
  .tool { flex-direction: row; align-items: center; gap: 0.55rem; width: 100%; }
  .tool span { min-width: 0; }
  .tool em { margin-left: auto; font-style: normal; color: var(--muted); font-size: 0.85rem; white-space: nowrap; }
  .tool input[type="checkbox"] {
    width: 1.15rem;
    min-width: 1.15rem;
    height: 1.15rem;
    min-height: 1.15rem;
    flex: 0 0 auto;
    margin: 0;
  }
  input:not([type="checkbox"]) {
    width: 100%;
    min-height: 2.75rem;
    border: 0;
    border-radius: 10px;
    background: var(--input);
    color: var(--text);
    padding: 0 0.8rem;
  }
  button {
    min-height: 2.75rem;
    border: 0;
    border-radius: 10px;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
    padding: 0 1rem;
    align-self: flex-start;
  }
  button.quiet { background: transparent; color: var(--quiet); padding: 0; }
  button.stop { background: transparent; color: var(--stop); }
  .modes {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: var(--modes);
  }
  .modes button { flex: 1; background: transparent; color: var(--text); }
  .modes button.on { background: var(--modes-on); color: var(--modes-on-text); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 0.5rem 0.4rem 0.5rem 0; }
  th { font-size: 0.75rem; font-weight: 600; color: var(--muted); }
  code, pre { color: var(--text); font-family: Consolas, "Cascadia Mono", monospace; font-size: 0.86rem; }
  .line { display: flex; flex-direction: column; gap: 0.35rem; padding-top: 0.65rem; }
  .choices { display: flex; gap: 0.75rem; align-items: center; }
  :focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  @media (max-width: 40rem) {
    .modules { grid-template-columns: 1fr; }
    .tile.wide { grid-column: auto; }
  }
  @media (prefers-reduced-motion: reduce) {
    button:active { transform: none; transition: none; }
  }
  @media (prefers-reduced-transparency: reduce) {
    .bar { background: var(--bg); backdrop-filter: none; -webkit-backdrop-filter: none; }
  }
`;

function appearanceScript(): string {
  return `
    ${resolveAppearance.toString()}
    var appearanceKey = "classroom-appearance";
    var moon = ${JSON.stringify(MOON)};
    var sun = ${JSON.stringify(SUN)};
    function readAppearance() {
      try { return localStorage.getItem(appearanceKey); } catch (error) { return null; }
    }
    function systemDark() {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    function paintAppearance() {
      var appearance = resolveAppearance(readAppearance(), systemDark());
      document.documentElement.dataset.appearance = appearance;
      var button = document.querySelector("[data-appearance-toggle]");
      if (!button) return;
      var next = appearance === "dark" ? "light" : "dark";
      button.setAttribute("aria-label", next === "dark" ? "切換到深色" : "切換到淺色");
      button.innerHTML = next === "dark" ? moon : sun;
    }
    paintAppearance();
    document.addEventListener("DOMContentLoaded", paintAppearance);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      var stored = readAppearance();
      if (stored === "light" || stored === "dark") return;
      paintAppearance();
    });
    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var button = target.closest("[data-appearance-toggle]");
      if (!button) return;
      var current = document.documentElement.dataset.appearance === "dark" ? "dark" : "light";
      var next = current === "dark" ? "light" : "dark";
      try { localStorage.setItem(appearanceKey, next); } catch (error) {}
      paintAppearance();
    });
    window.addEventListener("pagehide", function () {
      navigator.sendBeacon("/close");
    });
  `;
}

export function renderPage(view: ClassroomAppView): string {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${PRODUCT}</title>
  <style>${CSS}</style>
  <script>${appearanceScript()}</script>
</head>
<body>
  <header class="bar">
    <div class="brand">
      <div class="logo-badge"><img src="/brand-logo.png" alt=""></div>
      <h1 class="gradient-text">${PRODUCT}</h1>
    </div>
    <button type="button" data-appearance-toggle aria-label="切換外觀"></button>
  </header>
  <main>
    <p class="display">${escapeHtml(statusWord(view))}</p>
    ${notices(view)}
    <div class="modules">
      ${tile("連線", connectInner(view))}
      ${tile("資料夾", folderInner(view))}
      ${tile("模型", modelInner(view))}
      ${tile("環境", environmentInner(view))}
      ${tile("指令", commandInner(view), true)}
      ${tile("課程", catalogTable(view), true)}
      ${tile("離開", stopForm(), true)}
    </div>
  </main>
</body>
</html>`;
}
