// The Material theme downloads only the icon glyphs it lists; an icon missing from that list shows as broken text.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const between = (src, start, end) => { const i = src.indexOf(start); return src.slice(i, src.indexOf(end, i)); };

test("every Material icon ui.js uses is in the font subset theme.js loads", () => {
  const ui = readFileSync(new URL("../assets/js/ui.js", import.meta.url), "utf8");
  const theme = readFileSync(new URL("../assets/js/theme.js", import.meta.url), "utf8");
  const used = [...between(ui, "const MSR = {", "};").matchAll(/:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
  const loaded = new Set([...between(theme, "const names = [", "];").matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]));
  assert.ok(used.length > 30);
  assert.deepEqual(used.filter((n) => !loaded.has(n)), []);
});
