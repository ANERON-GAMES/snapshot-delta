import { BaselineMismatchError } from "./error.js";
import {
  compareKeys,
  freezeDeep,
  isPlainObject,
  readOwn,
  sortedKeys,
  unionKeys,
  writeOwn
} from "./plain.js";
import { VALUE_MESSAGE, readDelta, readSnapshot } from "./validate.js";

const REMOVED_ENTITY_MESSAGE = "a removed entity must exist on the baseline";
const ADDED_ENTITY_MESSAGE = "an added entity must not exist on the baseline";
const CHANGED_ENTITY_MESSAGE = "a changed entity must exist on the baseline";
const REMOVED_FIELD_MESSAGE = "a removed field must exist";
const EMPTY_PATCH_MESSAGE = "patch must change a field";

function cloneData(value) {
  if (typeof value === "number") {
    return value === 0 ? 0 : value;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (!isPlainObject(value)) {
    throw new TypeError(VALUE_MESSAGE);
  }
  const result = {};
  const keys = sortedKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    writeOwn(result, keys[index], cloneData(readOwn(value, keys[index])));
  }
  return result;
}

function applyRecord(base, patch) {
  const result = {};
  const keys = unionKeys(base, patch);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const inBase = Object.hasOwn(base, key);
    const inPatch = Object.hasOwn(patch, key);
    if (!inPatch) {
      writeOwn(result, key, cloneData(readOwn(base, key)));
      continue;
    }
    const next = readOwn(patch, key);
    if (next === null) {
      if (!inBase) {
        throw new RangeError(REMOVED_FIELD_MESSAGE);
      }
      continue;
    }
    if (!inBase) {
      writeOwn(result, key, cloneData(next));
      continue;
    }
    const current = readOwn(base, key);
    if (isPlainObject(current) && isPlainObject(next)) {
      if (sortedKeys(next).length === 0) {
        throw new TypeError(EMPTY_PATCH_MESSAGE);
      }
      writeOwn(result, key, applyRecord(current, next));
      continue;
    }
    writeOwn(result, key, cloneData(next));
  }
  return result;
}

function assertApplies(entities, change) {
  for (let index = 0; index < change.removed.length; index += 1) {
    if (!Object.hasOwn(entities, change.removed[index])) {
      throw new RangeError(REMOVED_ENTITY_MESSAGE);
    }
  }
  const addedIds = sortedKeys(change.added);
  for (let index = 0; index < addedIds.length; index += 1) {
    if (Object.hasOwn(entities, addedIds[index])) {
      throw new RangeError(ADDED_ENTITY_MESSAGE);
    }
  }
  const changedIds = sortedKeys(change.changed);
  for (let index = 0; index < changedIds.length; index += 1) {
    if (!Object.hasOwn(entities, changedIds[index])) {
      throw new RangeError(CHANGED_ENTITY_MESSAGE);
    }
  }
}

export function applyDelta(baseline, delta) {
  const source = readSnapshot(baseline);
  const change = readDelta(delta);
  if (change.baseSequence !== source.sequence) {
    throw new BaselineMismatchError(change.baseSequence, source.sequence);
  }
  assertApplies(source.entities, change);
  const removed = new Set(change.removed);
  const ids = [];
  const sourceIds = sortedKeys(source.entities);
  for (let index = 0; index < sourceIds.length; index += 1) {
    if (!removed.has(sourceIds[index])) {
      ids.push(sourceIds[index]);
    }
  }
  const addedIds = sortedKeys(change.added);
  for (let index = 0; index < addedIds.length; index += 1) {
    ids.push(addedIds[index]);
  }
  ids.sort(compareKeys);
  const entities = {};
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (Object.hasOwn(change.added, id)) {
      writeOwn(entities, id, cloneData(readOwn(change.added, id)));
    } else if (Object.hasOwn(change.changed, id)) {
      writeOwn(
        entities,
        id,
        applyRecord(readOwn(source.entities, id), readOwn(change.changed, id))
      );
    } else {
      writeOwn(entities, id, cloneData(readOwn(source.entities, id)));
    }
  }
  return freezeDeep({
    sequence: change.sequence,
    entities
  });
}
