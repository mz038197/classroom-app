import type { ClassroomAppView, CourseActionView, CourseSnippetView } from "./classroomApp";
import { actionKindLabel } from "./courseCatalog";

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
    .map((action) => renderAction(action))
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

function renderAction(action: CourseActionView): string {
  const description = action.description
    ? `<p>${escapeHtml(action.description)}</p>`
    : "";
  return `<article class="action">
    <h3>${escapeHtml(action.title)}</h3>
    <p class="kind">${escapeHtml(actionKindLabel(action.kind))}</p>
    ${description}
    <code>${escapeHtml(action.command)}</code>
  </article>`;
}

function renderSnippet(snippet: CourseSnippetView): string {
  const hint = snippet.pasteHint
    ? `<p class="paste-hint">${escapeHtml(snippet.pasteHint)}</p>`
    : "";
  return `<article class="snippet">
    <h3>${escapeHtml(snippet.title)}</h3>
    ${hint}
    <pre>${escapeHtml(snippet.body)}</pre>
  </article>`;
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
  const current =
    view.mode === "classroom"
      ? `Classroom${view.modelId ? ` · ${escapeHtml(view.modelId)}` : ""}`
      : "Native";
  const restart = view.mustRestart?.includes("vscode")
    ? `<p class="restart">請完全退出 VS Code 再打開，不要只重載視窗。</p>`
    : "";
  const modelSwitch = `<section class="switch">
      <h2>模型開關</h2>
      <p>目前：${current}</p>
      ${restart}
      <form method="post" action="/switch">
        <button type="submit" name="mode" value="classroom">Classroom</button>
        <button type="submit" name="mode" value="native">Native</button>
      </form>
      <form method="post" action="/reload">
        <button type="submit">重新載入模型</button>
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
  const installNotice = view.installNotice
    ? `<p class="install-notice">${escapeHtml(view.installNotice)}</p>`
    : "";
  const catalog = renderCatalog(view);

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
    .snippet {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 0;
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
    }
    .switch,
    .restart {
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
      <label>專案資料夾 <input name="project_folder" autocomplete="off"${folderValue}></label>
      <button type="submit">設定專案資料夾</button>
      ${installNotice}
    </form>
    ${modelSwitch}
  </main>
  ${catalog}
  <script>
    window.addEventListener("pagehide", function () {
      navigator.sendBeacon("/close");
    });
  </script>
</body>
</html>`;
}
