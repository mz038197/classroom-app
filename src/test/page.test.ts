import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClassroomAppView } from "../classroomApp";
import { renderPage } from "../page";

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
});
