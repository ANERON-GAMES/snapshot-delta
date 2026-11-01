import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { MAX_SEQUENCE } from "../src/index.js";
import * as api from "../src/index.js";

const root = new URL("..", import.meta.url);

test("public exports stay limited to the documented surface", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "BaselineMismatchError",
    "MAX_SEQUENCE",
    "applyDelta",
    "createDelta"
  ]);
  assert.equal(typeof api.BaselineMismatchError, "function");
  assert.equal(typeof api.applyDelta, "function");
  assert.equal(typeof api.createDelta, "function");
  assert.equal(MAX_SEQUENCE, Number.MAX_SAFE_INTEGER);
  assert.equal(MAX_SEQUENCE, 9007199254740991);
});

test("package metadata names the module and the author", () => {
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(pkg.name, "@aneron/snapshot-delta");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.author, "Vadim Gubin");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.sideEffects, false);
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.main, "./src/index.js");
  assert.equal(pkg.exports, "./src/index.js");
  assert.equal(pkg.repository.type, "git");
  assert.equal(pkg.repository.url, "git+https://github.com/ANERON-GAMES/snapshot-delta.git");
  assert.deepEqual(pkg.files, ["src", "LICENSE", "README.md"]);
  const license = readFileSync(new URL("LICENSE", root), "utf8");
  assert.equal(license.includes("Copyright (c) 2026 Vadim Gubin"), true);
  assert.equal(license.includes("anerongames"), false);
  const readme = readFileSync(new URL("README.md", root), "utf8");
  for (const heading of [
    "## Purpose",
    "## Install",
    "## Usage",
    "## API",
    "## Design",
    "## License"
  ]) {
    assert.equal(readme.includes(heading), true, heading);
  }
  assert.equal(readme.includes("## Design notes"), false);
  assert.equal(readme.includes("## API reference"), false);
  assert.equal(readme.includes('`delta.removed` is `["crate"]`'), true);
  assert.equal(readme.includes("`delta.changed.turret` is `{ y: 9 }`"), true);
  assert.equal(
    readme.includes(
      '`JSON.stringify(restored.entities)` is `{"door":{"open":true},"turret":{"name":"a","x":1,"y":9}}`'
    ),
    true
  );
  assert.equal(readme.includes("`nested.changed.pawn.alive` is `false`"), true);
  assert.equal(readme.includes("`nested.changed.pawn.pos` is `{ y: 8, z: null }`"), true);
  assert.equal(readme.includes("`cleared.changed.pawn` is `{ hp: null }`"), true);
  assert.equal(readme.includes("`coarse.changed.ship` is `{ y: 2.5 }`"), true);
  assert.equal(readme.includes("`applied.entities.ship.x` is `1`"), true);
  assert.equal(readme.includes("`skipped.changed` is `{}`"), true);
  assert.equal(readme.includes("`past.changed.ship` is `{ x: 0.5 }`"), true);
  assert.equal(readme.includes("`error.baseSequence` is `4`"), true);
  assert.equal(readme.includes("`error.sequence` is `3`"), true);
  assert.equal(readme.includes("delta baseSequence does not match the baseline sequence"), true);
  assert.equal(readme.includes('`ordered.removed` is `["Z", "a"]`'), true);
  assert.equal(readme.includes('`numeric.removed` is `["10", "2"]`'), true);
  assert.equal(readme.includes("`baseline.entities.turret.y` is `2`"), true);
  assert.equal(readme.includes('`Object.keys(kept.entities)` is `["pawn"]`'), true);
  assert.equal(readme.includes("`quiet.entities.ship.y` is `2`"), true);
  assert.equal(readme.includes('`Object.keys(indexed.added)` is `["2", "10", "Z", "a"]`'), true);
});

test("source files do not contain comments, clocks, timers, or network calls", () => {
  const files = readdirSync(new URL("src/", root)).sort();
  assert.deepEqual(files, [
    "apply.js",
    "constants.js",
    "diff.js",
    "error.js",
    "index.js",
    "plain.js",
    "validate.js"
  ]);
  for (const name of files) {
    const source = readFileSync(new URL("src/" + name, root), "utf8");
    const specifiers = source.match(/from "[^"]+"/g) ?? [];
    assert.equal(specifiers.length > 0 || !source.includes("import "), true, name);
    for (const specifier of specifiers) {
      assert.match(specifier, /^from "\.\/[a-z]+\.js"$/);
    }
    assert.equal(source.includes("node:"), false, name);
    assert.equal(source.includes("require("), false, name);
    assert.equal(source.includes("/*"), false, name);
    assert.equal(source.includes("//"), false, name);
    for (const token of [
      "Date",
      "setTimeout",
      "setInterval",
      "Math.random",
      "process",
      "fetch(",
      "globalThis",
      "queueMicrotask",
      "setImmediate",
      "performance"
    ]) {
      assert.equal(source.includes(token), false, name + " " + token);
    }
  }
});

test("the lockfile resolves only from the npm registry", () => {
  const lockPath = new URL("package-lock.json", root);
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  assert.equal(lock.lockfileVersion >= 2, true);
  const text = readFileSync(lockPath, "utf8");
  assert.equal(text.includes("git+"), false);
  assert.equal(text.includes("github:"), false);
  assert.equal(text.includes("registry.yarnpkg.com"), false);
  let resolved = 0;
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
      return;
    }
    if (value !== null && typeof value === "object") {
      if (typeof value.resolved === "string") {
        resolved += 1;
        assert.equal(
          value.resolved.startsWith("https://registry.npmjs.org/"),
          true,
          value.resolved
        );
      }
      for (const key of Object.keys(value)) {
        walk(value[key]);
      }
    }
  };
  walk(lock);
  assert.equal(resolved > 0, true);
});
