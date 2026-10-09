export type Appearance = "light" | "dark";

/** 這台電腦選過的外觀蓋過系統。沒選過才跟系統。 */
export function resolveAppearance(
  stored: string | null,
  systemDark: boolean,
): Appearance {
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return systemDark ? "dark" : "light";
}
