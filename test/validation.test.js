import assert from "node:assert/strict";
import test from "node:test";
import { createDelta, applyDelta } from "../src/index.js";
import { record, snapshot } from "./helpers.js";

const SEQUENCE_MESSAGE = "sequence must be an integer from 0 to 9007199254740991";
const BASE_SEQUENCE_MESSAGE = "baseSequence must be an integer from 0 to 9007199254740991";
const VALUE_MESSAGE = "value must be a finite number, a string, a boolean, or a plain object";
const SNAPSHOT_FIELDS = "snapshot fields must be sequence and entities";
const DELTA_FIELDS = "delta fields must be baseSequence, sequence, removed, added, and changed";

function empty(sequence = 0) {
  return snapshot(sequence, {});
}

function delta(overrides = {}) {
  return {
    baseSequence: 0,
    sequence: 1,
    removed: [],
    added: {},
    changed: {},
    ...overrides
  };
}

test("a frozen snapshot and a null-prototype snapshot are accepted", () => {
  const frozen = Object.freeze({
    sequence: 1,
    entities: Object.freeze({ a: Object.freeze({ x: 1 }) })
  });
  const bare = Object.create(null);
  bare.sequence = 2;
  bare.entities = Object.create(null);
  bare.entities.a = Object.create(null);
  bare.entities.a.x = 2;
  const change = createDelta(frozen, bare);
  assert.equal(change.baseSequence, 1);
  assert.equal(change.sequence, 2);
  assert.deepEqual(change.changed.a, { x: 2 });
  assert.equal(frozen.entities.a.x, 1);
});

test("omitted options and an undefined tolerance compare numbers exactly", () => {
  const baseline = snapshot(1, { a: { x: 1 } });
  const current = snapshot(2, { a: { x: 1.5 } });
  assert.deepEqual(createDelta(baseline, current).changed.a, { x: 1.5 });
  assert.deepEqual(createDelta(baseline, current, {}).changed.a, { x: 1.5 });
  assert.deepEqual(
    createDelta(baseline, current, { tolerance: undefined, extra: true }).changed.a,
    {
      x: 1.5
    }
  );
});

test("the constructor path rejects a snapshot that is not a plain object", () => {
  for (const value of [null, [], "snapshot", 1, true, false]) {
    assert.throws(() => createDelta(value, empty(1)), {
      name: "TypeError",
      message: "snapshot must be an object"
    });
  }
  assert.throws(() => createDelta(empty(0), null), {
    name: "TypeError",
    message: "snapshot must be an object"
  });
  const dated = new Date();
  dated.sequence = 0;
  dated.entities = {};
  assert.throws(() => createDelta(dated, empty(1)), {
    name: "TypeError",
    message: "snapshot must be an object"
  });
});

test("createDelta validates the baseline before the current snapshot and the options", () => {
  assert.throws(() => createDelta({ sequence: -1, entities: {} }, null), {
    name: "RangeError",
    message: SEQUENCE_MESSAGE
  });
  assert.throws(() => createDelta(empty(0), empty(1), null), {
    name: "TypeError",
    message: "options must be an object"
  });
  for (const options of [[], "options", 1, true]) {
    assert.throws(() => createDelta(empty(0), empty(1), options), {
      name: "TypeError",
      message: "options must be an object"
    });
  }
});

test("a snapshot must have sequence and entities and no other own field", () => {
  assert.throws(() => createDelta({ sequence: 0 }, empty(1)), {
    name: "TypeError",
    message: SNAPSHOT_FIELDS
  });
  assert.throws(() => createDelta({ sequence: 0, entities: {}, extra: 1 }, empty(1)), {
    name: "TypeError",
    message: SNAPSHOT_FIELDS
  });
});

