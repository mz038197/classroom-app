import { spawn } from "node:child_process";

export type CommandResult = { output: string; exitCode: number | undefined };

export function collectOutput(
  command: string,
  args: string[],
  cwd?: string,
  onOutput?: (output: string) => void,
): Promise<{ exitCode: number | undefined; output: string; spawnError: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: {
      exitCode: number | undefined;
      output: string;
      spawnError: boolean;
    }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      windowsHide: process.platform === "win32",
      // cmd.exe parses the complete command itself; Node's CRT escaping would
      // turn embedded quotes into literal characters passed to tools like uv.
      windowsVerbatimArguments: process.platform === "win32" && command === "cmd.exe",
    });
    const chunks: Buffer[] = [];
    const receive = (chunk: Buffer) => {
      chunks.push(chunk);
      onOutput?.(Buffer.concat(chunks).toString("utf8"));
    };
    child.stdout?.on("data", receive);
    child.stderr?.on("data", receive);
    child.on("error", () => finish({
      exitCode: 1, output: Buffer.concat(chunks).toString("utf8"), spawnError: true,
    }));
    child.on("close", (code) => finish({
      exitCode: code ?? undefined, output: Buffer.concat(chunks).toString("utf8"), spawnError: false,
    }));
  });
}

export function shellLaunch(command: string): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", `"${command}"`] };
  }
  return { command: "sh", args: ["-c", command] };
}

export async function runCommand(
  cwd: string,
  command: string,
  onOutput?: (output: string) => void,
): Promise<CommandResult> {
  const launch = shellLaunch(command);
  const result = await collectOutput(launch.command, launch.args, cwd, onOutput);
  if (result.spawnError) throw new Error("command failed");
  if (result.exitCode !== 0) {
    return { output: `${result.output}\n指令執行失敗（結束碼：${result.exitCode ?? "未知"}）。\n`, exitCode: result.exitCode };
  }
  return { output: result.output, exitCode: result.exitCode };
}
