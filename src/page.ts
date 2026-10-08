import type { ClassroomAppView } from "./classroomApp";

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
    }
    @media (min-width: 48rem) {
      .connection {
        flex-direction: row;
        flex-wrap: wrap;
        align-items: flex-end;
      }
      form.redeem {
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
  </main>
  <script>
    window.addEventListener("pagehide", function () {
      navigator.sendBeacon("/close");
    });
  </script>
</body>
</html>`;
}
