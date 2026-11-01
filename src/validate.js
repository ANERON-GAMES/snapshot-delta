import { MAX_SEQUENCE } from "./constants.js";
import {
  assertExactKeys,
  compareKeys,
  isPlainObject,
  readOwn,
  sortedKeys,
  writeOwn
} from "./plain.js";

const SNAPSHOT_KEYS = ["sequence", "entities"];
const DELTA_KEYS = ["baseSequence", "sequence", "removed", "added", "changed"];

const SNAPSHOT_MESSAGE = "snapshot must be an object";
const SNAPSHOT_FIELDS_MESSAGE = "snapshot fields must be sequence and entities";
const SEQUENCE_MESSAGE = "sequence must be an integer from 0 to 9007199254740991";
const BASE_SEQUENCE_MESSAGE = "baseSequence must be an integer from 0 to 9007199254740991";
const ENTITIES_MESSAGE = "entities must be a plain object";
const ENTITY_ID_MESSAGE = "entity id must be a non-empty string";
const ENTITY_MESSAGE = "entity must be a plain object";
export const VALUE_MESSAGE =
  "value must be a finite number, a string, a boolean, or a plain object";
const CYCLE_MESSAGE = "value must not contain a circular reference";
const OPTIONS_MESSAGE = "options must be an object";
const TOLERANCE_TYPE_MESSAGE = "tolerance must be a plain object or a number";
const TOLERANCE_RANGE_MESSAGE = "tolerance must be a finite number greater than or equal to 0";
const TOLERANCE_CYCLE_MESSAGE = "tolerance must not contain a circular reference";
const DELTA_MESSAGE = "delta must be an object";
const DELTA_FIELDS_MESSAGE =
  "delta fields must be baseSequence, sequence, removed, added, and changed";
const REMOVED_MESSAGE = "removed must be an array";
const REMOVED_ID_MESSAGE = "removed entity id must be a non-empty string";
const REMOVED_ORDER_MESSAGE = "removed entity ids must be unique and in ascending order";
const ADDED_MESSAGE = "added must be a plain object";
const CHANGED_MESSAGE = "changed must be a plain object";
const DISJOINT_MESSAGE = "added, removed, and changed entity ids must be disjoint";
const PATCH_MESSAGE = "patch must be a plain object";
const PATCH_EMPTY_MESSAGE = "patch must not be empty";
const PATCH_VALUE_MESSAGE =
  "patch value must be null, a finite number, a string, a boolean, or a plain object";
const PATCH_CYCLE_MESSAGE = "patch must not contain a circular reference";

function readSequence(value, message) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_SEQUENCE) {
    throw new RangeError(message);
  }
  return value === 0 ? 0 : value;
}

function copyValue(value, seen) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(VALUE_MESSAGE);
    }
    return value === 0 ? 0 : value;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (!isPlainObject(value)) {
    throw new TypeError(VALUE_MESSAGE);
  }
  return copyRecord(value, seen);
}

function copyRecord(record, seen) {
  if (seen.has(record)) {
    throw new TypeError(CYCLE_MESSAGE);
  }
  seen.add(record);
  const result = {};
  const keys = sortedKeys(record);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    writeOwn(result, key, copyValue(readOwn(record, key), seen));
  }
  seen.delete(record);
  return result;
}

function copyEntities(entities) {
  const result = {};
  const ids = sortedKeys(entities);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id.length === 0) {
      throw new TypeError(ENTITY_ID_MESSAGE);
    }
    const entity = readOwn(entities, id);
    if (!isPlainObject(entity)) {
      throw new TypeError(ENTITY_MESSAGE);
    }
    writeOwn(result, id, copyRecord(entity, new Set()));
  }
  return result;
}

export function readSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw new TypeError(SNAPSHOT_MESSAGE);
  }
  assertExactKeys(snapshot, SNAPSHOT_KEYS, SNAPSHOT_FIELDS_MESSAGE);
  const sequence = readSequence(readOwn(snapshot, "sequence"), SEQUENCE_MESSAGE);
  const entities = readOwn(snapshot, "entities");
  if (!isPlainObject(entities)) {
    throw new TypeError(ENTITIES_MESSAGE);
  }
  return {
    sequence,
    entities: copyEntities(entities)
  };
}

function assertDenseArray(removed) {
  if (!Array.isArray(removed) || Object.getOwnPropertySymbols(removed).length !== 0) {
    throw new TypeError(REMOVED_MESSAGE);
  }
  const names = Object.getOwnPropertyNames(removed);
  if (names.length !== removed.length + 1 || !Object.hasOwn(removed, "length")) {
    throw new TypeError(REMOVED_MESSAGE);
  }
  for (let index = 0; index < removed.length; index += 1) {
    const key = String(index);
    if (!Object.hasOwn(removed, key)) {
      throw new TypeError(REMOVED_MESSAGE);
    }
    const descriptor = Object.getOwnPropertyDescriptor(removed, key);
    if (descriptor.enumerable !== true || Object.hasOwn(descriptor, "get")) {
      throw new TypeError(REMOVED_MESSAGE);
    }
  }
}

