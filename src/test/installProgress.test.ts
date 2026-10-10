import assert from "node:assert/strict";
import { it } from "node:test";
import vm from "node:vm";
import { installProgressScript } from "../installProgress";

function harness() {
  let submit!: (event: unknown) => Promise<void>;
  let click!: (event: unknown) => void;
  let complete!: (response: { ok: boolean; succeeded?: boolean; output?: string }) => void;
  let nextUpdate!: () => Promise<void>;
  let reloads = 0;
  let confirmations = 0;
  let latestOutput = "Downloading demo…\n";
  const title = { textContent: "確認安裝" };
  const status = { textContent: "" };
  const output = { textContent: "", hidden: true, scrollTop: 0, clientHeight: 100, scrollHeight: 100 };
  const dismiss = { disabled: false, hidden: true };
  const choices = { hidden: false };
  const buttons = [{ disabled: false }, { disabled: false }, dismiss];
  const panel = {
    querySelector(selector: string) {
      if (selector === "[data-install-dismiss]") return dismiss;
      if (selector === ".choices") return choices;
      return selector === "h2" ? title : selector === "[data-install-status]" ? status : output;
    },
    querySelectorAll() { return buttons; },
    setAttribute() {},
  };
  const form = { action: "/confirm", matches: () => true, closest: () => panel };
  const pending = new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
    complete = (response) => resolve({ ...response, json: async () => response });
  });
  vm.runInNewContext(installProgressScript, {
    document: { addEventListener(event: string, handler: typeof submit) {
      if (event === "submit") submit = handler;
      if (event === "click") click = handler;
    } },
    window: { location: { reload() { reloads += 1; } } },
    FormData: class {},
    URLSearchParams: class {},
    fetch: async (url: string) => {
      if (url === "/confirm") { confirmations += 1; return pending; }
      return { ok: true, json: async () => ({ running: true, output: latestOutput }) };
    },
    setTimeout(update: typeof nextUpdate) { nextUpdate = update; return 1; },
    clearTimeout() {},
  });
  return {
    submit: () => submit({ target: form, preventDefault() {} }),
    complete, title, status, output, buttons, dismiss, choices,
    acknowledge: () => click({ target: { closest: () => dismiss } }),
    update: async (value: string) => { latestOutput = value; await nextUpdate(); },
    counts: () => ({ confirmations, reloads }),
  };
}

it("updates output and holds a successful result until the student acknowledges it", async () => {
  const ui = harness();
  const request = ui.submit();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(ui.title.textContent, "安裝中");
  assert.ok(ui.buttons.every((button) => button.disabled));
  assert.equal(ui.output.hidden, false);
  assert.equal(ui.output.textContent, "Downloading demo…\n");
  assert.equal(ui.counts().reloads, 0);
  await ui.update("Downloading demo…\nInstalling…\n");
  assert.equal(ui.output.textContent, "Downloading demo…\nInstalling…\n");
  await ui.submit();
  assert.equal(ui.counts().confirmations, 1);
  ui.complete({ ok: true, succeeded: true, output: "Installed 1 package\n" });
  await request;
  assert.equal(ui.title.textContent, "安裝成功");
  assert.equal(ui.output.textContent, "Installed 1 package\n");
  assert.equal(ui.counts().reloads, 0);
  assert.equal(ui.choices.hidden, true);
  assert.equal(ui.dismiss.hidden, false);
  assert.equal(ui.dismiss.disabled, false);
  ui.acknowledge();
  assert.equal(ui.counts().reloads, 1);
});

it("holds a failed installation result until the student acknowledges it", async () => {
  const ui = harness();
  const request = ui.submit();
  ui.complete({ ok: true, succeeded: false, output: "dependency failed\n" });
  await request;
  assert.equal(ui.title.textContent, "安裝失敗");
  assert.equal(ui.output.textContent, "dependency failed\n");
  assert.equal(ui.counts().reloads, 0);
  assert.equal(ui.dismiss.hidden, false);
  assert.equal(ui.dismiss.disabled, false);
  await ui.submit();
  assert.equal(ui.counts().confirmations, 1);
  ui.acknowledge();
  assert.equal(ui.counts().reloads, 1);
});

it("keeps the result warning visible if confirmation fails without allowing a duplicate installation", async () => {
  const ui = harness();
  const request = ui.submit();
  ui.complete({ ok: false });
  await request;
  assert.equal(ui.title.textContent, "無法確認安裝結果");
  assert.match(ui.status.textContent, /重新整理頁面/);
  assert.equal(ui.counts().reloads, 0);
  await ui.submit();
  assert.equal(ui.counts().confirmations, 1);
});
