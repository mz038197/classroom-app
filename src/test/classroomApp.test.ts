import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClassroomApp } from "../classroomApp";

const KEY = "vcr_sk_nick";

function harness(
  session?: { class_name?: string; name?: string },
  options?: {
    redeemError?: Error;
    sessionModels?: (apiKey: string) => Promise<string[]>;
  },
) {
  const redeemCalls: { invite_code: string; nickname: string }[] = [];
  const modelKeys: string[] = [];
  let storedKey: string | undefined;
  let clipboard = "";
  let clipboardWrites = 0;
  let clipboardError: Error | undefined;
  let stops = 0;
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
  });
  return {
    app,
    redeemCalls,
    modelKeys,
    clipboard: () => clipboard,
    clipboardWrites: () => clipboardWrites,
    storedKey: () => storedKey,
    stops: () => stops,
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
});