test("sequence must be an integer from 0 through the maximum safe integer", () => {
  for (const sequence of [
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    "0",
    null,
    true,
    1n
  ]) {
    assert.throws(() => createDelta(snapshot(sequence, {}), empty(1)), {
      name: "RangeError",
      message: SEQUENCE_MESSAGE
    });
  }
  const top = createDelta(empty(0), snapshot(Number.MAX_SAFE_INTEGER, {}));
  assert.equal(top.sequence, Number.MAX_SAFE_INTEGER);
  assert.equal(createDelta(snapshot(-0, {}), empty(0)).baseSequence, 0);
  assert.equal(Object.is(createDelta(snapshot(-0, {}), empty(0)).baseSequence, 0), true);
});

test("entities and entity records must be plain objects", () => {
  assert.throws(() => createDelta(snapshot(0, null), empty(1)), {
    name: "TypeError",
    message: "entities must be a plain object"
  });
  assert.throws(() => createDelta(snapshot(0, []), empty(1)), {
    name: "TypeError",
    message: "entities must be a plain object"
  });
  assert.throws(() => createDelta(snapshot(0, { a: null }), empty(1)), {
    name: "TypeError",
    message: "entity must be a plain object"
  });
  assert.throws(() => createDelta(snapshot(0, { a: [] }), empty(1)), {
    name: "TypeError",
    message: "entity must be a plain object"
  });
  assert.throws(() => createDelta(snapshot(0, { "": { x: 1 } }), empty(1)), {
    name: "TypeError",
    message: "entity id must be a non-empty string"
  });
});

test("an accessor or a hidden field is rejected without calling the getter", () => {
  const entity = {};
  Object.defineProperty(entity, "x", {
    enumerable: true,
    get() {
      throw new Error("getter");
    }
  });
  assert.throws(() => createDelta(snapshot(0, { a: entity }), empty(1)), {
    name: "TypeError",
    message: "entity must be a plain object"
  });
  const nested = {};
  Object.defineProperty(nested, "x", {
    enumerable: true,
    get() {
      throw new Error("getter");
    }
  });
  assert.throws(() => createDelta(snapshot(0, { a: { p: nested } }), empty(1)), {
    name: "TypeError",
    message: VALUE_MESSAGE
  });
  const hidden = { x: 1 };
  Object.defineProperty(hidden, "y", { value: 2, enumerable: false });
  assert.throws(() => createDelta(snapshot(0, { a: hidden }), empty(1)), {
    name: "TypeError",
    message: "entity must be a plain object"
  });
  const marked = { x: 1 };
  marked[Symbol("s")] = 2;
  assert.throws(() => createDelta(snapshot(0, { a: marked }), empty(1)), {
    name: "TypeError",
    message: "entity must be a plain object"
  });
});

test("field values must be finite data and must not cycle", () => {
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 1n, () => {}, []]) {
    assert.throws(() => createDelta(snapshot(0, { a: { x: value } }), empty(1)), {
      name: "TypeError",
      message: VALUE_MESSAGE
    });
  }
  const entity = { n: 1 };
  entity.self = entity;
  assert.throws(() => createDelta(snapshot(0, { a: entity }), empty(1)), {
    name: "TypeError",
    message: "value must not contain a circular reference"
  });
  const left = { n: 1 };
  const right = { n: 2 };
  left.other = right;
  right.other = left;
  assert.throws(() => createDelta(snapshot(0, { a: left, b: right }), empty(1)), {
    name: "TypeError",
    message: "value must not contain a circular reference"
  });
});

test("a shared child is copied into independent records", () => {
  const shared = { n: 1 };
  const current = snapshot(2, { a: { s: shared }, b: { s: shared } });
  const restored = applyDelta(empty(1), createDelta(empty(1), current));
  assert.notEqual(restored.entities.a.s, restored.entities.b.s);
  assert.deepEqual(restored.entities.a.s, { n: 1 });
  shared.n = 9;
  assert.equal(restored.entities.a.s.n, 1);
  assert.equal(restored.entities.b.s.n, 1);
});

