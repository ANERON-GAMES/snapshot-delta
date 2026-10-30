export function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    return false;
  }
  const names = Object.getOwnPropertyNames(value);
  for (let index = 0; index < names.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, names[index]);
    if (descriptor.enumerable !== true) {
      return false;
    }
    if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) {
      return false;
    }
  }
  return true;
}

export function readOwn(object, key) {
  return Object.getOwnPropertyDescriptor(object, key).value;
}

export function writeOwn(object, key, value) {
  Object.defineProperty(object, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}

export function compareKeys(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function sortedKeys(object) {
  return Object.keys(object).sort(compareKeys);
}

export function unionKeys(left, right) {
  const seen = new Set(Object.keys(left));
  const keys = Object.keys(left);
  for (const key of Object.keys(right)) {
    if (!seen.has(key)) {
      keys.push(key);
    }
  }
  keys.sort(compareKeys);
  return keys;
}

export function assertExactKeys(object, expected, message) {
  const keys = Object.keys(object);
  if (keys.length !== expected.length) {
    throw new TypeError(message);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (!Object.hasOwn(object, expected[index])) {
      throw new TypeError(message);
    }
  }
}

export function freezeDeep(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index += 1) {
    freezeDeep(readOwn(value, keys[index]));
  }
  return Object.freeze(value);
}
