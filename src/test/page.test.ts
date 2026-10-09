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
    assert.match(original, /\.brand \{ grid-column: 2; justify-self: center; \}/);
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
