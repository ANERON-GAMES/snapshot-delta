import { freezeDeep, isPlainObject, readOwn, sortedKeys, unionKeys, writeOwn } from "./plain.js";
import { readSnapshot, readTolerance } from "./validate.js";

const UNCHANGED = Symbol("unchanged");
const TOLERANCE_FIELD_MESSAGE = "tolerance must be a number for a numeric field";

function fieldTolerance(tolerance, key) {
  if (typeof tolerance === "number") {
    return tolerance;
  }
  if (!Object.hasOwn(tolerance, key)) {
    return 0;
  }
  return readOwn(tolerance, key);
}

function diffAny(left, right, tolerance) {
  const leftObject = isPlainObject(left);
  const rightObject = isPlainObject(right);
  if (leftObject && rightObject) {
    return diffRecords(left, right, tolerance);
  }
  if (typeof left === "number" && typeof right === "number") {
    if (typeof tolerance !== "number") {
      throw new RangeError(TOLERANCE_FIELD_MESSAGE);
    }
    if (Math.abs(left - right) <= tolerance) {
      return UNCHANGED;
    }
    return right;
  }
  if (typeof left === typeof right && left === right) {
    return UNCHANGED;
  }
  return right;
}

function diffRecords(left, right, tolerance) {
  const keys = unionKeys(left, right);
  const patch = {};
  let count = 0;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const inLeft = Object.hasOwn(left, key);
    const inRight = Object.hasOwn(right, key);
    if (!inRight) {
      writeOwn(patch, key, null);
      count += 1;
      continue;
    }
    if (!inLeft) {
      writeOwn(patch, key, readOwn(right, key));
      count += 1;
      continue;
    }
    const change = diffAny(readOwn(left, key), readOwn(right, key), fieldTolerance(tolerance, key));
    if (change !== UNCHANGED) {
      writeOwn(patch, key, change);
      count += 1;
    }
  }
  if (count === 0) {
    return UNCHANGED;
  }
  return patch;
}

export function createDelta(baseline, current, options) {
  const source = readSnapshot(baseline);
  const target = readSnapshot(current);
  const tolerance = readTolerance(options);
  const removed = [];
  const added = {};
  const changed = {};
  const leftIds = sortedKeys(source.entities);
  const rightIds = sortedKeys(target.entities);
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftIds.length || rightIndex < rightIds.length) {
    const leftId = leftIndex < leftIds.length ? leftIds[leftIndex] : null;
    const rightId = rightIndex < rightIds.length ? rightIds[rightIndex] : null;
    if (rightId === null || (leftId !== null && leftId < rightId)) {
      removed.push(leftId);
      leftIndex += 1;
    } else if (leftId === null || leftId > rightId) {
      writeOwn(added, rightId, readOwn(target.entities, rightId));
      rightIndex += 1;
    } else {
      const patch = diffRecords(
        readOwn(source.entities, leftId),
        readOwn(target.entities, rightId),
        tolerance
      );
      if (patch !== UNCHANGED) {
        writeOwn(changed, leftId, patch);
      }
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return freezeDeep({
    baseSequence: source.sequence,
    sequence: target.sequence,
    removed,
    added,
    changed
  });
}
