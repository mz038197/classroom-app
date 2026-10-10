import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClassroomAppView } from "../classroomApp";
import { renderPage } from "../page";
import { renderPrototypePage } from "../pagePrototype";

const KEY = "vcr_sk_nick";

function view(extra?: Partial<ClassroomAppView>): ClassroomAppView {
  return {
    connected: true,
    detail: "Classroom API Key 已設定。",
    canCopyKey: true,
    installAvailable: false,
    commandRunning: false,
    mode: "native",
    tools: [
      { id: "uv", label: "uv", installed: false, selected: false },
      { id: "git", label: "git", installed: false, selected: false },
      { id: "node", label: "Node.js", installed: false, selected: false },
      { id: "pwsh", label: "PowerShell 7", installed: false, selected: false },
    ],
    ...extra,
  };
}

describe("Classroom App page", () => {
  it("shows the full VS Code restart notice when mustRestart includes vscode", () => {
    const html = renderPage(view({ mustRestart: ["vscode"] }));
    assert.equal(
      html.includes("請完全退出 VS Code 再打開，不要只重載視窗。"),
      true,
    );
    assert.equal(html.includes(KEY), false);
  });

  it("omits the VS Code restart notice when vscode is not in mustRestart", () => {
    const html = renderPage(view({ mustRestart: ["codex"] }));
    assert.equal(html.includes("請完全退出 VS Code"), false);
    assert.equal(html.includes(KEY), false);
  });

  it("stacks modules in one column before the wide breakpoint", () => {
    const html = renderPage(view());
    assert.match(
      html,
      /@media \(max-width:\s*40rem\)\s*\{[^}]*grid-template-columns:\s*1fr\s*;/,
    );
  });

  it("uses one appearance button and keeps the key off the page", () => {
    const html = renderPage(view());
    assert.match(html, /凡思課堂安裝/);
    assert.match(html, /data-appearance-toggle/);
    assert.match(html, /\[data-appearance="light"\]/);
    assert.match(html, /\[data-appearance="dark"\]/);
    assert.equal(html.includes("proto-bar"), false);
    assert.equal(html.includes(KEY), false);
  });

  it("prototype variants disagree about layout and keep the key off the page", () => {
    const rail = renderPrototypePage(view(), "A");
    const list = renderPrototypePage(view(), "B");
    const split = renderPrototypePage(view(), "C");
    assert.match(rail, /class="shell"/);
    assert.match(rail, /A · 側欄控制台/);
    assert.equal(list.includes('class="shell"'), false);
    assert.match(list, /class="set-row"/);
    assert.match(split, /class="split"/);
    assert.equal(split.includes('class="set-row"'), false);
    const original = renderPrototypePage(view(), "D");
    assert.match(original, /class="modules"/);
    assert.match(original, /D · 原本/);
    assert.match(original, /class="display"/);
    assert.match(original, /\.tile \{ border: 1px solid light-dark\(#e6e6e6, #3d3d3d\); \}/);
    assert.match(original, /\.display \{ display: none; \}/);
    assert.match(original, /class="page-head"><h2>教室設定<\/h2><p>連線、資料夾、模型與環境。<\/p>/);
    assert.match(original, /class="badge off">個人</);
    assert.match(original, /目前模型/);
    assert.match(original, /使用自己的帳號/);
    assert.match(original, />課堂</);
    assert.match(original, />個人</);
    assert.match(original, /<h2>環境<\/h2><span class="badge off">未完成<\/span>/);
    assert.match(original, /<em class="missing">未安裝<\/em>/);
    assert.match(original, /<h2>課程安裝<\/h2>/);
    assert.match(original, /<h2>課程片段<\/h2>/);
    assert.match(original, /這堂課沒有片段。/);
    assert.equal(original.includes("<h2>指令</h2>"), false);
    assert.equal(original.includes("<h2>課程</h2>"), false);
    const withSnippet = renderPrototypePage(
      view({
        catalog: {
          source: "local",
          actions: [
            {
              id: "tools",
              title: "安裝 tools",
              kind: "package",
              command: "echo hi",
            },
          ],
          snippets: [
            { id: "stub", title: "骨架", body: "print(1)\n", pasteHint: "main.py" },
          ],
        },
        pendingCommand: "echo hi",
      }),
      "D",
    );
    assert.match(withSnippet, /安裝 tools/);
    assert.match(withSnippet, /echo hi/);
    assert.match(withSnippet, /骨架/);
    assert.equal(withSnippet.includes("<h3>本課片段</h3>"), false);
    assert.equal(withSnippet.includes("這堂課沒有片段。"), false);
    const installAt = withSnippet.indexOf("<h2>課程安裝</h2>");
    const snippetAt = withSnippet.indexOf("<h2>課程片段</h2>");
    const actionAt = withSnippet.indexOf("安裝 tools");
    const titleAt = withSnippet.indexOf("骨架");
    assert.equal(installAt < snippetAt, true);
    assert.equal(actionAt < snippetAt && titleAt > snippetAt, true);
    assert.equal(renderPage(view()).includes("課程安裝"), false);
    assert.match(original, /重新載入/);
    const readyTools = [
      { id: "uv" as const, label: "uv", installed: true, selected: false },
      { id: "git" as const, label: "git", installed: true, selected: false },
      { id: "node" as const, label: "Node.js", installed: true, selected: false },
      { id: "pwsh" as const, label: "PowerShell 7", installed: true, selected: false },
    ];
    const ready = renderPrototypePage(view({ tools: readyTools }), "D");
    assert.match(ready, /<h2>環境<\/h2><span class="badge">已就緒<\/span>/);
    const nonePicked = renderPrototypePage(view({ installAvailable: true }), "D");
    assert.match(nonePicked, /class="go" disabled>確認安裝/);
    const onePicked = renderPrototypePage(
      view({
        installAvailable: true,
        tools: [
          { id: "uv", label: "uv", installed: false, selected: true },
          { id: "git", label: "git", installed: false, selected: false },
          { id: "node", label: "Node.js", installed: true, selected: false },
          { id: "pwsh", label: "PowerShell 7", installed: false, selected: false },
        ],
      }),
      "D",
    );
    assert.match(onePicked, /class="go">確認安裝/);
    assert.equal(renderPage(view()).includes("已就緒"), false);
    const classroom = renderPrototypePage(
      view({ mode: "classroom", modelId: "gpt", mustRestart: ["codex"] }),
      "D",
    );
    assert.match(classroom, /class="badge">課堂</);
    assert.match(classroom, /class="model-value">gpt</);
    assert.match(classroom, /請完全退出 Codex，再重新打開。/);
    assert.match(original, /\.restart \{ color: light-dark\(#9a4a08, #fbbf24\); \}/);
    assert.match(original, /:root:not\(\[data-appearance="light"\]\) \{ --bg: #212121; \}/);
    assert.equal(renderPage(view()).includes("--bg: #212121"), false);
    assert.equal(renderPage(view()).includes("使用自己的帳號"), false);
    assert.equal(renderPage(view()).includes(">Classroom</button>"), true);
    assert.match(original, /class="badge off">未設定</);
    assert.match(original, /action="\/pick-folder"/);
    assert.match(original, />設定</);
    assert.equal(original.includes("設定專案資料夾"), false);
    const picked = renderPrototypePage(view({ projectFolder: "D:\\lesson" }), "D");
    assert.match(picked, /class="badge">已設定</);
    assert.match(original, /placeholder="還沒選擇"/);
    assert.match(original, /name="project_folder"/);
    assert.equal(original.includes("安裝課程時會寫進這裡。"), false);
    assert.match(picked, /value="D:\\lesson"/);
    const bad = renderPrototypePage(view({ folderError: "這不是資料夾。" }), "D");
    assert.match(bad, /這不是資料夾。/);
    assert.equal(renderPage(view()).includes("設定專案資料夾"), true);
    assert.match(original, /class="brand-title">VPod</);
    assert.equal(renderPage(view()).includes("VPod"), false);
    assert.equal(renderPage(view()).includes('class="ver"'), false);
    assert.match(original, /grid-template-columns: 232px/);
    assert.match(original, /translateX\(-100%\)/);
    assert.equal(renderPage(view()).includes("教室設定"), false);
    assert.equal(renderPage(view()).includes("mobile-top"), false);
    assert.match(original, /class="tile-head"><h2>連線<\/h2><span class="badge">已連線<\/span>/);
    const offline = renderPrototypePage(view({ connected: false }), "D");
    assert.match(offline, /class="badge off">未連線</);
    assert.match(original, /class="copy-icon"/);
    assert.equal(original.includes(">複製 Classroom API Key<"), false);
    const welcomed = renderPrototypePage(
      view({
        nickname: "Jeff",
        courseTitle: "Jeff AI 素養課程",
        sessionTitle: "第一堂 : 先問，為什麼?",
        classLabel: "Jeff AI 素養課程 · 第一堂 : 先問，為什麼?",
        detail: "Classroom API Key 已設定。",
      }),
      "D",
    );
    assert.match(welcomed, /class="welcome">歡迎! Jeff</);
    assert.match(welcomed, /class="course-title">Jeff AI 素養課程</);
    assert.match(welcomed, /class="session-sub">第一堂 : 先問，為什麼\?</);
    assert.match(welcomed, /API KEY 已設定/);
    assert.match(welcomed, /class="key-row"/);
    assert.match(welcomed, /清除連線/);
    assert.equal(welcomed.includes('<p class="class-label">'), false);
    assert.equal(welcomed.includes('<p class="detail">Classroom API Key 已設定。</p>'), false);
    assert.equal(welcomed.includes("邀請碼"), false);
    assert.equal(renderPage(view()).includes(">複製 Classroom API Key<"), true);
    assert.equal(renderPage(view()).includes(".display { display: none; }"), false);
    assert.equal(renderPage(view()).includes("#3d3d3d"), false);
    assert.equal(original.includes('class="shell"'), false);
    assert.equal(rail.includes(KEY), false);
    assert.equal(original.includes(KEY), false);
  });
});
