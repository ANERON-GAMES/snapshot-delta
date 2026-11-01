import assert from "node:assert/strict";
import test from "node:test";
import { BaselineMismatchError, applyDelta, createDelta } from "../src/index.js";
import { snapshot } from "./helpers.js";

function emptyDelta(baseSequence, sequence) {
  return {
    baseSequence,
    sequence,
    removed: [],
    added: {},
    changed: {}
  };
}

test("a mismatched baseline sequence throws before entity matching", () => {
  const baseline = {
    sequence: 4,
    entities: {
      turret: { x: 1, y: 2, name: "a" },
      crate: { hp: 5 }
    }
  };
  const current = {
    sequence: 5,
    entities: {
      turret: { x: 1, y: 9, name: "a" },
      door: { open: true }
    }
  };
  const delta = createDelta(baseline, current);
  const other = { sequence: 3, entities: {} };
  let error = null;
  try {
    applyDelta(other, delta);
  } catch (caught) {
    error = caught;
  }
  assert.equal(error instanceof BaselineMismatchError, true);
  assert.equal(error instanceof RangeError, false);
  assert.equal(error instanceof Error, true);
  assert.equal(error.name, "BaselineMismatchError");
  assert.equal(error.message, "delta baseSequence does not match the baseline sequence");
  assert.equal(error.baseSequence, 4);
  assert.equal(error.sequence, 3);
  assert.equal(other.sequence, 3);
  assert.equal(baseline.entities.turret.y, 2);
});

test("the same sequence with a different entity map is not a baseline mismatch", () => {
  const left = snapshot(5, { a: { x: 1 } });
  const right = snapshot(5, { b: { x: 2 } });
  const delta = createDelta(left, snapshot(6, { a: { x: 3 } }));
  assert.throws(() => applyDelta(right, delta), {
    name: "RangeError",
    message: "a changed entity must exist on the baseline"
  });
  assert.throws(
    () =>
      applyDelta(right, {
        baseSequence: 5,
        sequence: 6,
        removed: ["a"],
        added: {},
        changed: {}
      }),
    {
      name: "RangeError",
      message: "a removed entity must exist on the baseline"
    }
  );
  assert.throws(
    () =>
      applyDelta(left, {
        baseSequence: 5,
        sequence: 6,
        removed: [],
        added: { a: { x: 4 } },
        changed: {}
      }),
    {
      name: "RangeError",
      message: "an added entity must not exist on the baseline"
    }
  );
});

test("a removed id is reported before an added id and a changed id", () => {
  assert.throws(
    () =>
      applyDelta(snapshot(1, {}), {
        baseSequence: 1,
        sequence: 2,
        removed: ["gone"],
        added: { gone: { n: 1 } },
        changed: { also: { n: 1 } }
      }),
    {
      name: "TypeError",
      message: "added, removed, and changed entity ids must be disjoint"
    }
  );
  assert.throws(
    () =>
      applyDelta(snapshot(1, { stay: { n: 1 } }), {
        baseSequence: 1,
        sequence: 2,
        removed: ["gone"],
        added: {},
        changed: { also: { n: 1 } }
      }),
    {
      name: "RangeError",
      message: "a removed entity must exist on the baseline"
    }
  );
  assert.throws(
    () =>
      applyDelta(snapshot(1, { stay: { n: 1 } }), {
        baseSequence: 1,
        sequence: 2,
        removed: [],
        added: { stay: { n: 2 } },
        changed: { missing: { n: 1 } }
      }),
    {
      name: "RangeError",
      message: "an added entity must not exist on the baseline"
    }
  );
});

test("field patches merge, replace, delete, and reject a no-op object", () => {
  const baseline = snapshot(1, {
    a: { n: 1, p: { x: 1, y: 2 }, q: 3 },
    b: { p: { x: 1 } }
  });
  const merged = applyDelta(baseline, {
    baseSequence: 1,
    sequence: 2,
    removed: [],
    added: {},
    changed: {
      a: { p: { y: 9, z: 4 }, q: { k: true } }
    }
  });
  assert.deepEqual(merged.entities.a, { n: 1, p: { x: 1, y: 9, z: 4 }, q: { k: true } });
  const replaced = applyDelta(baseline, {
    baseSequence: 1,
    sequence: 2,
    removed: [],
    added: {},
    changed: { a: { n: {}, p: null } }
  });
  assert.deepEqual(replaced.entities.a.n, {});
  assert.equal(Object.hasOwn(replaced.entities.a, "p"), false);
  assert.throws(
    () =>
      applyDelta(baseline, {
        baseSequence: 1,
        sequence: 2,
        removed: [],
        added: {},
        changed: { a: { missing: null } }
      }),
    {
      name: "RangeError",
      message: "a removed field must exist"
    }
  );
  assert.throws(
    () =>
      applyDelta(baseline, {
        baseSequence: 1,
        sequence: 2,
        removed: [],
        added: {},
        changed: { b: { p: {} } }
      }),
    {
      name: "TypeError",
      message: "patch must change a field"
    }
  );
  assert.throws(
    () =>
      applyDelta(baseline, {
        baseSequence: 1,
        sequence: 2,
        removed: [],
        added: {},
        changed: { a: { n: { bad: null } } }
      }),
    {
      name: "TypeError",
      message: "value must be a finite number, a string, a boolean, or a plain object"
    }
  );
  const before = structuredClone(baseline);
  assert.throws(() =>
    applyDelta(baseline, {
      baseSequence: 1,
      sequence: 2,
      removed: [],
      added: {},
      changed: { b: { p: {} } }
    })
  );
  assert.deepEqual(baseline, before);
});

test("a hand-built delta round-trips through JSON and copies records", () => {
  const baseline = snapshot(1, { z: { b: 1, a: true }, a: { n: 0 } });
  const delta = {
    baseSequence: 1,
    sequence: 4,
    removed: ["z"],
    added: { m: { s: "", on: false } },
    changed: { a: { n: 2, extra: { k: "v" } } }
  };
  const restored = applyDelta(baseline, JSON.parse(JSON.stringify(delta)));
  assert.equal(restored.sequence, 4);
  assert.deepEqual(Object.keys(restored.entities), ["a", "m"]);
  assert.deepEqual(restored.entities.a, { extra: { k: "v" }, n: 2 });
  assert.equal(restored.entities.m.on, false);
  assert.equal(restored.entities.m.s, "");
  delta.changed.a.extra.k = "mutated";
  assert.equal(restored.entities.a.extra.k, "v");
  assert.notEqual(restored.entities.a, baseline.entities.a);
  const copied = applyDelta(baseline, emptyDelta(1, 1));
  assert.deepEqual(Object.keys(copied.entities), ["a", "z"]);
  assert.deepEqual(Object.keys(copied.entities.z), ["a", "b"]);
  assert.equal(copied.sequence, 1);
  assert.notEqual(copied.entities.z, baseline.entities.z);
});

test("false, zero, and the empty string stay distinct from a missing field", () => {
  const baseline = snapshot(1, { a: {} });
  const current = snapshot(2, { a: { on: false, n: 0, s: "" } });
  const delta = createDelta(baseline, current);
  assert.deepEqual(delta.changed.a, { n: 0, on: false, s: "" });
  const restored = applyDelta(baseline, delta);
  assert.equal(restored.entities.a.on, false);
  assert.equal(restored.entities.a.n, 0);
  assert.equal(restored.entities.a.s, "");
  const dropped = createDelta(current, baseline);
  assert.deepEqual(dropped.changed.a, { n: null, on: null, s: null });
  assert.deepEqual(applyDelta(current, dropped).entities.a, {});
});