test("tolerance shape is validated after the snapshots", () => {
  assert.throws(() => createDelta(empty(0), empty(1), { tolerance: -1 }), {
    name: "RangeError",
    message: "tolerance must be a finite number greater than or equal to 0"
  });
  for (const tolerance of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => createDelta(empty(0), empty(1), { tolerance }), {
      name: "RangeError",
      message: "tolerance must be a finite number greater than or equal to 0"
    });
  }
  for (const tolerance of [null, [], "0", true, false]) {
    assert.throws(() => createDelta(empty(0), empty(1), { tolerance }), {
      name: "TypeError",
      message: "tolerance must be a plain object or a number"
    });
  }
  assert.throws(() => createDelta(empty(0), empty(1), { tolerance: { x: -0.1 } }), {
    name: "RangeError",
    message: "tolerance must be a finite number greater than or equal to 0"
  });
  const cycle = { x: 0 };
  cycle.self = cycle;
  assert.throws(() => createDelta(empty(0), empty(1), { tolerance: cycle }), {
    name: "TypeError",
    message: "tolerance must not contain a circular reference"
  });
});

test("an object tolerance on a numeric field is rejected", () => {
  const baseline = snapshot(1, { ship: { x: 1, name: "a" } });
  const current = snapshot(2, { ship: { x: 1, name: "a" } });
  assert.throws(() => createDelta(baseline, current, { tolerance: { x: { nope: 1 } } }), {
    name: "RangeError",
    message: "tolerance must be a number for a numeric field"
  });
  const renamed = createDelta(
    snapshot(1, { ship: { name: "a" } }),
    snapshot(2, { ship: { name: "b" } }),
    { tolerance: { name: { extra: 1 } } }
  );
  assert.deepEqual(renamed.changed.ship, { name: "b" });
});

test("applyDelta validates the snapshot, then the delta shape, then the sequence", () => {
  assert.throws(() => applyDelta({ sequence: -1, entities: {} }, null), {
    name: "RangeError",
    message: SEQUENCE_MESSAGE
  });
  assert.throws(() => applyDelta(empty(0), null), {
    name: "TypeError",
    message: "delta must be an object"
  });
  assert.throws(() => applyDelta(empty(0), []), {
    name: "TypeError",
    message: "delta must be an object"
  });
  assert.throws(() => applyDelta(empty(0), delta({ extra: true, sequence: -1 })), {
    name: "TypeError",
    message: DELTA_FIELDS
  });
  assert.throws(() => applyDelta(empty(0), delta({ sequence: -1, removed: "no" })), {
    name: "RangeError",
    message: SEQUENCE_MESSAGE
  });
  assert.throws(
    () =>
      applyDelta(empty(1), {
        baseSequence: 2,
        sequence: 3,
        removed: ["missing"],
        added: {},
        changed: {}
      }),
    (error) => {
      assert.equal(error.name, "BaselineMismatchError");
      return true;
    }
  );
});

