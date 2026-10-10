import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { runCommand } from "../commandRunner";

it("preserves quoted Git dependencies, paths with spaces, and chained commands", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "classroom command runner "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const script = path.join(root, "argument probe.cjs");
  await fs.writeFile(script, "console.log(JSON.stringify(process.argv.slice(2)));", "utf8");
  const dependency = "peas-agent-tools @ git+https://github.com/mz038197/peas-agent-tools.git";
  const command = `"${process.execPath}" "${script}" "${dependency}" && "${process.execPath}" "${script}" "second step"`;
  const { output, exitCode } = await runCommand(root, command);
  assert.equal(exitCode, 0);
  const lines = output.trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(lines, [[dependency], ["second step"]]);
});

it("shows a failed exit code with the original output and stops subsequent chained steps", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "classroom command failure "));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const failing = path.join(root, "fail.cjs");
  const next = path.join(root, "next.cjs");
  await fs.writeFile(failing, "console.error('dependency failed'); process.exitCode = 7;", "utf8");
  await fs.writeFile(next, "console.log('should not run');", "utf8");
  const { output, exitCode } = await runCommand(root, `"${process.execPath}" "${failing}" && "${process.execPath}" "${next}"`);
  assert.equal(exitCode, 7);
  assert.match(output, /dependency failed/);
  assert.match(output, /指令執行失敗（結束碼：7）/);
  assert.doesNotMatch(output, /should not run/);
});
