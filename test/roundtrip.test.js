import assert from "node:assert/strict";
import test from "node:test";
import { BaselineMismatchError, applyDelta, createDelta } from "../src/index.js";
import { canonical, expectedSnapshot, mulberry32, randomSnapshot } from "./helpers.js";

function nextInt(random, limit) {
  return random() % limit;
}

test("random snapshots round-trip exactly and leave both inputs unchanged", () => {
  const seeds = [1, 7, 99, 65535, 0x4a17, 3, 11, 42];
  for (const seed of seeds) {
    const random = mulberry32(seed);
    for (let step = 0; step < 20; step += 1) {
      const baseSequence = nextInt(random, 40);
      const currentSequence = nextInt(random, 40);
      const baseline = randomSnapshot(random, baseSequence);
      const current = randomSnapshot(random, currentSequence);
      const baseClone = structuredClone(baseline);
      const currentClone = structuredClone(current);
      const delta = createDelta(baseline, current);
      assert.deepEqual(baseline, baseClone);
      assert.deepEqual(current, currentClone);
      const restored = applyDelta(baseline, delta);
      assert.deepEqual(restored, canonical(current));
      assert.deepEqual(expectedSnapshot(baseline, current, 0), canonical(current));
      assert.deepEqual(restored, expectedSnapshot(baseline, current, 0));
      const again = createDelta(baseline, current);
      assert.deepEqual(again, delta);
      assert.notEqual(again, delta);
      assert.equal(JSON.stringify(again), JSON.stringify(delta));
      const revived = JSON.parse(JSON.stringify(delta));
      assert.deepEqual(applyDelta(baseline, revived), restored);
      assert.equal(Object.isFrozen(delta), true);
      assert.equal(Object.isFrozen(restored.entities), true);
      if (baseSequence !== currentSequence) {
        assert.throws(
          () => applyDelta(current, delta),
          (error) => {
            assert.equal(error instanceof BaselineMismatchError, true);
            assert.equal(error.baseSequence, baseSequence);
            assert.equal(error.sequence, currentSequence);
            return true;
          }
        );
      }
      const identity = createDelta(current, current);
      assert.deepEqual(identity.removed, []);
      assert.deepEqual(identity.added, {});
      assert.deepEqual(identity.changed, {});
    }
  }
});

test("random tolerant deltas match an independent snap of the same rules", () => {
  const seeds = [4, 15, 88, 501, 9001];
  for (const seed of seeds) {
    const random = mulberry32(seed);
    for (let step = 0; step < 20; step += 1) {
      const baseline = randomSnapshot(random, step);
      const current = randomSnapshot(random, step + 1);
      const tolerance = nextInt(random, 8) / 2;
      const beforeBase = structuredClone(baseline);
      const beforeCurrent = structuredClone(current);
      const options = tolerance === 0 ? undefined : { tolerance };
      const delta = createDelta(baseline, current, options);
      assert.deepEqual(baseline, beforeBase);
      assert.deepEqual(current, beforeCurrent);
      const restored = applyDelta(baseline, delta);
      assert.deepEqual(restored, expectedSnapshot(baseline, current, tolerance));
      const exact = createDelta(baseline, restored);
      assert.deepEqual(exact.removed, delta.removed);
      assert.deepEqual(exact.added, delta.added);
      assert.deepEqual(exact.changed, delta.changed);
      const quiet = createDelta(restored, current, { tolerance });
      assert.deepEqual(quiet.removed, []);
      assert.deepEqual(quiet.added, {});
      assert.deepEqual(quiet.changed, {});
    }
  }
});