test("delta sequences and collections have stable messages", () => {
  assert.throws(() => applyDelta(empty(0), delta({ baseSequence: 1.5 })), {
    name: "RangeError",
    message: BASE_SEQUENCE_MESSAGE
  });
  assert.throws(() => applyDelta(empty(0), delta({ removed: "a" })), {
    name: "TypeError",
    message: "removed must be an array"
  });
  const hole = ["a"];
  hole.length = 2;
  assert.throws(() => applyDelta(empty(0), delta({ removed: hole })), {
    name: "TypeError",
    message: "removed must be an array"
  });
  const extra = ["a"];
  extra.note = true;
  assert.throws(() => applyDelta(empty(0), delta({ removed: extra })), {
    name: "TypeError",
    message: "removed must be an array"
  });
  const accessed = [];
  Object.defineProperty(accessed, "0", {
    enumerable: true,
    get() {
      return "a";
    }
  });
  assert.throws(() => applyDelta(empty(0), delta({ removed: accessed })), {
    name: "TypeError",
    message: "removed must be an array"
  });
  assert.throws(() => applyDelta(empty(0), delta({ removed: [""] })), {
    name: "TypeError",
    message: "removed entity id must be a non-empty string"
  });
  assert.throws(() => applyDelta(empty(0), delta({ removed: [1] })), {
    name: "TypeError",
    message: "removed entity id must be a non-empty string"
  });
  assert.throws(() => applyDelta(empty(0), delta({ removed: ["b", "a"] })), {
    name: "TypeError",
    message: "removed entity ids must be unique and in ascending order"
  });
  assert.throws(() => applyDelta(empty(0), delta({ removed: ["a", "a"] })), {
    name: "TypeError",
    message: "removed entity ids must be unique and in ascending order"
  });
  assert.throws(() => applyDelta(empty(0), delta({ added: [] })), {
    name: "TypeError",
    message: "added must be a plain object"
  });
  assert.throws(() => applyDelta(empty(0), delta({ changed: [] })), {
    name: "TypeError",
    message: "changed must be a plain object"
  });
  assert.throws(() => applyDelta(empty(0), delta({ added: { "": { x: 1 } } })), {
    name: "TypeError",
    message: "entity id must be a non-empty string"
  });
  assert.throws(() => applyDelta(empty(0), delta({ added: { a: null } })), {
    name: "TypeError",
    message: "entity must be a plain object"
  });
  assert.throws(() => applyDelta(empty(0), delta({ added: { a: { x: null } } })), {
    name: "TypeError",
    message: VALUE_MESSAGE
  });
  assert.throws(() => applyDelta(empty(0), delta({ changed: { a: null } })), {
    name: "TypeError",
    message: "patch must be a plain object"
  });
  assert.throws(() => applyDelta(empty(0), delta({ changed: { a: {} } })), {
    name: "TypeError",
    message: "patch must not be empty"
  });
  assert.throws(() => applyDelta(empty(0), delta({ changed: { a: { x: undefined } } })), {
    name: "TypeError",
    message: "patch value must be null, a finite number, a string, a boolean, or a plain object"
  });
  assert.throws(() => applyDelta(empty(0), delta({ changed: { a: { x: Number.NaN } } })), {
    name: "TypeError",
    message: "patch value must be null, a finite number, a string, a boolean, or a plain object"
  });
  const patch = { x: 1 };
  patch.self = patch;
  assert.throws(() => applyDelta(empty(0), delta({ changed: { a: patch } })), {
    name: "TypeError",
    message: "patch must not contain a circular reference"
  });
  assert.throws(
    () =>
      applyDelta(snapshot(0, { a: { n: 1 } }), {
        baseSequence: 0,
        sequence: 1,
        removed: ["a"],
        added: { a: { n: 2 } },
        changed: {}
      }),
    {
      name: "TypeError",
      message: "added, removed, and changed entity ids must be disjoint"
    }
  );
  const updated = applyDelta(snapshot(0, { a: { n: 1 } }), {
    baseSequence: 0,
    sequence: 1,
    removed: [],
    added: {},
    changed: { a: { n: 2 } }
  });
  assert.equal(updated.entities.a.n, 2);
});

test("special property names are ordinary ids and field names", () => {
  const entities = record([
    [
      "__proto__",
      record([
        ["constructor", 1],
        ["toString", false]
      ])
    ],
    ["constructor", record([["__proto__", "ok"]])]
  ]);
  const baseline = empty(1);
  const current = snapshot(2, entities);
  const change = createDelta(baseline, current);
  const restored = applyDelta(baseline, change);
  assert.equal(Object.getPrototypeOf(restored.entities), Object.prototype);
  assert.equal({}.polluted, undefined);
  assert.equal(restored.entities["__proto__"].constructor, 1);
  assert.equal(restored.entities["__proto__"].toString, false);
  assert.equal(restored.entities.constructor["__proto__"], "ok");
  assert.equal(Object.keys(restored.entities).includes("__proto__"), true);
});
