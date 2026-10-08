import type { ClassroomAppView } from "./classroomApp";
import {
  actionKindLabel,
  type InstallAction,
  type LessonSnippet,
} from "./courseCatalog";

function renderCatalog(view: ClassroomAppView): string {
  if (!view.catalog && !view.catalogError) {
    return "";
  }
  const error = view.catalogError
    ? `<p class="catalog-error">${escapeHtml(view.catalogError)}</p>`
    : "";
  const note = view.catalog?.localNote
    ? `<p class="local-note">${escapeHtml(view.catalog.localNote)}</p>`
    : "";
  const actions = (view.catalog?.actions ?? [])
    .map((action) => renderAction(action, view.commandRunning))
    .join("");
  const snippets = view.catalog?.snippets
    ? `<section class="snippets">
        <h2>本課片段</h2>
        ${view.catalog.snippets.map((snippet) => renderSnippet(snippet)).join("")}
      </section>`
    : "";
  return `<section class="catalog">
    <h2>課程清單</h2>
    ${note}
    ${error}
    ${actions}
    ${snippets}
  </section>`;
}

function renderAction(action: InstallAction, commandRunning: boolean): string {
  const description = action.description
    ? `<p>${escapeHtml(action.description)}</p>`
    : "";
  const disabled = commandRunning ? " disabled" : "";
  return `<article class="action">
    <h3>${escapeHtml(action.title)}</h3>
    <p class="kind">${escapeHtml(actionKindLabel(action.kind))}</p>
    ${description}
    <code>${escapeHtml(action.command)}</code>
    <form method="post" action="/prepare">
      <input type="hidden" name="action_id" value="${escapeHtml(action.id)}">
      <button type="submit"${disabled}>查看完整指令</button>
    </form>
  </article>`;
}

function renderCommand(view: ClassroomAppView): string {
  const hasOutput = view.commandOutput !== undefined;
  if (!view.pendingCommand && !hasOutput) {
    return "";
  }
  const command = view.pendingCommand
    ? `<pre class="pending-command">${escapeHtml(view.pendingCommand)}</pre>`
    : "";
  const running = view.commandRunning
    ? `<p class="command-status">執行中</p>`
    : "";
  const choices =
    view.pendingCommand && !view.commandRunning
      ? `<div class="command-choices">
          <form method="post" action="/confirm">
            <button type="submit">確認執行</button>
          </form>
          <form method="post" action="/cancel">
            <button type="submit">取消</button>
          </form>
        </div>`
      : "";
  const output = hasOutput
    ? `<h2>指令輸出</h2><pre class="command-output">${escapeHtml(view.commandOutput ?? "")}</pre>`
    : "";
  return `<section class="command-panel">
    <h2>確認指令</h2>
    ${command}
    ${running}
    ${choices}
    ${output}
  </section>`;
}

function renderEnvironment(view: ClassroomAppView): string {
  const locked = view.commandRunning ? " disabled" : "";
  const confirmDisabled =
    view.installAvailable && !view.commandRunning ? "" : " disabled";
  const tools = view.tools
    .map((tool) => {
      const checked = tool.selected ? " checked" : "";
      return `<label><input type="checkbox" name="tool" value="${escapeHtml(tool.id)}"${checked}${locked}> ${escapeHtml(tool.label)}</label>`;
    })
    .join("");
  const notice = view.environmentNotice
    ? `<p class="environment-notice">${escapeHtml(view.environmentNotice)}</p>`
    : "";
  return `<section class="environment">
    <h2>環境工具</h2>
    <form method="post" action="/environment-check">
      <button type="submit"${locked}>重新檢查</button>
    </form>
    <form method="post" action="/environment">
      ${tools}
      <button type="submit"${confirmDisabled}>確認安裝</button>
    </form>
    ${notice}
  </section>`;
}

function renderSnippet(snippet: LessonSnippet): string {
  const hint = snippet.pasteHint
    ? `<p class="paste-hint">${escapeHtml(snippet.pasteHint)}</p>`
    : "";
  return `<article class="snippet">
    <h3>${escapeHtml(snippet.title)}</h3>
    ${hint}
    <pre>${escapeHtml(snippet.body)}</pre>
  </article>`;
}

function clientLabel(client: "codex" | "claude" | "vscode"): string {
  if (client === "codex") {
    return "Codex";
  }
  if (client === "claude") {
    return "Claude Code";
  }
  return "VS Code";
}

