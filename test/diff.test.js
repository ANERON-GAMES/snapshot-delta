import assert from "node:assert/strict";
import test from "node:test";
import { applyDelta, createDelta } from "../src/index.js";
import { canonical, snapshot } from "./helpers.js";

test("the usage stream adds, removes, and patches one field", () => {
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
  const restored = applyDelta(baseline, delta);
  assert.equal(delta.baseSequence, 4);
  assert.equal(delta.sequence, 5);
  assert.deepEqual(delta.removed, ["crate"]);
  assert.deepEqual(delta.changed.turret, { y: 9 });
  assert.equal(delta.added.door.open, true);
  assert.equal(
    JSON.stringify(delta),
    '{"baseSequence":4,"sequence":5,"removed":["crate"],"added":{"door":{"open":true}},"changed":{"turret":{"y":9}}}'
  );
  assert.equal(restored.sequence, 5);
  assert.equal(restored.entities.door.open, true);
  assert.equal(
    JSON.stringify(restored.entities),
    '{"door":{"open":true},"turret":{"name":"a","x":1,"y":9}}'
  );
  assert.equal(baseline.entities.turret.y, 2);
  assert.equal(baseline.entities.crate.hp, 5);
  assert.equal(current.entities.turret.y, 9);
  assert.deepEqual(restored, canonical(current));
  assert.equal(Object.isFrozen(delta), true);
  assert.equal(Object.isFrozen(delta.removed), true);
  assert.equal(Object.isFrozen(delta.added), true);
  assert.equal(Object.isFrozen(delta.changed.turret), true);
  assert.equal(Object.isFrozen(restored), true);
  assert.equal(Object.isFrozen(restored.entities.turret), true);
  assert.throws(() => {
    delta.sequence = 1;
  }, TypeError);
});

test("nested fields are patched and a cleared entity stays", () => {
  const before = {
    sequence: 1,
    entities: {
      pawn: { hp: 10, pos: { x: 1, y: 2, z: 3 }, alive: true }
    }
  };
  const after = {
    sequence: 2,
    entities: {
      pawn: { hp: 10, pos: { x: 1, y: 8 }, alive: false }
    }
  };
  const nested = createDelta(before, after);
  assert.equal(nested.changed.pawn.alive, false);
  assert.deepEqual(nested.changed.pawn.pos, { y: 8, z: null });
  assert.equal(JSON.stringify(nested.changed.pawn), '{"alive":false,"pos":{"y":8,"z":null}}');
  const restored = applyDelta(before, nested);
  assert.deepEqual(restored.entities.pawn.pos, { x: 1, y: 8 });
  assert.equal(restored.entities.pawn.hp, 10);
  assert.equal(restored.entities.pawn.alive, false);
  const full = { sequence: 1, entities: { pawn: { hp: 1 } } };
  const emptyPawn = { sequence: 2, entities: { pawn: {} } };
  const cleared = createDelta(full, emptyPawn);
  const kept = applyDelta(full, cleared);
  assert.deepEqual(cleared.removed, []);
  assert.deepEqual(cleared.changed.pawn, { hp: null });
  assert.deepEqual(Object.keys(kept.entities), ["pawn"]);
  assert.equal(JSON.stringify(kept.entities.pawn), "{}");
});

test("tolerance skips inclusive numeric noise and keeps the baseline value", () => {
  const coarse = createDelta(
    { sequence: 7, entities: { ship: { x: 1, y: 2 } } },
    { sequence: 8, entities: { ship: { x: 1.5, y: 2.5 } } },
    { tolerance: { x: 0.5, y: 0 } }
  );
  const applied = applyDelta({ sequence: 7, entities: { ship: { x: 1, y: 2 } } }, coarse);
  const skipped = createDelta(
    { sequence: 7, entities: { ship: { x: 1, y: 2 } } },
    { sequence: 8, entities: { ship: { x: 1.25, y: 2.25 } } },
    { tolerance: 0.25 }
  );
  const quiet = applyDelta({ sequence: 7, entities: { ship: { x: 1, y: 2 } } }, skipped);
  const past = createDelta(
    { sequence: 7, entities: { ship: { x: 0, y: 0 } } },
    { sequence: 8, entities: { ship: { x: 0.5, y: 0 } } },
    { tolerance: 0.25 }
  );
  assert.deepEqual(coarse.changed.ship, { y: 2.5 });
  assert.equal(applied.entities.ship.x, 1);
  assert.equal(applied.entities.ship.y, 2.5);
  assert.deepEqual(skipped.removed, []);
  assert.deepEqual(skipped.added, {});
  assert.deepEqual(skipped.changed, {});
  assert.equal(quiet.entities.ship.x, 1);
  assert.equal(quiet.entities.ship.y, 2);
  assert.equal(quiet.sequence, 8);
  assert.deepEqual(past.changed.ship, { x: 0.5 });
});

