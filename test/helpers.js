import { applyDelta } from "../src/index.js";

export function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return mixed >>> 0;
  };
}

export function record(entries) {
  const object = {};
  for (const [key, value] of entries) {
    Object.defineProperty(object, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  return object;
}

export function snapshot(sequence, entities) {
  return { sequence, entities };
}

export function canonical(value) {
  const sequence = value.sequence === 0 ? 0 : value.sequence;
  return applyDelta(value, {
    baseSequence: sequence,
    sequence,
    removed: [],
    added: {},
    changed: {}
  });
}

const IDS = ["Z", "a", "b", "m", "10", "2", "turret"];
const NAMES = ["a", "b", "hp", "x", "y", "name", "open", "pos"];
const WORDS = ["", "a", "Z", "door", "crate"];

function nextInt(random, limit) {
  return random() % limit;
}

function copyCanonical(value) {
  if (typeof value === "number") {
    return value === 0 ? 0 : value;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  const result = {};
  const keys = Object.keys(value).sort((left, right) => {
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  });
  for (const key of keys) {
    Object.defineProperty(result, key, {
      value: copyCanonical(value[key]),
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  return result;
}

function childTolerance(tolerance, key) {
  if (typeof tolerance === "number") {
    return tolerance;
  }
  if (!Object.hasOwn(tolerance, key)) {
    return 0;
  }
  return tolerance[key];
}

function expectValue(left, right, tolerance) {
  const leftObject = left !== null && typeof left === "object";
  const rightObject = right !== null && typeof right === "object";
  if (leftObject && rightObject) {
    return expectRecord(left, right, tolerance);
  }
  if (typeof left === "number" && typeof right === "number") {
    if (typeof tolerance !== "number") {
      throw new RangeError("tolerance must be a number for a numeric field");
    }
    if (Math.abs(left - right) <= tolerance) {
      return left === 0 ? 0 : left;
    }
    return right === 0 ? 0 : right;
  }
  if (typeof left === typeof right && left === right) {
    return right;
  }
  return copyCanonical(right);
}

function expectRecord(left, right, tolerance) {
  const keys = Object.keys(left).concat(
    Object.keys(right).filter((key) => !Object.hasOwn(left, key))
  );
  keys.sort((leftKey, rightKey) => {
    if (leftKey < rightKey) {
      return -1;
    }
    if (leftKey > rightKey) {
      return 1;
    }
    return 0;
  });
  const result = {};
  for (const key of keys) {
    const inLeft = Object.hasOwn(left, key);
    const inRight = Object.hasOwn(right, key);
    if (!inRight) {
      continue;
    }
    if (!inLeft) {
      Object.defineProperty(result, key, {
        value: copyCanonical(right[key]),
        writable: true,
        enumerable: true,
        configurable: true
      });
      continue;
    }
    Object.defineProperty(result, key, {
      value: expectValue(left[key], right[key], childTolerance(tolerance, key)),
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  return result;
}

export function expectedSnapshot(baseline, current, tolerance = 0) {
  const leftIds = Object.keys(baseline.entities).sort((left, right) => {
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  });
  const rightIds = Object.keys(current.entities).sort((left, right) => {
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  });
  const entities = {};
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftIds.length || rightIndex < rightIds.length) {
    const leftId = leftIndex < leftIds.length ? leftIds[leftIndex] : null;
    const rightId = rightIndex < rightIds.length ? rightIds[rightIndex] : null;
    if (rightId === null || (leftId !== null && leftId < rightId)) {
      leftIndex += 1;
    } else if (leftId === null || leftId > rightId) {
      Object.defineProperty(entities, rightId, {
        value: copyCanonical(current.entities[rightId]),
        writable: true,
        enumerable: true,
        configurable: true
      });
      rightIndex += 1;
    } else {
      Object.defineProperty(entities, leftId, {
        value: expectRecord(baseline.entities[leftId], current.entities[rightId], tolerance),
        writable: true,
        enumerable: true,
        configurable: true
      });
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return {
    sequence: current.sequence === 0 ? 0 : current.sequence,
    entities
  };
}

function randomValue(random, depth) {
  const kind = nextInt(random, depth < 2 ? 4 : 3);
  if (kind === 0) {
    return nextInt(random, 2) === 0;
  }
  if (kind === 1) {
    return WORDS[nextInt(random, WORDS.length)];
  }
  if (kind === 2) {
    const magnitude = nextInt(random, 20) / 4;
    if (magnitude === 0) {
      return nextInt(random, 2) === 0 ? -0 : 0;
    }
    return (nextInt(random, 2) === 0 ? -1 : 1) * magnitude;
  }
  return randomRecord(random, depth + 1);
}

function randomRecord(random, depth) {
  const result = {};
  const count = nextInt(random, 4);
  for (let index = 0; index < count; index += 1) {
    result[NAMES[nextInt(random, NAMES.length)]] = randomValue(random, depth);
  }
  return result;
}

export function randomSnapshot(random, sequence) {
  const entities = {};
  const count = nextInt(random, 5);
  for (let index = 0; index < count; index += 1) {
    entities[IDS[nextInt(random, IDS.length)]] = randomRecord(random, 0);
  }
  return { sequence, entities };
}
