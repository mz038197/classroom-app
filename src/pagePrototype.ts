// Five variants of the classroom page, switchable via ?variant=, on the existing / route.
// Throwaway prototype. Fold the winner back into page.ts, then drop this file.

import type { ClassroomAppView } from "./classroomApp";
import {
  actionKindLabel,
  type InstallAction,
  type LessonSnippet,
} from "./courseCatalog";

export const PROTOTYPE_VARIANTS = [
  { id: "A", name: "單步軌道" },
  { id: "B", name: "左右工作台" },
  { id: "C", name: "一鍵海報" },
  { id: "D", name: "分組清單" },
  { id: "E", name: "深色" },
] as const;

export type PrototypeVariantId = (typeof PROTOTYPE_VARIANTS)[number]["id"];

const PRODUCT = "凡思課堂安裝";

export function isPrototypeVariant(value: string | null): value is PrototypeVariantId {
  return value === "A" || value === "B" || value === "C" || value === "D" || value === "E";
}

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

function brand(stack = false): string {
  const layout = stack ? " brand-stack" : "";
  return `<div class="brand${layout}">
    <div class="logo-badge"><img src="/brand-logo.png" alt=""></div>
    <h1 class="gradient-text">${PRODUCT}</h1>
  </div>`;
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

function actionForm(action: InstallAction, commandRunning: boolean): string {
  const off = commandRunning ? " disabled" : "";
  const description = action.description
    ? `<p class="hint">${escapeHtml(action.description)}</p>`
    : "";
  return `<h3>${escapeHtml(action.title)}</h3>
    <p class="kind">${escapeHtml(actionKindLabel(action.kind))}</p>
    ${description}
    <code>${escapeHtml(action.command)}</code>
    <form method="post" action="/prepare">
      <input type="hidden" name="action_id" value="${escapeHtml(action.id)}">
      <button type="submit"${off}>查看完整指令</button>
    </form>`;
}

function snippetInner(snippet: LessonSnippet): string {
  const hint = snippet.pasteHint
    ? `<p class="hint">${escapeHtml(snippet.pasteHint)}</p>`
    : "";
  return `<h3>${escapeHtml(snippet.title)}</h3>
    ${hint}
    <pre>${escapeHtml(snippet.body)}</pre>`;
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

function stopForm(): string {
  return `<form method="post" action="/stop"><button type="submit" class="stop">停止</button></form>`;
}

function initialStep(view: ClassroomAppView): string {
  if (view.pendingCommand || view.commandOutput !== undefined) return "command";
  if (!view.connected) return "connect";
  if (!view.projectFolder) return "folder";
  if (view.catalog || view.catalogError) return "lesson";
  return "tools";
}

const STEPS = [
  { id: "connect", label: "連線" },
  { id: "folder", label: "資料夾" },
  { id: "model", label: "模型" },
  { id: "tools", label: "環境" },
  { id: "lesson", label: "課程" },
  { id: "command", label: "指令" },
] as const;

function stepBody(view: ClassroomAppView, id: (typeof STEPS)[number]["id"]): string {
  if (id === "connect") return connectInner(view);
  if (id === "folder") return folderInner(view);
  if (id === "model") return modelInner(view);
  if (id === "tools") return environmentInner(view);
  if (id === "command") return commandInner(view);
  const actions = (view.catalog?.actions ?? [])
    .map(
      (action) =>
        `<article class="line">${actionForm(action, view.commandRunning)}</article>`,
    )
    .join("");
  const snippets = (view.catalog?.snippets ?? [])
    .map((snippet) => `<article class="line">${snippetInner(snippet)}</article>`)
    .join("");
  const snippetBlock = snippets ? `<h2 class="sub">本課片段</h2>${snippets}` : "";
  return `${catalogInner(view)}${actions}${snippetBlock}`;
}

function variantA(view: ClassroomAppView): string {
  const current = initialStep(view);
  const rail = STEPS.map(
    (step) =>
      `<button type="button" data-goto="${step.id}">${step.label}</button>`,
  ).join("");
  const panels = STEPS.map((step, index) => {
    const title =
      step.id === "connect"
        ? "連上這堂課"
        : step.id === "folder"
          ? "指出專案資料夾"
          : step.id === "model"
            ? "選 Classroom 或 Native"
            : step.id === "tools"
              ? "補齊這台電腦缺的工具"
              : step.id === "lesson"
                ? "這堂課要裝的東西"
                : "先看指令，再執行";
    return `<section class="step" data-step="${step.id}"${step.id === current ? "" : " hidden"}>
      <p class="kicker" data-step-label>${index + 1} / ${STEPS.length}</p>
      <h2>${title}</h2>
      <div class="step-body">${stepBody(view, step.id)}</div>
      <div class="step-nav">
        <button type="button" data-move="-1">上一步</button>
        <button type="button" data-move="1">下一步</button>
      </div>
    </section>`;
  }).join("");
  return `<div class="v-a" data-initial-step="${current}">
    <aside class="rail">
      <nav>${rail}</nav>
      ${stopForm()}
    </aside>
    <div class="sheet">
      <header>
        ${brand()}
        ${notices(view)}
      </header>
      ${panels}
    </div>
  </div>`;
}

function catalogTable(view: ClassroomAppView): string {
  const head = catalogInner(view);
  const rows = (view.catalog?.actions ?? [])
    .map((action) => {
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

function variantB(view: ClassroomAppView): string {
  return `<div class="v-b">
    <aside class="slab">
      ${brand()}
      <p class="status">${escapeHtml(statusWord(view))}</p>
      ${notices(view)}
      ${stopForm()}
    </aside>
    <div class="desk">
      <section class="row"><h2>連線</h2><div>${connectInner(view)}</div></section>
      <section class="row"><h2>資料夾</h2><div>${folderInner(view)}</div></section>
      <section class="row"><h2>模型</h2><div>${modelInner(view)}</div></section>
      <section class="row"><h2>環境</h2><div>${environmentInner(view)}</div></section>
      <section class="row"><h2>指令</h2><div>${commandInner(view)}</div></section>
      <section class="row"><h2>課程</h2><div>${catalogTable(view)}</div></section>
    </div>
  </div>`;
}

function ticketRow(title: string, body: string): string {
  return `<section class="ticket-row"><h2>${title}</h2>${body}</section>`;
}

function variantC(view: ClassroomAppView): string {
  const blocking = view.pendingCommand
    ? "command"
    : !view.canCopyKey
      ? "connect"
      : !view.projectFolder
        ? "folder"
        : "";
  const hero =
    blocking === "command"
      ? commandInner(view)
      : blocking === "connect"
        ? connectInner(view)
        : blocking === "folder"
          ? folderInner(view)
          : "";
  const heroBlock = hero ? `<div class="hero">${hero}</div>` : "";
  const rows = [
    blocking === "connect" ? "" : ticketRow("連線", connectInner(view)),
    blocking === "folder" ? "" : ticketRow("資料夾", folderInner(view)),
    ticketRow("模型", modelInner(view)),
    ticketRow("環境", environmentInner(view)),
    blocking === "command" ? "" : ticketRow("指令", commandInner(view)),
    ticketRow("課程", catalogTable(view)),
    ticketRow("離開", stopForm()),
  ].join("");
  const modelBit = view.modelId ? `<p class="model-id">${escapeHtml(view.modelId)}</p>` : "";
  return `<div class="v-c">
    <header class="poster">
      ${brand(true)}
      <p class="status">${escapeHtml(statusWord(view))}</p>
      ${modelBit}
      ${notices(view)}
    </header>
    ${heroBlock}
    <div class="ticket">${rows}</div>
  </div>`;
}

function inset(title: string, body: string): string {
  return `<section class="inset"><h2>${title}</h2><div class="group">${body}</div></section>`;
}

function variantD(view: ClassroomAppView): string {
  return `<div class="v-d">
    <header class="material">${brand()}</header>
    <main>
      <p class="display">${escapeHtml(statusWord(view))}</p>
      ${notices(view)}
      ${inset("連線", connectInner(view))}
      ${inset("資料夾", folderInner(view))}
      ${inset("模型", modelInner(view))}
      ${inset("環境", environmentInner(view))}
      ${inset("指令", commandInner(view))}
      ${inset("課程", catalogTable(view))}
      ${inset("離開", stopForm())}
    </main>
  </div>`;
}

function variantE(view: ClassroomAppView): string {
  const tile = (title: string, body: string, wide = false) =>
    `<section class="tile${wide ? " wide" : ""}"><h2>${title}</h2>${body}</section>`;
  return `<div class="v-e">
    <header class="night">${brand()}</header>
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
  </div>`;
}

function stateLine(view: ClassroomAppView): string {
  const folder = view.projectFolder ? "有資料夾" : "無資料夾";
  const running = view.commandRunning ? "執行中" : "閒置";
  return `${view.connected ? "已連線" : "未連線"} · ${view.mode} · ${folder} · ${running}`;
}

function stateJson(view: ClassroomAppView): string {
  return escapeHtml(
    JSON.stringify(
      {
        connected: view.connected,
        mode: view.mode,
        modelId: view.modelId ?? null,
        classLabel: view.classLabel ?? null,
        projectFolder: view.projectFolder ?? null,
        installAvailable: view.installAvailable,
        commandRunning: view.commandRunning,
        pendingCommand: Boolean(view.pendingCommand),
        hasOutput: view.commandOutput !== undefined,
        catalogActions: view.catalog?.actions.length ?? 0,
        tools: view.tools.map((tool) => ({
          id: tool.id,
          installed: tool.installed,
          selected: tool.selected,
        })),
        mustRestart: view.mustRestart ?? [],
        detail: view.detail,
        notice: view.notice ?? null,
      },
      null,
      2,
    ),
  );
}

function switcher(current: PrototypeVariantId, view: ClassroomAppView): string {
  if (process.env.NODE_ENV === "production") return "";
  const name = PROTOTYPE_VARIANTS.find((item) => item.id === current)?.name ?? current;
  return `<aside class="proto-bar" aria-label="外觀原型切換">
    <button type="button" data-dir="-1" aria-label="上一個外觀">←</button>
    <p class="proto-label">${current} — ${name}</p>
    <p class="proto-line">${stateLine(view)}</p>
    <details class="proto-details">
      <summary>狀態</summary>
      <pre class="proto-state">${stateJson(view)}</pre>
    </details>
    <button type="button" data-dir="1" aria-label="下一個外觀">→</button>
  </aside>`;
}

const CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    padding-bottom: 9rem;
    font-family: "Segoe UI", "Microsoft JhengHei", sans-serif;
    line-height: 1.45;
  }
  button, input { font: inherit; }
  button { cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  pre, code { white-space: pre-wrap; overflow-wrap: anywhere; }
  h1, h2, h3, p { margin: 0; }
  .brand { display: flex; align-items: center; gap: 0.7rem; min-width: 0; }
  .brand-stack { flex-direction: column; }
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
    background: linear-gradient(135deg, #007070 0%, #009999 50%, #f8c000 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }
  .hint, .empty, .kind { color: var(--muted); }
  .error, .restart { color: #9f1239; }
  .running { color: var(--accent); font-weight: 700; }
  form.stack, .step-body, .tools { display: flex; flex-direction: column; gap: 0.65rem; align-items: flex-start; }
  .v-c form.stack { align-items: stretch; }
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
  code, pre {
    font-family: Consolas, "Cascadia Mono", monospace;
    font-size: 0.86rem;
  }

  .v-a {
    --muted: #5c6e86;
    --accent: #ff4d00;
    display: grid;
    grid-template-columns: 7.25rem 1fr;
    min-height: 100vh;
    background: #e8eef6;
    color: #10233f;
  }
  .v-a .rail {
    background: #10233f;
    color: #f7f9fc;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.1rem 0.7rem 1.4rem;
    position: sticky;
    top: 0;
    height: 100vh;
  }
  .v-a .rail nav { display: flex; flex-direction: column; gap: 0.25rem; }
  .v-a .rail button {
    background: transparent;
    color: #d5deea;
    border: 0;
    text-align: left;
    min-height: 2.4rem;
    padding: 0 0.45rem;
  }
  .v-a .rail button[aria-current="step"] { background: #ff4d00; color: #10233f; }
  .v-a .rail .stop {
    margin-top: auto;
    background: transparent;
    color: #f7f9fc;
    border: 1px solid #8ea0b8;
  }
  .v-a .sheet { padding: 1.75rem 1.75rem 2.5rem; max-width: 46rem; }
  .v-a h1 {
    font-size: clamp(1.35rem, 2.4vw, 1.7rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .v-a header { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 1.5rem; }
  .v-a .kicker { color: #ff4d00; font-weight: 700; letter-spacing: 0.08em; }
  .v-a h2 {
    font-family: Bahnschrift, "Segoe UI", sans-serif;
    font-size: clamp(2rem, 4vw, 3.1rem);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1.05;
    margin: 0.2rem 0 1rem;
  }
  .v-a input:not([type="checkbox"]) {
    min-height: 2.7rem;
    width: 22rem;
    max-width: 100%;
    border: 0;
    border-bottom: 2px solid #10233f;
    background: transparent;
    padding: 0 0.15rem;
  }
  .v-a button.go, .v-a .step-body button, .v-a .choices button {
    min-height: 3rem;
    padding: 0 1.1rem;
    border: 0;
    background: #10233f;
    color: #f7f9fc;
    align-self: flex-start;
  }
  .v-a button.go { background: #ff4d00; color: #10233f; }
  .v-a button.quiet, .v-a .step-nav button {
    background: transparent;
    color: #10233f;
    border: 0;
    min-height: 2.5rem;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 0.2rem;
  }
  .v-a .step-nav { display: flex; gap: 1.25rem; margin-top: 1.75rem; }
  .v-a .line { padding: 0.9rem 0; border-top: 1px solid #c5d0e0; display: flex; flex-direction: column; gap: 0.4rem; }
  .v-a .modes { display: flex; gap: 0.5rem; }
  .v-a .modes button.on { background: #ff4d00; color: #10233f; }
  .v-a :focus-visible { outline: 3px solid #ff4d00; outline-offset: 3px; }

  .v-b {
    --muted: #5e746c;
    --accent: #8a5a00;
    display: grid;
    grid-template-columns: minmax(16rem, 22rem) 1fr;
    min-height: 100vh;
    background: #f3f6f4;
    color: #14362c;
  }
  .v-b .brand {
    align-self: flex-start;
    background: #eef5f5;
    border-radius: 10px;
    padding: 0.35rem 0.8rem 0.35rem 0.35rem;
  }
  .v-b .slab {
    background: #14362c;
    color: #f3f6f4;
    padding: 1.6rem 1.4rem 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    position: sticky;
    top: 0;
    height: 100vh;
  }
  .v-b h1 {
    font-size: clamp(1.45rem, 2.6vw, 1.9rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  .v-b .status {
    font-family: Bahnschrift, "Segoe UI", sans-serif;
    font-size: clamp(2.4rem, 5vw, 4rem);
    line-height: 0.9;
    color: #e6a817;
    margin-top: 0.4rem;
  }
  .v-b .slab .detail, .v-b .slab .notice, .v-b .slab .class-label { color: #d5e4de; }
  .v-b .stop {
    margin-top: auto;
    background: transparent;
    color: #f3f6f4;
    border: 1px solid #7d9a90;
    min-height: 2.8rem;
  }
  .v-b .desk { padding: 0.5rem 1.5rem 2rem; }
  .v-b .row {
    display: grid;
    grid-template-columns: 6.5rem 1fr;
    gap: 1rem;
    padding: 1.1rem 0;
    border-bottom: 1px solid #d5e0db;
    align-items: start;
  }
  .v-b h2 { font-size: 0.95rem; font-weight: 700; padding-top: 0.45rem; }
  .v-b input:not([type="checkbox"]) {
    min-height: 2.8rem;
    width: min(100%, 32rem);
    border: 0;
    border-bottom: 2px solid #14362c;
    background: transparent;
    padding: 0 0.1rem;
  }
  .v-b button {
    min-height: 2.6rem;
    padding: 0 0.9rem;
    background: #14362c;
    color: #f3f6f4;
    border: 0;
  }
  .v-b button.quiet { background: transparent; color: #14362c; border: 0; padding: 0; min-height: 2.2rem; text-decoration: underline; text-underline-offset: 0.18rem; }
  .v-b .slab button.stop { color: #f3f6f4; border: 1px solid #7d9a90; }
  .v-b .modes { display: flex; gap: 0.4rem; }
  .v-b .modes button { background: transparent; color: #14362c; border: 1px solid #14362c; }
  .v-b .modes button.on { background: #e6a817; color: #14362c; border-color: #e6a817; }
  .v-b table { width: 100%; border-collapse: collapse; }
  .v-b th, .v-b td { text-align: left; vertical-align: top; padding: 0.55rem 0.7rem 0.55rem 0; border-bottom: 1px solid #e1ebe6; }
  .v-b th { font-size: 0.78rem; letter-spacing: 0.04em; color: #5e746c; font-weight: 650; }
  .v-b .line { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.7rem 0; }
  .v-b :focus-visible { outline: 3px solid #e6a817; outline-offset: 3px; }

  .v-c {
    --muted: #3f3f3f;
    --accent: #141414;
    min-height: 100vh;
    background: #ffe500;
    color: #141414;
    padding: 1.4rem 1.2rem 6rem;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .v-c .brand {
    background: #eef5f5;
    border-radius: 16px;
    padding: 0.85rem 1.2rem 1rem;
  }
  .v-c .logo-badge { width: 6.5rem; height: 6.5rem; padding: 0; background: transparent; box-shadow: none; }
  .v-c .poster { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.55rem; max-width: 40rem; }
  .v-c h1 {
    font-size: clamp(1.8rem, 4vw, 2.6rem);
    line-height: 1.15;
    letter-spacing: -0.02em;
    font-weight: 700;
  }
  .v-c .status {
    font-family: Bahnschrift, "Arial Black", sans-serif;
    font-size: clamp(1.6rem, 3vw, 2.4rem);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .v-c .hero, .v-c .ticket { width: min(100%, 38rem); }
  .v-c .hero {
    margin-top: 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .v-c .ticket {
    margin-top: 1.6rem;
    background: #fff;
    border: 2px dashed #141414;
    padding: 0.3rem 1.1rem 0.8rem;
  }
  .v-c .ticket-row { padding: 0.95rem 0; border-bottom: 1px dashed #141414; display: flex; flex-direction: column; gap: 0.55rem; }
  .v-c .ticket-row:last-child { border-bottom: 0; }
  .v-c h2 { font-size: 0.82rem; letter-spacing: 0.12em; text-transform: uppercase; }
  .v-c input:not([type="checkbox"]) {
    min-height: 2.5rem;
    width: 100%;
    border: 2px solid #141414;
    background: #fff;
    padding: 0 0.7rem;
  }
  .v-c button.go, .v-c .hero button[type="submit"]:not(.quiet) {
    width: 100%;
    min-height: 3.4rem;
    background: #141414;
    color: #ffe500;
    border: 0;
    font-size: 1.25rem;
    font-weight: 800;
  }
  .v-c .ticket button, .v-c button.quiet, .v-c button.stop {
    min-height: 2.6rem;
    background: #fff;
    color: #141414;
    border: 2px solid #141414;
    padding: 0 0.8rem;
    align-self: flex-start;
  }
  .v-c .modes { display: flex; gap: 0.4rem; }
  .v-c .modes button.on { background: #141414; color: #ffe500; }
  .v-c table { width: 100%; border-collapse: collapse; }
  .v-c th, .v-c td { text-align: left; vertical-align: top; padding: 0.45rem 0.4rem 0.45rem 0; }
  .v-c .line { display: flex; flex-direction: column; gap: 0.3rem; padding-top: 0.6rem; }
  .v-c :focus-visible { outline: 3px solid #141414; outline-offset: 3px; }

  .proto-bar {
    position: fixed;
    z-index: 30;
    left: 50%;
    bottom: 0.8rem;
    transform: translateX(-50%);
    width: max-content;
    max-width: calc(100% - 1rem);
    display: flex;
    gap: 0.55rem;
    align-items: center;
    padding: 0.35rem 0.45rem 0.35rem 0.35rem;
    background: #111;
    color: #fff;
    border-radius: 999px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  }
  .proto-bar button {
    width: 2.4rem;
    height: 2.4rem;
    border: 0;
    border-radius: 999px;
    background: #fff;
    color: #111;
    font-size: 1.05rem;
    flex: 0 0 auto;
  }
  .proto-label { font-weight: 700; font-size: 0.92rem; white-space: nowrap; }
  .proto-line { color: #c8c8c8; font-size: 0.75rem; white-space: nowrap; }
  .proto-details { position: relative; }
  .proto-details summary {
    cursor: pointer;
    color: #fff;
    font-size: 0.78rem;
    list-style: none;
  }
  .proto-details summary::-webkit-details-marker { display: none; }
  .proto-state { display: none; margin: 0; }
  .proto-details[open] .proto-state {
    display: block;
    position: absolute;
    bottom: calc(100% + 0.55rem);
    right: 0;
    width: min(22rem, 70vw);
    max-height: 16rem;
    overflow: auto;
    background: #111;
    color: #d5d5d5;
    padding: 0.7rem 0.8rem;
    border-radius: 0.7rem;
    text-align: left;
  }
  .v-d {
    --muted: #6e6e73;
    --accent: #009999;
    min-height: 100vh;
    background: #f2f2f7;
    color: #1d1d1f;
    font-family: system-ui, "Segoe UI", "Microsoft JhengHei", sans-serif;
  }
  .v-d .material {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 0.7rem 1.1rem;
    background: rgba(242, 242, 247, 0.72);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.45);
  }
  .v-d main {
    width: min(40rem, 100%);
    margin: 0 auto;
    padding: 0.4rem 1.1rem 2rem;
  }
  .v-d .display {
    font-size: clamp(2rem, 5vw, 2.75rem);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.022em;
    margin: 0.85rem 0 0.35rem;
  }
  .v-d .detail, .v-d .notice, .v-d .class-label { color: #3a3a3c; }
  .v-d .inset { margin-top: 1.35rem; }
  .v-d .inset h2 {
    margin: 0 0.85rem 0.4rem;
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1.3;
    color: #6e6e73;
    text-transform: none;
  }
  .v-d .group {
    background: #fff;
    border-radius: 12px;
    padding: 0.85rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .v-d form.stack { align-items: stretch; width: 100%; }
  .v-d input:not([type="checkbox"]) {
    width: 100%;
    min-height: 2.75rem;
    border: 0;
    border-radius: 10px;
    background: #f2f2f7;
    padding: 0 0.8rem;
  }
  .v-d button {
    min-height: 2.75rem;
    border: 0;
    border-radius: 10px;
    background: #009999;
    color: #fff;
    font-weight: 600;
    padding: 0 1rem;
    align-self: flex-start;
  }
  .v-d button:active { transform: scale(0.97); transition: transform 100ms ease-out; }
  .v-d button.quiet { background: transparent; color: #009999; padding: 0; }
  .v-d button.stop {
    align-self: stretch;
    background: transparent;
    color: #ff3b30;
  }
  .v-d .modes {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: rgba(120, 120, 128, 0.16);
  }
  .v-d .modes button {
    flex: 1;
    background: transparent;
    color: #1d1d1f;
    border-radius: 7px;
    box-shadow: none;
  }
  .v-d .modes button.on { background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12); }
  .v-d table { width: 100%; border-collapse: collapse; }
  .v-d th, .v-d td { text-align: left; vertical-align: top; padding: 0.55rem 0.45rem 0.55rem 0; }
  .v-d th { font-size: 0.75rem; font-weight: 600; color: #6e6e73; }
  .v-d .line { display: flex; flex-direction: column; gap: 0.35rem; padding-top: 0.7rem; }
  .v-d :focus-visible { outline: 3px solid #009999; outline-offset: 3px; }
  @media (prefers-reduced-transparency: reduce) {
    .v-d .material { background: #f2f2f7; backdrop-filter: none; -webkit-backdrop-filter: none; }
  }
  .v-e {
    --muted: #98989d;
    --accent: #f8c000;
    min-height: 100vh;
    background: #0c0c0e;
    color: #f5f5f7;
    font-family: system-ui, "Segoe UI", "Microsoft JhengHei", sans-serif;
  }
  .v-e .night {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 0.75rem 1.1rem;
    background: rgba(28, 28, 30, 0.72);
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .v-e .gradient-text {
    background: linear-gradient(135deg, #9cf6ee 0%, #2ec4b6 46%, #f8c000 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }
  .v-e main { width: min(52rem, 100%); margin: 0 auto; padding: 0.4rem 1.1rem 2rem; }
  .v-e .display {
    font-size: clamp(2.4rem, 6vw, 3.4rem);
    font-weight: 700;
    line-height: 1.02;
    letter-spacing: -0.03em;
    margin: 1rem 0 0.35rem;
  }
  .v-e .detail, .v-e .notice, .v-e .class-label { color: #d1d1d6; }
  .v-e .error, .v-e .restart { color: #ff6961; }
  .v-e .modules {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-top: 1.2rem;
  }
  .v-e .tile {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.95rem 1rem 1rem;
    border-radius: 16px;
    background: #1c1c1e;
  }
  .v-e .tile.wide { grid-column: 1 / -1; }
  .v-e h2 {
    margin: 0;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    line-height: 1.3;
    color: #98989d;
    text-transform: none;
  }
  .v-e form.stack { align-items: stretch; width: 100%; }
  .v-e input:not([type="checkbox"]) {
    width: 100%;
    min-height: 2.75rem;
    border: 0;
    border-radius: 10px;
    background: #2c2c2e;
    color: #f5f5f7;
    padding: 0 0.8rem;
  }
  .v-e button {
    min-height: 2.75rem;
    border: 0;
    border-radius: 10px;
    background: #f8c000;
    color: #1c1c1e;
    font-weight: 700;
    padding: 0 1rem;
    align-self: flex-start;
  }
  .v-e button:active { transform: scale(0.97); transition: transform 100ms ease-out; }
  .v-e button.quiet { background: transparent; color: #f8c000; padding: 0; }
  .v-e button.stop { background: transparent; color: #ff453a; }
  .v-e .modes {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: #2c2c2e;
  }
  .v-e .modes button { flex: 1; background: transparent; color: #f5f5f7; }
  .v-e .modes button.on { background: #3a3a3c; color: #f8c000; }
  .v-e table { width: 100%; border-collapse: collapse; }
  .v-e th, .v-e td { text-align: left; vertical-align: top; padding: 0.5rem 0.4rem 0.5rem 0; }
  .v-e th { font-size: 0.75rem; font-weight: 600; color: #98989d; }
  .v-e code, .v-e pre { color: #f5f5f7; }
  .v-e .line { display: flex; flex-direction: column; gap: 0.35rem; padding-top: 0.65rem; }
  .v-e :focus-visible { outline: 3px solid #f8c000; outline-offset: 3px; }
  @media (max-width: 40rem) {
    .v-e .modules { grid-template-columns: 1fr; }
    .v-e .tile.wide { grid-column: auto; }
  }
  @media (prefers-reduced-transparency: reduce) {
    .v-e .night { background: #1c1c1e; backdrop-filter: none; -webkit-backdrop-filter: none; }
  }
  @media (max-width: 52rem) {
    .v-a { grid-template-columns: 1fr; }
    .v-a .rail {
      position: sticky;
      height: auto;
      flex-direction: row;
      align-items: center;
      overflow: auto;
    }
    .v-a .rail nav { flex-direction: row; }
    .v-a .rail .stop { margin-top: 0; }
    .v-b { grid-template-columns: 1fr; }
    .v-b .slab { position: static; height: auto; }
    .v-b .row { grid-template-columns: 1fr; gap: 0.4rem; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { scroll-behavior: auto; }
    .v-d button:active, .v-e button:active { transform: none; transition: none; }
  }
`;

const CLIENT = `
  document.querySelectorAll(".v-a").forEach(function (root) {
    var steps = ["connect", "folder", "model", "tools", "lesson", "command"];
    function show(id) {
      if (steps.indexOf(id) < 0) id = steps[0];
      root.querySelectorAll("[data-step]").forEach(function (el) {
        if (el.getAttribute("data-step") === id) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
      });
      root.querySelectorAll("[data-goto]").forEach(function (btn) {
        var on = btn.getAttribute("data-goto") === id;
        btn.setAttribute("aria-current", on ? "step" : "false");
      });
      var visible = root.querySelector('[data-step="' + id + '"] [data-step-label]');
      if (visible) visible.textContent = (steps.indexOf(id) + 1) + " / " + steps.length;
    }
    root.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var goto = target.closest("[data-goto]");
      if (goto && root.contains(goto)) {
        show(goto.getAttribute("data-goto"));
        return;
      }
      var move = target.closest("[data-move]");
      if (!move || !root.contains(move)) return;
      var open = root.querySelector("[data-step]:not([hidden])");
      var index = open ? steps.indexOf(open.getAttribute("data-step")) : 0;
      var delta = Number(move.getAttribute("data-move")) || 0;
      show(steps[(index + delta + steps.length) % steps.length]);
    });
    show(root.getAttribute("data-initial-step") || "connect");
  });
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.getAttribute) return;
    var variant = new URL(location.href).searchParams.get("variant") || "A";
    if (variant !== "A" && variant !== "B" && variant !== "C" && variant !== "D" && variant !== "E") variant = "A";
    var action = new URL(form.getAttribute("action") || "/", location.origin);
    action.searchParams.set("variant", variant);
    form.action = action.pathname + action.search;
  });
  var order = ["A", "B", "C", "D", "E"];
  function currentVariant() {
    var value = new URL(location.href).searchParams.get("variant");
    return order.indexOf(value) >= 0 ? value : "A";
  }
  function cycle(delta) {
    var index = order.indexOf(currentVariant());
    var next = order[(index + delta + order.length) % order.length];
    var url = new URL(location.href);
    url.searchParams.set("variant", next);
    location.assign(url.pathname + url.search);
  }
  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest(".proto-bar [data-dir]");
    if (!button) return;
    cycle(Number(button.getAttribute("data-dir")) || 0);
  });
  document.addEventListener("keydown", function (event) {
    var target = event.target;
    if (target && target.closest && target.closest("input, textarea, [contenteditable]")) return;
    if (event.key === "ArrowLeft") cycle(-1);
    if (event.key === "ArrowRight") cycle(1);
  });
  window.addEventListener("pagehide", function () {
    navigator.sendBeacon("/close");
  });
`;

export function renderPrototypePage(
  view: ClassroomAppView,
  variant: string | null,
): string {
  const current: PrototypeVariantId = isPrototypeVariant(variant) ? variant : "A";
  const body =
    current === "A"
      ? variantA(view)
      : current === "B"
        ? variantB(view)
        : current === "C"
          ? variantC(view)
          : current === "D"
            ? variantD(view)
            : variantE(view);
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${PRODUCT}</title>
  <style>${CSS}</style>
</head>
<body>
  ${body}
  ${switcher(current, view)}
  <script>${CLIENT}</script>
</body>
</html>`;
}
