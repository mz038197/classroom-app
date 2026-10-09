/**
 * Whether assembled function-call arguments are usable JSON.
 * An empty buffer is valid (no-arg tools send no deltas). Non-empty must parse.
 */
export function toolCallArgumentsUsable(args: string): boolean {
  if (args.length === 0) return true;
  const trimmed = args.trim();
  if (!trimmed) return false;
  try {
    JSON.parse(args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether an in-progress function-call argument buffer could still become valid JSON.
 * The first non-whitespace byte must be one that can begin a JSON value.
 */
export function toolCallArgumentsCouldBeJson(args: string): boolean {
  const first = args.trimStart().charAt(0);
  if (first === "") return true;
  return first === "{"
    || first === "["
    || first === "\""
    || first === "-"
    || (first >= "0" && first <= "9")
    || first === "t"
    || first === "f"
    || first === "n";
}