function renderRestart(view: ClassroomAppView): string {
  const clients = view.mustRestart ?? [];
  const routes = clients.filter((client) => client !== "vscode");
  const parts: string[] = [];
  if (routes.length > 0) {
    const names = routes.map((client) => clientLabel(client));
    const joined =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join("、")} 與 ${names[names.length - 1]}`;
    parts.push(
      `<p class="restart">請完全退出 ${escapeHtml(joined)}，再重新打開。</p>`,
    );
  }
  if (clients.includes("vscode")) {
    parts.push(
      `<p class="restart">請完全退出 VS Code 再打開，不要只重載視窗。</p>`,
    );
  }
  return parts.join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPage(view: ClassroomAppView): string {
  const classLabel = view.classLabel
    ? `<p class="class-label">${escapeHtml(view.classLabel)}</p>`
    : "";
  const detail = view.detail
    ? `<p class="detail">${escapeHtml(view.detail)}</p>`
    : "";
  const notice = view.notice
    ? `<p class="notice">${escapeHtml(view.notice)}</p>`
    : "";
  const restart = renderRestart(view);
  const stop = `<form class="stop" method="post" action="/stop">
        <button type="submit">停止</button>
      </form>`;
  const current =
    view.mode === "classroom"
      ? `Classroom${view.modelId ? ` · ${escapeHtml(view.modelId)}` : ""}`
      : "Native";
  const modelSwitch = `<section class="switch">
      <h2>模型開關</h2>
      <p>目前：${current}</p>
      ${restart}
      <form method="post" action="/switch">
        <button type="submit" name="mode" value="classroom">Classroom</button>
        <button type="submit" name="mode" value="native">Native</button>
      </form>
      <form method="post" action="/reload">
        <button type="submit">重新載入</button>
      </form>
    </section>`;
  const actions = view.canCopyKey
    ? `<form method="post" action="/copy">
        <button type="submit">複製 Classroom API Key</button>
      </form>
      <form method="post" action="/clear">
        <button type="submit">清除連線</button>
      </form>`
    : `<form class="redeem" method="post" action="/redeem">
        <label>邀請碼 <input name="invite_code" autocomplete="off"></label>
        <label>課堂暱稱 <input name="nickname" autocomplete="off"></label>
        <button type="submit">連線</button>
      </form>`;
  const folderValue = view.projectFolder ? ` value="${escapeHtml(view.projectFolder)}"` : "";
  const folderLocked = view.commandRunning ? " disabled" : "";
  const installNotice = view.installNotice
    ? `<p class="install-notice">${escapeHtml(view.installNotice)}</p>`
    : "";
  const catalog = renderCatalog(view);
  const command = renderCommand(view);
  const environment = renderEnvironment(view);

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Classroom App</title>
  <style>
    body {
      margin: 1rem;
      font-family: "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    .connection {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .connection form,
    .connection label {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }
    input, button {
      font: inherit;
      min-height: 2.75rem;
      max-width: 100%;
    }
    .folder,
    .catalog,
    .action,
    .snippet,
    .command-panel,
    .command-choices,
    .command-panel form,
    .action form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 0;
      max-width: 100%;
    }
    .action,
    .snippet {
      padding: 0.75rem 0;
      border-top: 1px solid #ccc;
    }
    pre, code {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      margin: 0;
      max-width: 100%;
    }
    button:disabled {
      opacity: 0.55;
    }
    .switch,
    .restart {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex-basis: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .environment,
    .environment form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex-basis: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .environment label {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      max-width: 100%;
    }
    .environment input[type="checkbox"] {
      width: 1.25rem;
      min-width: 1.25rem;
      min-height: 1.25rem;
      flex: 0 0 auto;
    }
    .stop {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      flex-basis: 100%;
    }
    @media (min-width: 48rem) {
      .connection {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: flex-end;
      }
      form.redeem,
      .switch form {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: flex-end;
      }
      .command-choices {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
      }
    }
  </style>
</head>
<body>
  <main class="connection">
    <h1>課堂連線</h1>
    ${classLabel}
    ${detail}
    ${notice}
    ${actions}
    <form class="folder" method="post" action="/project-folder">
      <label>專案資料夾 <input name="project_folder" autocomplete="off"${folderValue}${folderLocked}></label>
      <button type="submit"${folderLocked}>設定專案資料夾</button>
      ${installNotice}
    </form>
    ${modelSwitch}
    ${stop}
    ${environment}
  </main>
  ${command}
  ${catalog}
  <script>
    window.addEventListener("pagehide", function () {
      navigator.sendBeacon("/close");
    });
  </script>
</body>
</html>`;
}
