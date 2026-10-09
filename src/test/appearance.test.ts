import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAppearance } from "../appearance";

describe("外觀", () => {
  it("keeps a stored choice over the system appearance", () => {
    assert.equal(resolveAppearance("light", true), "light");
    assert.equal(resolveAppearance("dark", false), "dark");
  });

  it("follows the system appearance when this machine has not chosen", () => {
    assert.equal(resolveAppearance(null, true), "dark");
    assert.equal(resolveAppearance(null, false), "light");
    assert.equal(resolveAppearance("other", true), "dark");
  });
});
