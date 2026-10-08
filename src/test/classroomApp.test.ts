import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClassroomApp } from "../classroomApp";

const KEY = "vcr_sk_nick";
const PROXY = "http://127.0.0.1:47821";

const REMOTE_YAML = `
actions:
  - id: demo
    title: 安裝 demo
    kind: package
    description: 從課堂清單安裝
    command: uv add demo
snippets:
  - id: stub
    title: 骨架
    paste_hint: main.py
    body: "print(1)\\n"
`;

function harness(
  session?: { class_name?: string; name?: string },
  options?: {
    redeemError?: Error;
    catalogYaml?: unknown;
    catalogBody?: { course_catalog_yaml?: unknown };
    catalogError?: Error;
    files?: Record<string, string | undefined>;
    sessionModels?: (apiKey: string) => Promise<string[]>;
    codex?: Record<string, unknown>;
    claudeTerminal?: Record<string, unknown>;
    vsCode?: Record<string, unknown>;
  },
) {
  const redeemCalls: { invite_code: string; nickname: string }[] = [];
  const catalogKeys: string[] = [];
  const fileReads: string[] = [];
  const modelKeys: string[] = [];
  let storedKey: string | undefined;
  let clipboard = "";
  let clipboardWrites = 0;
  let clipboardError: Error | undefined;
  let stops = 0;
  let proxyStops = 0;
  let proxyStarts = 0;
  const docs = {
    codex: { ...(options?.codex ?? {}) },
    claudeTerminal: { ...(options?.claudeTerminal ?? {}) },
    vsCode: { ...(options?.vsCode ?? {}) },
  };
  const routeWrites = { codex: 0, claudeTerminal: 0, vsCode: 0 };
  const resolvedSession = session ?? { class_name: "Demo", name: "Week 1" };
  const app = new ClassroomApp({
    router: {
      async redeemNickname(body) {
        redeemCalls.push(body);
        if (options?.redeemError) {
          throw options.redeemError;
        }
        return {
          api_key: KEY,
          session: resolvedSession,
        };
      },
      async fetchSessionModels(apiKey: string) {
        modelKeys.push(apiKey);
        if (options?.sessionModels) {
          return options.sessionModels(apiKey);
        }
        return ["second-looking-but-first", "later"];
      },
    },
    catalog: {
      async fetchCourseCatalog(apiKey) {
        catalogKeys.push(apiKey);
        if (options?.catalogError) {
          throw options.catalogError;
        }
        if (options?.catalogBody) {
          return options.catalogBody;
        }
        return {
          course_catalog_yaml:
            options?.catalogYaml === undefined
              ? REMOTE_YAML
              : options.catalogYaml,
        };
      },
    },
    projectFiles: {
      async readClassroomInstalls(folder) {
        fileReads.push(folder);
        return options?.files?.[folder];
      },
    },
    clipboard: {
      async write(text: string) {
        if (clipboardError) {
          throw clipboardError;
        }
        clipboard = text;
        clipboardWrites += 1;
      },
    },
    storage: {
      async getApiKey() {
        return storedKey;
      },
      async setApiKey(apiKey: string) {
        storedKey = apiKey;
      },
      async clearApiKey() {
        storedKey = undefined;
      },
    },
    stopProcess() {
      stops += 1;
    },
    proxyBaseUrl: PROXY,
    routes: {
      async readCodex() {
        return docs.codex;
      },
      async writeCodex(doc) {
        routeWrites.codex += 1;
        docs.codex = doc;
      },
      async readClaudeTerminal() {
        return docs.claudeTerminal;
      },
      async writeClaudeTerminal(doc) {
        routeWrites.claudeTerminal += 1;
        docs.claudeTerminal = doc;
      },
      async readVsCodeClaude() {
        return docs.vsCode;
      },
      async writeVsCodeClaude(doc) {
        routeWrites.vsCode += 1;
        docs.vsCode = doc;
      },
    },
    proxy: {
      start() {
        proxyStarts += 1;
      },
      stop() {
        proxyStops += 1;
      },
    },
  });
  return {
    app,
    redeemCalls,
    modelKeys,
    clipboard: () => clipboard,
    clipboardWrites: () => clipboardWrites,
    storedKey: () => storedKey,
    stops: () => stops,
    proxyStops: () => proxyStops,
    proxyStarts: () => proxyStarts,
    docs,
    routeWrites,
    catalogKeys,
    fileReads,
    failClipboard(error: Error) {
      clipboardError = error;
    },
  };
}