test("a numeric tolerance applies inside nested records and does not skip structural edits", () => {
  const baseline = snapshot(1, {
    ship: { pos: { x: 1, y: 1 }, hp: 9, name: "a" }
  });
  const current = snapshot(2, {
    ship: { pos: { x: 1.2, y: 2 }, hp: 9, name: "a", flag: true }
  });
  const nested = createDelta(baseline, current, { tolerance: { pos: 0.4 } });
  assert.deepEqual(nested.changed.ship, { flag: true, pos: { y: 2 } });
  const mapped = createDelta(baseline, current, { tolerance: { pos: { x: 0.4 } } });
  assert.deepEqual(mapped.changed.ship, { flag: true, pos: { y: 2 } });
  const removed = createDelta(
    snapshot(1, { ship: { x: 1, y: 2 } }),
    snapshot(2, { ship: { x: 1.1 } }),
    { tolerance: 1 }
  );
  assert.deepEqual(removed.changed.ship, { y: null });
  const added = createDelta(
    snapshot(1, { ship: { y: 1 } }),
    snapshot(2, { ship: { y: 1, x: 0.0001 } }),
    { tolerance: 1 }
  );
  assert.deepEqual(added.changed.ship, { x: 0.0001 });
  const moved = createDelta(
    snapshot(1, { a: { x: 1 }, b: { x: 1 } }),
    snapshot(2, { a: { x: 1.1 }, c: { x: 2 } }),
    { tolerance: 1 }
  );
  assert.deepEqual(moved.removed, ["b"]);
  assert.deepEqual(moved.added.c, { x: 2 });
  assert.deepEqual(moved.changed, {});
});

test("negative zero is written as zero and does not count as a change", () => {
  const delta = createDelta(
    { sequence: -0, entities: { ship: { x: -0 } } },
    { sequence: -0, entities: { ship: { x: 0 } } }
  );
  assert.equal(Object.is(delta.baseSequence, 0), true);
  assert.equal(Object.is(delta.sequence, 0), true);
  assert.deepEqual(delta.changed, {});
  const restored = applyDelta({ sequence: -0, entities: { ship: { x: -0 } } }, delta);
  assert.equal(Object.is(restored.entities.ship.x, 0), true);
  const replaced = applyDelta(
    { sequence: 1, entities: { a: { x: 1 } } },
    {
      baseSequence: 1,
      sequence: 2,
      removed: [],
      added: {},
      changed: { a: { x: -0 } }
    }
  );
  assert.equal(Object.is(replaced.entities.a.x, 0), true);
});

test("key order is deterministic for letters and integer ids", () => {
  const ordered = createDelta(
    { sequence: 1, entities: { a: { n: 1 }, Z: { n: 1 }, m: { n: 1 } } },
    { sequence: 2, entities: { m: { n: 1 } } }
  );
  const numeric = createDelta(
    { sequence: 1, entities: { 10: { n: 1 }, 2: { n: 1 } } },
    { sequence: 2, entities: {} }
  );
  const indexed = createDelta(
    { sequence: 1, entities: {} },
    { sequence: 2, entities: { 10: { n: 1 }, 2: { n: 1 }, a: { n: 1 }, Z: { n: 1 } } }
  );
  assert.deepEqual(ordered.removed, ["Z", "a"]);
  assert.deepEqual(numeric.removed, ["10", "2"]);
  assert.deepEqual(Object.keys(indexed.added), ["2", "10", "Z", "a"]);
  assert.deepEqual(indexed.removed, []);
  const first = { sequence: 1, entities: { b: { z: 1, a: 2 }, a: { m: true } } };
  const second = { sequence: 1, entities: {} };
  second.entities.a = { m: true };
  second.entities.b = { a: 2, z: 1 };
  const current = { sequence: 2, entities: { b: { z: 3, a: 2 }, c: { k: "v" } } };
  assert.equal(
    JSON.stringify(createDelta(first, current)),
    JSON.stringify(createDelta(second, current))
  );
});

test("equal records produce an empty change and a lower sequence is allowed", () => {
  const current = snapshot(4, { a: { on: false, name: "", n: 0 } });
  const delta = createDelta(current, current);
  assert.deepEqual(delta.removed, []);
  assert.deepEqual(delta.added, {});
  assert.deepEqual(delta.changed, {});
  assert.equal(delta.baseSequence, 4);
  const rewind = createDelta(snapshot(5, { a: { n: 1 } }), snapshot(1, { a: { n: 2 } }));
  assert.equal(rewind.baseSequence, 5);
  assert.equal(rewind.sequence, 1);
  assert.deepEqual(rewind.changed.a, { n: 2 });
  const typeChange = createDelta(
    snapshot(1, { a: { n: 1, p: { x: 1 }, on: true, name: "a" } }),
    snapshot(2, { a: { n: { x: 2 }, p: 3, on: "yes", name: false } })
  );
  assert.deepEqual(typeChange.changed.a.n, { x: 2 });
  assert.equal(typeChange.changed.a.p, 3);
  assert.equal(typeChange.changed.a.on, "yes");
  assert.equal(typeChange.changed.a.name, false);
});

test("inputs stay unchanged when a field is replaced by a nested record", () => {
  const nested = { x: 1 };
  const baseline = snapshot(1, { a: { pos: nested, name: "a" } });
  const current = snapshot(2, { a: { pos: { x: 2 }, name: "b" } });
  const before = structuredClone(baseline);
  const currentBefore = structuredClone(current);
  const delta = createDelta(baseline, current);
  assert.deepEqual(baseline, before);
  assert.deepEqual(current, currentBefore);
  nested.x = 99;
  current.entities.a.pos.x = 50;
  assert.deepEqual(delta.changed.a, { name: "b", pos: { x: 2 } });
  const restored = applyDelta(baseline, delta);
  assert.equal(restored.entities.a.pos.x, 2);
  assert.notEqual(restored.entities.a.pos, current.entities.a.pos);
});
