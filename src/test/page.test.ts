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
    mode: "native",
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

  it("stacks the page in a column before the wide breakpoint", () => {
    const html = renderPage(view());
    assert.match(html, /\.connection\s*\{[^}]*flex-direction:\s*column/);
    assert.match(html, /\.switch\s*,\s*\.restart\s*\{[^}]*flex-direction:\s*column/);
    assert.match(html, /@media \(min-width:\s*48rem\)/);
  });
});