function readRemoved(removed) {
  assertDenseArray(removed);
  const result = [];
  let previous = null;
  for (let index = 0; index < removed.length; index += 1) {
    const id = removed[index];
    if (typeof id !== "string" || id.length === 0) {
      throw new TypeError(REMOVED_ID_MESSAGE);
    }
    if (previous !== null && compareKeys(previous, id) >= 0) {
      throw new TypeError(REMOVED_ORDER_MESSAGE);
    }
    result.push(id);
    previous = id;
  }
  return result;
}

function readAdded(added) {
  if (!isPlainObject(added)) {
    throw new TypeError(ADDED_MESSAGE);
  }
  const result = {};
  const ids = sortedKeys(added);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id.length === 0) {
      throw new TypeError(ENTITY_ID_MESSAGE);
    }
    const entity = readOwn(added, id);
    if (!isPlainObject(entity)) {
      throw new TypeError(ENTITY_MESSAGE);
    }
    writeOwn(result, id, copyRecord(entity, new Set()));
  }
  return result;
}

function copyPatchValue(value, seen) {
  if (value === null) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(PATCH_VALUE_MESSAGE);
    }
    return value === 0 ? 0 : value;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (!isPlainObject(value)) {
    throw new TypeError(PATCH_VALUE_MESSAGE);
  }
  if (sortedKeys(value).length === 0) {
    return {};
  }
  return copyPatch(value, seen);
}

function copyPatch(patch, seen) {
  if (!isPlainObject(patch)) {
    throw new TypeError(PATCH_MESSAGE);
  }
  const keys = sortedKeys(patch);
  if (keys.length === 0) {
    throw new TypeError(PATCH_EMPTY_MESSAGE);
  }
  if (seen.has(patch)) {
    throw new TypeError(PATCH_CYCLE_MESSAGE);
  }
  seen.add(patch);
  const result = {};
  for (let index = 0; index < keys.length; index += 1) {
    writeOwn(result, keys[index], copyPatchValue(readOwn(patch, keys[index]), seen));
  }
  seen.delete(patch);
  return result;
}

function readChanged(changed) {
  if (!isPlainObject(changed)) {
    throw new TypeError(CHANGED_MESSAGE);
  }
  const result = {};
  const ids = sortedKeys(changed);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id.length === 0) {
      throw new TypeError(ENTITY_ID_MESSAGE);
    }
    writeOwn(result, id, copyPatch(readOwn(changed, id), new Set()));
  }
  return result;
}

function assertDisjoint(removed, added, changed) {
  const seen = new Set(removed);
  const addedIds = Object.keys(added);
  for (let index = 0; index < addedIds.length; index += 1) {
    if (seen.has(addedIds[index])) {
      throw new TypeError(DISJOINT_MESSAGE);
    }
    seen.add(addedIds[index]);
  }
  const changedIds = Object.keys(changed);
  for (let index = 0; index < changedIds.length; index += 1) {
    if (seen.has(changedIds[index])) {
      throw new TypeError(DISJOINT_MESSAGE);
    }
  }
}

export function readDelta(delta) {
  if (!isPlainObject(delta)) {
    throw new TypeError(DELTA_MESSAGE);
  }
  assertExactKeys(delta, DELTA_KEYS, DELTA_FIELDS_MESSAGE);
  const baseSequence = readSequence(readOwn(delta, "baseSequence"), BASE_SEQUENCE_MESSAGE);
  const sequence = readSequence(readOwn(delta, "sequence"), SEQUENCE_MESSAGE);
  const removed = readRemoved(readOwn(delta, "removed"));
  const added = readAdded(readOwn(delta, "added"));
  const changed = readChanged(readOwn(delta, "changed"));
  assertDisjoint(removed, added, changed);
  return {
    baseSequence,
    sequence,
    removed,
    added,
    changed
  };
}

function copyTolerance(value, seen) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(TOLERANCE_RANGE_MESSAGE);
    }
    return value === 0 ? 0 : value;
  }
  if (!isPlainObject(value)) {
    throw new TypeError(TOLERANCE_TYPE_MESSAGE);
  }
  if (seen.has(value)) {
    throw new TypeError(TOLERANCE_CYCLE_MESSAGE);
  }
  seen.add(value);
  const result = {};
  const keys = sortedKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    writeOwn(result, key, copyTolerance(readOwn(value, key), seen));
  }
  seen.delete(value);
  return result;
}

export function readTolerance(options) {
  if (options === undefined) {
    return 0;
  }
  if (!isPlainObject(options)) {
    throw new TypeError(OPTIONS_MESSAGE);
  }
  if (!Object.hasOwn(options, "tolerance")) {
    return 0;
  }
  const tolerance = readOwn(options, "tolerance");
  if (tolerance === undefined) {
    return 0;
  }
  return copyTolerance(tolerance, new Set());
}