describe("Classroom App redeem", () => {
  it("does not redeem when the invite code is blank after trim", async () => {
    const { app, redeemCalls, modelKeys } = harness();
    await app.redeem("   ", "Ada");
    assert.equal(redeemCalls.length, 0);
    assert.deepEqual(modelKeys, []);
    assert.equal(app.view().connected, false);
    assert.equal(app.view().canCopyKey, false);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("does not redeem when the nickname is blank after trim", async () => {
    const { app, redeemCalls, modelKeys } = harness();
    await app.redeem("ABC12345", " \n\t ");
    assert.equal(redeemCalls.length, 0);
    assert.deepEqual(modelKeys, []);
    assert.equal(app.view().connected, false);
    assert.equal(app.view().canCopyKey, false);
  });

  it("shows Class Label after redeem and keeps the key out of the view", async () => {
    const { app, redeemCalls, storedKey } = harness();
    await app.redeem("  ABC12345 ", " Ada ");
    assert.deepEqual(redeemCalls, [
      { invite_code: "ABC12345", nickname: "Ada" },
    ]);
    const view = app.view();
    assert.equal(view.connected, true);
    assert.equal(view.classLabel, "Demo · Week 1");
    assert.equal(view.detail, "Classroom API Key 已設定。");
    assert.equal(view.canCopyKey, true);
    assert.equal(storedKey(), KEY);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("uses only the session name when class name is absent", async () => {
    const { app } = harness({ name: "Week 1" });
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().classLabel, "Week 1");
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("stays disconnected when redeem fails and does not keep the key", async () => {
    const { app, redeemCalls, storedKey } = harness(undefined, {
      redeemError: new Error(`router said ${KEY}`),
    });
    await app.redeem("ABC12345", "Ada");
    assert.equal(redeemCalls.length, 1);
    assert.equal(app.view().connected, false);
    assert.equal(app.view().canCopyKey, false);
    assert.equal(app.view().classLabel, undefined);
    assert.equal(storedKey(), undefined);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
    assert.equal(app.view().detail, "兌換失敗。請檢查邀請碼與課堂暱稱。");
  });
});

describe("Copy Classroom API Key", () => {
  it("copies the stored key and tells the student not to share it", async () => {
    const { app, clipboard } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.copyKey();
    assert.equal(clipboard(), KEY);
    const view = app.view();
    assert.equal(
      view.notice,
      "已複製 Classroom API Key。請勿分享給不信任的人。",
    );
    assert.equal(view.detail, "Classroom API Key 已設定。");
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("reports copy failure without echoing the key", async () => {
    const { app, clipboard, failClipboard } = harness();
    await app.redeem("ABC12345", "Ada");
    failClipboard(new Error(`clipboard down ${KEY}`));
    await app.copyKey();
    assert.equal(clipboard(), "");
    const view = app.view();
    assert.equal(
      view.notice,
      "無法複製 Classroom API Key。請重新連線後再試。",
    );
    assert.equal(view.canCopyKey, true);
    assert.equal(view.classLabel, "Demo · Week 1");
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("does not copy when the student is not connected", async () => {
    const { app, clipboard } = harness();
    await app.copyKey();
    assert.equal(clipboard(), "");
    assert.equal(
      app.view().notice,
      "無法複製 Classroom API Key。請重新連線後再試。",
    );
    assert.equal(app.view().canCopyKey, false);
  });
});

describe("Clear Classroom Connection", () => {
  it("removes the copy entry and Class Label", async () => {
    const { app, storedKey, clipboardWrites } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.copyKey();
    assert.equal(clipboardWrites(), 1);
    await app.clearConnection();
    const view = app.view();
    assert.equal(view.connected, false);
    assert.equal(view.canCopyKey, false);
    assert.equal(view.classLabel, undefined);
    assert.equal(view.notice, undefined);
    assert.equal(storedKey(), undefined);
    assert.equal(view.catalog, undefined);
    assert.equal(JSON.stringify(view).includes(KEY), false);
    await app.copyKey();
    assert.equal(clipboardWrites(), 1);
    assert.equal(app.view().canCopyKey, false);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("returns the switch to Native and drops the copy entry", async () => {
    const { app, storedKey, clipboardWrites } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    await app.clearConnection();
    const view = app.view();
    assert.equal(view.mode, "native");
    assert.equal(view.modelId, undefined);
    assert.equal(view.canCopyKey, false);
    assert.equal(view.classLabel, undefined);
    assert.equal(view.notice, undefined);
    assert.equal(storedKey(), undefined);
    assert.equal(JSON.stringify(view).includes(KEY), false);
    await app.copyKey();
    assert.equal(clipboardWrites(), 0);
    await app.setSwitch("classroom");
    assert.equal(app.view().mode, "native");
  });
});

describe("Model Switch", () => {
  it("uses one mode for both Codex and Claude Code, selecting the first returned id", async () => {
    const { app, modelKeys } = harness();
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().mode, "native");
    assert.deepEqual(modelKeys, [KEY]);
    await app.setSwitch("classroom");
    assert.deepEqual(modelKeys, [KEY]);
    const view = app.view();
    assert.equal(view.mode, "classroom");
    assert.equal(view.modelId, "second-looking-but-first");
    assert.equal("codex" in view, false);
    assert.equal("claude" in view, false);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("stays Native when the allowlist is explicitly empty", async () => {
    const { app, modelKeys } = harness(undefined, {
      async sessionModels() {
        return [];
      },
    });
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    assert.equal(app.view().mode, "native");
    assert.equal(app.view().modelId, undefined);
    assert.deepEqual(modelKeys, [KEY]);
  });

  it("stays Native when there is no Classroom API Key", async () => {
    const { app, modelKeys } = harness();
    await app.setSwitch("classroom");
    assert.equal(app.view().mode, "native");
    assert.equal(app.view().modelId, undefined);
    assert.deepEqual(modelKeys, []);
  });

  it("returns to Native when the new session allowlist is explicitly empty", async () => {
    let call = 0;
    const { app } = harness(undefined, {
      async sessionModels() {
        call += 1;
        if (call === 1) {
          return ["second-looking-but-first", "later"];
        }
        return [];
      },
    });
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().mode, "native");
    assert.equal(app.view().modelId, undefined);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("replaces the selected id with the new session's first id", async () => {
    let call = 0;
    const { app } = harness(undefined, {
      async sessionModels(apiKey) {
        assert.equal(apiKey, KEY);
        call += 1;
        if (call === 1) {
          return ["second-looking-but-first", "later"];
        }
        return ["fresh-session-first", "tail"];
      },
    });
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().mode, "classroom");
    assert.equal(app.view().modelId, "fresh-session-first");
  });

  it("keeps the previous Classroom id when reload throws", async () => {
    let fail = false;
    const { app } = harness(undefined, {
      async sessionModels() {
        if (fail) {
          throw new Error("refetch failed, template-fallback-id");
        }
        return ["second-looking-but-first", "later"];
      },
    });
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    fail = true;
    await app.reloadAllowlist();
    const view = app.view();
    assert.equal(view.mode, "classroom");
    assert.equal(view.modelId, "second-looking-but-first");
    assert.equal(JSON.stringify(view).includes("template-fallback-id"), false);
  });

  it("does not keep a third-party base URL when returning to Native", async () => {
    const { app } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    await app.setSwitch("native");
    const view = app.view();
    assert.equal(view.mode, "native");
    assert.equal(view.modelId, undefined);
    assert.equal(view.connected, true);
    const serialized = JSON.stringify(view);
    assert.equal(serialized.includes("openai_base_url"), false);
    assert.equal(serialized.includes("ANTHROPIC_BASE_URL"), false);
    assert.equal(serialized.includes("http"), false);
    assert.equal(serialized.includes(KEY), false);
  });
});

describe("Course Catalog after redeem", () => {
  it("shows remote actions and snippets using the stored Classroom API Key", async () => {
    const { app, catalogKeys, storedKey, fileReads } = harness();
    await app.redeem("ABC12345", "Ada");
    assert.deepEqual(catalogKeys, [KEY]);
    assert.equal(catalogKeys[0], storedKey());
    const view = app.view();
    assert.equal(view.catalog?.source, "remote");
    assert.deepEqual(view.catalog?.actions, [
      {
        id: "demo",
        title: "安裝 demo",
        kind: "package",
        description: "從課堂清單安裝",
        command: "uv add demo",
      },
    ]);
    assert.deepEqual(view.catalog?.snippets, [
      {
        id: "stub",
        title: "骨架",
        pasteHint: "main.py",
        body: "print(1)\n",
      },
    ]);
    assert.equal(view.catalog?.localNote, undefined);
    assert.equal(fileReads.length, 0);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("keeps snippet body whitespace and does not read a project file", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogYaml: `
actions:
  - id: demo
    title: Demo
    kind: skill
    command: echo hi
snippets:
  - id: stub
    title: 骨架
    paste_hint: mcp_client.py
    body: "  keep  \\n"
`,
    });
    await app.redeem("ABC12345", "Ada");
    const snippet = app.view().catalog?.snippets?.[0];
    assert.equal(snippet?.body, "  keep  \n");
    assert.equal(snippet?.pasteHint, "mcp_client.py");
    assert.equal(fileReads.length, 0);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("omits the snippet region when snippets are missing or empty", async () => {
    const missing = harness(undefined, {
      catalogYaml: `
actions:
  - id: demo
    title: Demo
    kind: skill
    command: echo hi
`,
    });
    await missing.app.redeem("ABC12345", "Ada");
    assert.equal(missing.app.view().catalog?.actions.length, 1);
    assert.equal(missing.app.view().catalog?.snippets, undefined);
    assert.equal(
      Object.hasOwn(missing.app.view().catalog ?? {}, "snippets"),
      false,
    );

    const empty = harness(undefined, {
      catalogYaml: "actions: []\nsnippets: []\n",
    });
    await empty.app.redeem("ABC12345", "Ada");
    assert.deepEqual(empty.app.view().catalog?.actions, []);
    assert.equal(empty.app.view().catalog?.snippets, undefined);
    assert.equal(
      Object.hasOwn(empty.app.view().catalog ?? {}, "snippets"),
      false,
    );
  });

  it("keeps an empty remote action list and does not read the local file", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogYaml: "actions: []\n",
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: Should Not Load
    kind: skill
    command: echo local
`,
      },
    });
    await app.redeem("ABC12345", "Ada");
    await app.setProjectFolder("D:\\lesson");
    const view = app.view();
    assert.equal(view.catalog?.source, "remote");
    assert.deepEqual(view.catalog?.actions, []);
    assert.equal(view.catalog?.snippets, undefined);
    assert.equal(view.catalog?.localNote, undefined);
    assert.equal(JSON.stringify(view).includes("Should Not Load"), false);
    assert.deepEqual(fileReads, []);
  });

  it("reads classroom-installs.yaml when remote fetch throws and a Project Folder is set", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogError: new Error("network down"),
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: 本機動作
    kind: mcp
    command: echo local
`,
      },
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    const view = app.view();
    assert.equal(view.catalog?.source, "local");
    assert.equal(view.catalog?.localNote, "這是本機清單。");
    assert.equal(view.catalog?.actions[0]?.title, "本機動作");
    assert.equal(view.catalog?.actions[0]?.kind, "mcp");
    assert.equal(view.catalog?.snippets, undefined);
    assert.equal(view.installAvailable, true);
    assert.deepEqual(fileReads, ["D:\\lesson"]);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("reads the local file when the remote body has no YAML string", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogBody: { course_catalog_yaml: null },
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: 本機動作
    kind: skill
    command: echo local
`,
      },
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().catalog?.source, "local");
    assert.equal(app.view().catalog?.localNote, "這是本機清單。");
    assert.equal(app.view().catalog?.actions[0]?.title, "本機動作");
    assert.deepEqual(fileReads, ["D:\\lesson"]);
  });

  it("rejects an illegal remote catalog without actions, snippets, or the local file", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogYaml: `
actions:
  - id: partial
    title: Partial Action
    kind: skill
    command: echo hi
snippets:
  - id: stub
    title: A
    body: a
  - id: stub
    title: B
    body: b
`,
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: Local Only
    kind: skill
    command: echo local
`,
      },
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    const view = app.view();
    assert.equal(view.connected, true);
    assert.equal(view.catalog, undefined);
    assert.equal(view.catalogError?.includes("重複"), true);
    assert.equal(JSON.stringify(view).includes("Partial Action"), false);
    assert.equal(JSON.stringify(view).includes("Local Only"), false);
    assert.deepEqual(fileReads, []);
  });

  it("does not fall back when the remote YAML string is present but empty", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogYaml: "",
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: Local Only
    kind: skill
    command: echo local
`,
      },
    });
    await app.setProjectFolder("D:\\lesson");
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().catalog, undefined);
    assert.equal(JSON.stringify(app.view()).includes("Local Only"), false);
    assert.deepEqual(fileReads, []);
  });

  it("loads the remote catalog without a Project Folder and does not read a local file", async () => {
    const { app, fileReads } = harness(undefined, {
      files: {
        "D:\\lesson": `
actions:
  - id: local
    title: Local Only
    kind: skill
    command: echo local
`,
      },
    });
    await app.redeem("ABC12345", "Ada");
    const view = app.view();
    assert.equal(view.catalog?.source, "remote");
    assert.equal(view.catalog?.actions[0]?.title, "安裝 demo");
    assert.equal(view.projectFolder, undefined);
    assert.equal(view.installAvailable, false);
    assert.equal(view.installNotice, "尚未指定專案資料夾，安裝不可用。");
    assert.deepEqual(fileReads, []);
    assert.equal(JSON.stringify(view).includes(KEY), false);
  });

  it("does not read a local file when remote fetch throws and no Project Folder is set", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogError: new Error("network down"),
      files: {
        "D:\\somewhere": `
actions:
  - id: local
    title: Local Only
    kind: skill
    command: echo local
`,
      },
    });
    await app.redeem("ABC12345", "Ada");
    const view = app.view();
    assert.equal(view.connected, true);
    assert.equal(view.catalog, undefined);
    assert.equal(view.installAvailable, false);
    assert.equal(view.installNotice, "尚未指定專案資料夾，安裝不可用。");
    assert.equal(JSON.stringify(view).includes("Local Only"), false);
    assert.deepEqual(fileReads, []);
  });

  it("replaces the Project Folder and reads the new local list", async () => {
    const { app, fileReads } = harness(undefined, {
      catalogError: new Error("network down"),
      files: {
        "D:\\one": `
actions:
  - id: a
    title: From A
    kind: package
    command: echo a
`,
        "D:\\two": `
actions:
  - id: b
    title: From B
    kind: skill
    command: echo b
`,
      },
    });
    await app.setProjectFolder("D:\\one");
    await app.redeem("ABC12345", "Ada");
    assert.equal(app.view().catalog?.actions[0]?.title, "From A");
    await app.setProjectFolder("  D:\\two  ");
    const view = app.view();
    assert.equal(view.projectFolder, "D:\\two");
    assert.equal(view.catalog?.source, "local");
    assert.equal(view.catalog?.localNote, "這是本機清單。");
    assert.equal(view.catalog?.actions[0]?.title, "From B");
    assert.equal(JSON.stringify(view).includes("From A"), false);
    assert.deepEqual(fileReads, ["D:\\one", "D:\\two"]);
  });
});

describe("route addresses", () => {
  it("points Codex openai_base_url at the proxy and keeps trust and mcp", async () => {
    const { app, docs } = harness(undefined, {
      codex: { trust: "always", mcp: { server: "local" }, model: "kept" },
    });
    await app.start();
    assert.equal(docs.codex.openai_base_url, PROXY);
    assert.equal(docs.codex.trust, "always");
    assert.deepEqual(docs.codex.mcp, { server: "local" });
    assert.equal(docs.codex.model, "kept");
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("points both Claude ANTHROPIC_BASE_URL fields at the proxy and leaves API key fields alone", async () => {
    const { app, docs } = harness(undefined, {
      claudeTerminal: {
        ANTHROPIC_API_KEY: "sk-ant-keep",
        apiKey: "keep-api",
        CUSTOM_API_KEY: "keep-custom",
        theme: "dark",
      },
      vsCode: {
        "claudeCode.environmentVariables": [
          { name: "ANTHROPIC_API_KEY", value: "sk-ant-keep" },
          { name: "OTHER", value: "stay" },
        ],
        apiKey: "keep-api",
        EDITOR_API_KEY: "keep-editor",
      },
    });
    await app.start();
    assert.equal(docs.claudeTerminal.ANTHROPIC_BASE_URL, PROXY);
    assert.equal(docs.claudeTerminal.ANTHROPIC_API_KEY, "sk-ant-keep");
    assert.equal(docs.claudeTerminal.apiKey, "keep-api");
    assert.equal(docs.claudeTerminal.CUSTOM_API_KEY, "keep-custom");
    assert.equal(docs.claudeTerminal.theme, "dark");
    assert.deepEqual(docs.vsCode["claudeCode.environmentVariables"], [
      { name: "ANTHROPIC_API_KEY", value: "sk-ant-keep" },
      { name: "OTHER", value: "stay" },
      { name: "ANTHROPIC_BASE_URL", value: PROXY },
    ]);
    assert.equal(docs.vsCode.apiKey, "keep-api");
    assert.equal(docs.vsCode.EDITOR_API_KEY, "keep-editor");
    assert.equal(Object.hasOwn(docs.claudeTerminal, "ANTHROPIC_AUTH_TOKEN"), false);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
    assert.equal(JSON.stringify(docs).includes("sk-ant-keep"), true);
  });

  it("keeps other VS Code environment map entries when setting ANTHROPIC_BASE_URL", async () => {
    const { app, docs } = harness(undefined, {
      vsCode: {
        "claudeCode.environmentVariables": {
          OTHER: "stay",
          ANTHROPIC_API_KEY: "sk-ant-keep",
        },
        "editor.fontSize": 14,
      },
    });
    await app.start();
    assert.deepEqual(docs.vsCode["claudeCode.environmentVariables"], {
      OTHER: "stay",
      ANTHROPIC_API_KEY: "sk-ant-keep",
      ANTHROPIC_BASE_URL: PROXY,
    });
    assert.equal(docs.vsCode["editor.fontSize"], 14);
  });

  it("names the previous host and leaves the key out of the view", async () => {
    const previous = "https://user:secret@old.example/v1?key=vcr_sk_secret";
    const { app, docs } = harness(undefined, {
      codex: { openai_base_url: previous, trust: "always" },
    });
    await app.start();
    const notice = app.view().notice ?? "";
    assert.equal(notice.includes("old.example"), true);
    assert.equal(notice.includes("secret"), false);
    assert.equal(notice.includes("vcr_sk"), false);
    assert.equal(notice.includes("user:"), false);
    const viewText = JSON.stringify(app.view());
    assert.equal(viewText.includes("secret"), false);
    assert.equal(viewText.includes("vcr_sk"), false);
    assert.equal(viewText.includes(KEY), false);
    assert.equal(docs.codex.openai_base_url, PROXY);
    assert.equal(docs.codex.trust, "always");
  });

  it("asks the student to fully quit Codex and Claude Code the first time a route is written", async () => {
    const { app } = harness();
    await app.start();
    assert.deepEqual(app.view().mustRestart, ["codex", "claude"]);
    assert.equal(JSON.stringify(app.view()).includes("vscode"), false);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("changes only upstream mode and modelId while the proxy is running", async () => {
    const { app, routeWrites } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.start();
    const writes = { ...routeWrites };
    await app.setSwitch("classroom");
    assert.equal(app.view().mode, "classroom");
    assert.equal(app.view().modelId, "second-looking-but-first");
    await app.setSwitch("native");
    assert.equal(app.view().mode, "native");
    assert.equal(app.view().modelId, undefined);
    assert.deepEqual(routeWrites, writes);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("removes the route overrides when the proxy stops and does not restore the old address", async () => {
    const previous = "https://user:secret@old.example/v1?key=vcr_sk_secret";
    const { app, docs, proxyStops } = harness(undefined, {
      codex: {
        openai_base_url: previous,
        trust: "always",
        mcp: { server: "local" },
      },
      claudeTerminal: {
        ANTHROPIC_BASE_URL: "https://claude.example",
        theme: "dark",
        ANTHROPIC_API_KEY: "sk-ant-keep",
      },
      vsCode: {
        "claudeCode.environmentVariables": [
          { name: "OTHER", value: "stay" },
          { name: "ANTHROPIC_BASE_URL", value: "https://claude.example" },
        ],
        "editor.fontSize": 14,
      },
    });
    await app.start();
    await app.stop();
    assert.equal(proxyStops(), 1);
    assert.equal(Object.hasOwn(docs.codex, "openai_base_url"), false);
    assert.equal(docs.codex.trust, "always");
    assert.deepEqual(docs.codex.mcp, { server: "local" });
    assert.equal(Object.hasOwn(docs.claudeTerminal, "ANTHROPIC_BASE_URL"), false);
    assert.equal(docs.claudeTerminal.theme, "dark");
    assert.equal(docs.claudeTerminal.ANTHROPIC_API_KEY, "sk-ant-keep");
    assert.deepEqual(docs.vsCode["claudeCode.environmentVariables"], [
      { name: "OTHER", value: "stay" },
    ]);
    assert.equal(docs.vsCode["editor.fontSize"], 14);
    const written = JSON.stringify(docs);
    assert.equal(written.includes(previous), false);
    assert.equal(written.includes("old.example"), false);
    assert.equal(written.includes("claude.example"), false);
    assert.equal(written.includes("secret"), false);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("points the routes at the proxy again after stop and keeps the stored switch", async () => {
    const { app, docs, proxyStarts, proxyStops } = harness();
    await app.redeem("ABC12345", "Ada");
    await app.setSwitch("classroom");
    await app.start();
    await app.stop();
    await app.start();
    assert.equal(proxyStops(), 1);
    assert.equal(proxyStarts(), 2);
    assert.equal(docs.codex.openai_base_url, PROXY);
    assert.equal(docs.claudeTerminal.ANTHROPIC_BASE_URL, PROXY);
    assert.deepEqual(docs.vsCode["claudeCode.environmentVariables"], [
      { name: "ANTHROPIC_BASE_URL", value: PROXY },
    ]);
    assert.equal(app.view().mode, "classroom");
    assert.equal(app.view().modelId, "second-looking-but-first");
    assert.deepEqual(app.view().mustRestart, ["codex", "claude"]);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });

  it("drops ANTHROPIC_BASE_URL from a VS Code environment map and keeps the other entries", async () => {
    const { app, docs } = harness(undefined, {
      vsCode: {
        "claudeCode.environmentVariables": {
          OTHER: "stay",
          ANTHROPIC_BASE_URL: "https://claude.example",
          ANTHROPIC_API_KEY: "sk-ant-keep",
        },
      },
    });
    await app.start();
    await app.stop();
    assert.deepEqual(docs.vsCode["claudeCode.environmentVariables"], {
      OTHER: "stay",
      ANTHROPIC_API_KEY: "sk-ant-keep",
    });
    assert.equal(JSON.stringify(docs).includes("claude.example"), false);
  });
});

describe("close window", () => {
  it("does not stop the process", async () => {
    const { app, stops, storedKey, clipboardWrites } = harness();
    await app.redeem("ABC12345", "Ada");
    app.closeWindow();
    assert.equal(stops(), 0);
    assert.equal(app.view().connected, true);
    assert.equal(app.view().classLabel, "Demo · Week 1");
    assert.equal(app.view().canCopyKey, true);
    assert.equal(storedKey(), KEY);
    await app.copyKey();
    assert.equal(clipboardWrites(), 1);
    assert.equal(stops(), 0);
  });

  it("does not stop the proxy or change routes", async () => {
    const { app, docs, proxyStops, routeWrites } = harness(undefined, {
      codex: { trust: "always", mcp: { server: "local" } },
      claudeTerminal: { theme: "dark", ANTHROPIC_API_KEY: "sk-ant-keep" },
    });
    await app.start();
    const writes = { ...routeWrites };
    app.closeWindow();
    assert.equal(proxyStops(), 0);
    assert.deepEqual(routeWrites, writes);
    assert.equal(docs.codex.openai_base_url, PROXY);
    assert.equal(docs.codex.trust, "always");
    assert.deepEqual(docs.codex.mcp, { server: "local" });
    assert.equal(docs.claudeTerminal.ANTHROPIC_BASE_URL, PROXY);
    assert.equal(docs.claudeTerminal.ANTHROPIC_API_KEY, "sk-ant-keep");
    assert.equal(app.view().connected, false);
    assert.equal(JSON.stringify(app.view()).includes(KEY), false);
  });
});
