# @aneron/snapshot-delta

Field-level delta encoding between entity state snapshots.

## Purpose

`@aneron/snapshot-delta` encodes the difference between two snapshots of entity state and applies that difference back onto the baseline. A snapshot has a sequence number and a map of entity id to a plain record. A record holds finite numbers, strings, booleans, and nested plain objects. `createDelta` lists the entities that were added, the entities that were removed, and the fields that changed. `applyDelta` applies that delta to the baseline snapshot and returns the current snapshot.

An optional numeric tolerance skips a change when both sides of a field are numbers and the absolute difference is within the tolerance. The delta stores the baseline sequence it was built from. `applyDelta` throws `BaselineMismatchError` when that sequence is not the sequence on the snapshot it is applied to.

The functions do not mutate their arguments. They clone every record they return and freeze the result. They do not read a clock, start a timer, draw a random number, or open a socket. The package has no runtime dependencies. The same inputs produce the same delta. `removed` is sorted in UTF-16 code unit order. Other keys are inserted in that order. A returned object then uses ordinary JavaScript enumeration: integer indices first, in numeric order, then the remaining keys in insertion order.

## Install

The package is an ES module. It needs Node.js 20 or newer. It has no runtime dependencies. The package name is `@aneron/snapshot-delta`. It is not published to the npm registry.

Clone this repository and run the tests:

```bash
git clone https://github.com/ANERON-GAMES/snapshot-delta.git
cd snapshot-delta
npm install
npm test
```

`npm test` runs `node --test`. `npm run lint` runs ESLint. `npm run format:check` runs Prettier.

Install it as a dependency from the git repository:

```bash
npm install github:ANERON-GAMES/snapshot-delta
```

```js
import { applyDelta, createDelta } from "@aneron/snapshot-delta";
```

Code in this repository imports the same entry point with `./src/index.js`.

## Usage

Sequence numbers below are integers chosen by the caller. The module does not treat them as timestamps.

`turret.y` changes from `2` to `9`. `crate` is removed. `door` is added. `turret.x` and `turret.name` are unchanged, so they are left out of the patch.

```js
import { applyDelta, BaselineMismatchError, createDelta } from "@aneron/snapshot-delta";

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
```

`delta.baseSequence` is `4`. `delta.sequence` is `5`. `delta.removed` is `["crate"]`. `delta.changed.turret` is `{ y: 9 }`. `delta.added.door.open` is `true`. `JSON.stringify(delta)` is `{"baseSequence":4,"sequence":5,"removed":["crate"],"added":{"door":{"open":true}},"changed":{"turret":{"y":9}}}`.

`restored.sequence` is `5`. `restored.entities.door.open` is `true`. `JSON.stringify(restored.entities)` is `{"door":{"open":true},"turret":{"name":"a","x":1,"y":9}}`. `baseline.entities.turret.y` is `2`. `baseline.entities.crate.hp` is `5`. `current.entities.turret.y` is `9`.

A nested object is patched field by field. A field that disappears becomes `null` in the patch. `null` is not a snapshot value. It is only the deletion marker inside `changed`.

```js
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
```

`nested.changed.pawn.alive` is `false`. `nested.changed.pawn.pos` is `{ y: 8, z: null }`. `JSON.stringify(nested.changed.pawn)` is `{"alive":false,"pos":{"y":8,"z":null}}`. `hp` and `pos.x` are unchanged, so they are omitted. Applying `nested` to `before` restores `pos` as `{ x: 1, y: 8 }`.

An entity that loses every field stays in the snapshot as an empty record. It is not listed in `removed`.

```js
const full = {
  sequence: 1,
  entities: {
    pawn: { hp: 1 }
  }
};
const emptyPawn = {
  sequence: 2,
  entities: {
    pawn: {}
  }
};
const cleared = createDelta(full, emptyPawn);
const kept = applyDelta(full, cleared);
```

`cleared.removed` is `[]`. `cleared.changed.pawn` is `{ hp: null }`. `Object.keys(kept.entities)` is `["pawn"]`. `JSON.stringify(kept.entities.pawn)` is `{}`.

Tolerance is absolute and inclusive. A per-field map skips `x` when `|1.5 - 1| <= 0.5` and still reports `y`. A single number applies to every numeric field. A difference of exactly the tolerance is skipped. A larger difference is kept.

```js
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
```

`coarse.changed.ship` is `{ y: 2.5 }`. `applied.entities.ship.x` is `1`. `applied.entities.ship.y` is `2.5`. `skipped.removed` is `[]`. `skipped.added` is `{}`. `skipped.changed` is `{}`. `quiet.entities.ship.x` is `1`. `quiet.entities.ship.y` is `2`. `quiet.sequence` is `8`. `past.changed.ship` is `{ x: 0.5 }`.

`removed` is sorted by UTF-16 code unit, not by locale and not as numbers. `"Z"` stands before `"a"`. `"10"` stands before `"2"`. An object cannot store that order for integer indices. `"2"` and `"10"` are integer indices, so a map that contains both enumerates `"2"` first.

```js
const ordered = createDelta(
  { sequence: 1, entities: { a: { n: 1 }, Z: { n: 1 }, m: { n: 1 } } },
  { sequence: 2, entities: { m: { n: 1 } } }
);
const numeric = createDelta(
  { sequence: 1, entities: { 10: { n: 1 }, 2: { n: 1 } } },
  { sequence: 2, entities: {} }
);
```

`ordered.removed` is `["Z", "a"]`. `numeric.removed` is `["10", "2"]`.

```js
const indexed = createDelta(
  { sequence: 1, entities: {} },
  {
    sequence: 2,
    entities: { 10: { n: 1 }, 2: { n: 1 }, a: { n: 1 }, Z: { n: 1 } }
  }
);
```

`Object.keys(indexed.added)` is `["2", "10", "Z", "a"]`. `indexed.removed` is `[]`.

The sequence check runs after the delta's shape is validated and before any entity is matched. A delta built from sequence `4` does not apply to sequence `3`, even when the entity map would also fail.

```js
const other = { sequence: 3, entities: {} };
let error = null;
try {
  applyDelta(other, delta);
} catch (caught) {
  error = caught;
}
```

`error` is a `BaselineMismatchError`. `error.message` is `"delta baseSequence does not match the baseline sequence"`. `error.baseSequence` is `4`. `error.sequence` is `3`. `error instanceof BaselineMismatchError` is `true`.

## API

`createDelta` and `applyDelta` are deterministic. They do not read the clock, the network, or the filesystem. They do not mutate their arguments. Each call returns a new frozen value. Two calls with the same inputs are deep-equal and are not the same reference.

`sequence` is an integer from `0` through `MAX_SEQUENCE` (`9007199254740991`). The module does not require the current sequence to be larger than the baseline sequence. Equal sequences are allowed. `-0` is stored as `0`.

`removed` is sorted by UTF-16 code unit order, the same order as `left < right` on strings. Input key order is not significant. `"Z"` is before `"a"`. `"10"` is before `"2"` in that array. Returned objects are filled in that same order, and then enumerated as ordinary objects. Integer indices come out in numeric order, so `"2"` is before `"10"` in `Object.keys`. Every other key stays in the UTF-16 insertion order.

Returned values never contain `-0`. A numeric field whose only difference is `-0` versus `0` is unchanged. `JSON.parse(JSON.stringify(delta))` is a valid delta. `JSON.parse(JSON.stringify(snapshot))` is a valid snapshot.

### Constants

| Export         | Value              |
| -------------- | ------------------ |
| `MAX_SEQUENCE` | `9007199254740991` |

`MAX_SEQUENCE` is `Number.MAX_SAFE_INTEGER`.

### `BaselineMismatchError`

`BaselineMismatchError` extends `Error`. `applyDelta` throws it when `delta.baseSequence !== snapshot.sequence` after both values have been normalized (`-0` is `0`).

| Field          | Meaning                                                   |
| -------------- | --------------------------------------------------------- |
| `name`         | `"BaselineMismatchError"`                                 |
| `message`      | `delta baseSequence does not match the baseline sequence` |
| `baseSequence` | The sequence stored on the delta.                         |
| `sequence`     | The sequence stored on the snapshot.                      |

The check is the sequence numbers only. It does not compare entity ids. A malformed delta throws `TypeError` or `RangeError` before this check.

### Snapshot

The object passed to `createDelta` and the baseline passed to `applyDelta`.

| Field      | Type   | Meaning                                                              |
| ---------- | ------ | -------------------------------------------------------------------- |
| `sequence` | number | An integer from `0` through `9007199254740991`. `-0` is read as `0`. |
| `entities` | object | Map of entity id to a record. Empty is valid.                        |

A snapshot has exactly those two own fields. Any other own field throws. `null`, an array, a function, and a class instance throw `snapshot must be an object`. A frozen snapshot and a snapshot with a null prototype are accepted.

An entity id is a non-empty string. `""` throws. `"__proto__"`, `"constructor"`, and `"toString"` are ordinary ids. They are copied with property definition, not with assignment. Ids are not parsed as numbers. The id `"10"` is not the id `"2"`.

A record is a plain object. Plain means the prototype is `Object.prototype` or `null`, every own property is an enumerable data property, and there are no symbol properties. An accessor, a non-enumerable property, an array, a `Date`, a `Map`, or a class instance is not a record. An empty record `{}` is valid.

A field value is a finite number, a string, a boolean, or a nested plain object under the same rules. `null`, `undefined`, `NaN`, `Infinity`, bigint, a function, and an array throw. Nested objects may form a directed acyclic graph. A cycle throws. The graph is copied into a tree, so a shared child becomes two independent copies in the result.

Entity ids are validated in UTF-16 code unit order. Fields inside a record are validated in that same order. The first failure wins. `createDelta` validates the baseline snapshot, then the current snapshot, then the options.

### Delta

The object returned by `createDelta` and the delta passed to `applyDelta`.

| Field          | Type   | Meaning                                                                   |
| -------------- | ------ | ------------------------------------------------------------------------- |
| `baseSequence` | number | Sequence of the baseline the delta was built from.                        |
| `sequence`     | number | Sequence of the current snapshot. This becomes the result sequence.       |
| `removed`      | array  | Entity ids that were in the baseline and are not in the current snapshot. |
| `added`        | object | Full records for entity ids that are only in the current snapshot.        |
| `changed`      | object | Field patches for entity ids that exist on both sides and are not equal.  |

A delta has exactly those five own fields. `removed`, `added`, and `changed` are pairwise disjoint. An id cannot be removed and added in the same delta. An entity that stays, including an entity whose record becomes `{}`, is updated through `changed` or omitted when nothing changed.

`removed` is a dense array of unique non-empty strings in ascending UTF-16 order. A hole, an extra own property, a symbol property, or an accessor element throws. On input, `added` and `changed` key order does not matter. On output, those keys are sorted.

A value in `added` follows the snapshot record rules. It contains no `null`.

A value in `changed` is a non-empty field patch:

| Patch value                                                               | Meaning                                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `null`                                                                    | Delete that field. The field must exist when the patch is applied to an object.                    |
| number, string, or boolean                                                | Replace that field. `-0` is stored as `0`.                                                         |
| plain object, when the baseline field is also a plain object              | A nested patch. Only the listed fields change.                                                     |
| plain object, when the baseline field is missing or is not a plain object | The full new record, copied as data. `null` inside it throws.                                      |
| `{}` as data                                                              | A new empty record. Valid when the baseline field is not a plain object, or when the field is new. |
| `{}` as a nested patch                                                    | Throws `patch must change a field` when the baseline field is a plain object.                      |

An empty object at the root of `changed[id]` throws `patch must not be empty`. A nested empty object is accepted by the structural check and is interpreted during `applyDelta`.

`changed` does not replace an entity id. To drop an id, list it in `removed`. To add an id, put the full record in `added`.

### `createDelta(baseline, current, options)`

Build a delta from `baseline` to `current`.

`options` may be omitted. `undefined` is the same as omitting it. It must be a plain object. Any other value throws `TypeError` with the message `options must be an object`. Unknown own fields are ignored. A frozen options object and an options object with a null prototype are accepted.

| Field       | Default | Accepted values                                                                                                                                |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `tolerance` | `0`     | A finite number greater than or equal to `0`, or a plain object of the same shape. Omitted and `undefined` both mean `0`. `-0` is read as `0`. |

`0` compares numbers exactly (`-0` and `0` are equal). A positive number is the absolute tolerance for every numeric field at every depth. A plain object is a per-field map. A number at a key is the tolerance for that field when both values are numbers. When both values are plain objects and the tolerance at that key is a number, that number applies to every numeric field under that object. When the tolerance at that key is an object, the walk continues with that object. A missing key means `0`.

Tolerance is consulted only when both sides of a field are numbers. The comparison is `Math.abs(current - baseline) <= tolerance`. The bound is inclusive. A skipped field is omitted from the patch, and `applyDelta` keeps the baseline number. A field that is added, removed, or changed to a different type is never skipped. Added and removed entities are never skipped. Strings and booleans use `===` and ignore tolerance.

If both values are numbers and the tolerance node at that field is a plain object, `createDelta` throws `RangeError` with the message `tolerance must be a number for a numeric field`. This includes the case where the two numbers are equal. The throw happens while the records are compared, after both snapshots and the tolerance shape have been validated.

The return value is a frozen delta. Nested records, the `removed` array, `added`, and `changed` are frozen. The input snapshots and the options object are not frozen and are not mutated.

An entity is omitted from `changed` when every field is unchanged. A nested patch object is omitted when every nested field is unchanged. Equal records with different key insertion order produce an empty change for that entity.

### `applyDelta(baseline, delta)`

Return the snapshot produced by applying `delta` to `baseline`.

Checks run in this order. The first failure wins. A throw returns no snapshot and leaves the arguments unchanged.

1. `baseline` is a snapshot.
2. `delta` is a delta. Inside that step the order is `baseSequence`, `sequence`, `removed`, `added`, `changed`, then the disjoint-id check.
3. `delta.baseSequence` equals `baseline.sequence`. Otherwise `BaselineMismatchError`.
4. Every id in `removed` exists on the baseline. Then every id in `added` is absent. Then every id in `changed` exists. Ids are checked in UTF-16 code unit order inside each list.
5. Patches are applied. Entities are visited in UTF-16 code unit order. The first patch failure wins.

The result is a new frozen snapshot. `sequence` is `delta.sequence`. `entities` contains the baseline entities, minus `removed`, plus `added`, with `changed` patches merged in. Keys are sorted. Unchanged entities are copied. They are not the same references as the baseline records.

Applying a delta with empty `removed`, empty `added`, and empty `changed` copies the baseline into canonical form: sorted keys, `-0` written as `0`, and the delta's sequence.

A field patch is applied as follows.

1. A key missing from the patch is copied from the baseline.
2. `null` deletes a key that exists. A `null` for a missing key throws `RangeError` with the message `a removed field must exist`.
3. A plain object paired with a baseline plain object is a nested patch. An empty object in that position throws `TypeError` with the message `patch must change a field`.
4. Any other patch value replaces the field. The replacement is copied. A `null` anywhere inside a replacement throws `TypeError` with the message `value must be a finite number, a string, a boolean, or a plain object`.

`applyDelta` does not freeze the caller's delta. It copies records out of it before freezing the result.

### Errors

`BaselineMismatchError` means the delta was built from a different baseline sequence.

`TypeError` means a value had the wrong shape.

`RangeError` means a sequence was out of range, a tolerance number was out of range, or a delta named an entity or a field the baseline does not have.

| Message                                                                             | Error                   | Cause                                                                              |
| ----------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `snapshot must be an object`                                                        | `TypeError`             | `null`, an array, a function, or any value that is not a plain object.             |
| `snapshot fields must be sequence and entities`                                     | `TypeError`             | A field is missing or an extra own field is present.                               |
| `sequence must be an integer from 0 to 9007199254740991`                            | `RangeError`            | `sequence` is missing a finite integer in that range, on a snapshot or on a delta. |
| `entities must be a plain object`                                                   | `TypeError`             | `entities` is not a plain object.                                                  |
| `entity id must be a non-empty string`                                              | `TypeError`             | An id in `entities`, `added`, or `changed` is `""`.                                |
| `entity must be a plain object`                                                     | `TypeError`             | An entity record is not a plain object.                                            |
| `value must be a finite number, a string, a boolean, or a plain object`             | `TypeError`             | A snapshot field is not one of those, or a replacement value contains `null`.      |
| `value must not contain a circular reference`                                       | `TypeError`             | A record reaches itself through its fields.                                        |
| `options must be an object`                                                         | `TypeError`             | `options` is not a plain object.                                                   |
| `tolerance must be a plain object or a number`                                      | `TypeError`             | A tolerance node is not a number and not a plain object.                           |
| `tolerance must be a finite number greater than or equal to 0`                      | `RangeError`            | A tolerance number is `NaN`, infinite, or negative.                                |
| `tolerance must not contain a circular reference`                                   | `TypeError`             | A tolerance object reaches itself.                                                 |
| `tolerance must be a number for a numeric field`                                    | `RangeError`            | Both sides of a field are numbers and the tolerance node is an object.             |
| `delta must be an object`                                                           | `TypeError`             | `delta` is not a plain object.                                                     |
| `delta fields must be baseSequence, sequence, removed, added, and changed`          | `TypeError`             | A field is missing or an extra own field is present.                               |
| `baseSequence must be an integer from 0 to 9007199254740991`                        | `RangeError`            | `baseSequence` is outside that range.                                              |
| `removed must be an array`                                                          | `TypeError`             | `removed` is not a dense array of data elements.                                   |
| `removed entity id must be a non-empty string`                                      | `TypeError`             | A `removed` element is empty or not a string.                                      |
| `removed entity ids must be unique and in ascending order`                          | `TypeError`             | `removed` repeats an id or is not sorted.                                          |
| `added must be a plain object`                                                      | `TypeError`             | `added` is not a plain object.                                                     |
| `changed must be a plain object`                                                    | `TypeError`             | `changed` is not a plain object.                                                   |
| `added, removed, and changed entity ids must be disjoint`                           | `TypeError`             | The same id appears in two of those sets.                                          |
| `patch must be a plain object`                                                      | `TypeError`             | `changed[id]` is not a plain object.                                               |
| `patch must not be empty`                                                           | `TypeError`             | `changed[id]` has no fields.                                                       |
| `patch value must be null, a finite number, a string, a boolean, or a plain object` | `TypeError`             | A patch field is not one of those.                                                 |
| `patch must not contain a circular reference`                                       | `TypeError`             | A patch reaches itself.                                                            |
| `delta baseSequence does not match the baseline sequence`                           | `BaselineMismatchError` | The delta was built from a different sequence.                                     |
| `a removed entity must exist on the baseline`                                       | `RangeError`            | `removed` names an id the baseline does not have.                                  |
| `an added entity must not exist on the baseline`                                    | `RangeError`            | `added` names an id the baseline already has.                                      |
| `a changed entity must exist on the baseline`                                       | `RangeError`            | `changed` names an id the baseline does not have.                                  |
| `a removed field must exist`                                                        | `RangeError`            | A patch `null` names a field the baseline record does not have.                    |
| `patch must change a field`                                                         | `TypeError`             | An empty object is merged into a plain object.                                     |

## Design

A snapshot is a value. `createDelta` reads it and returns a frozen delta. `applyDelta` reads a snapshot and a delta and returns a frozen snapshot. The previous objects stay in the state the caller left them, including unfrozen. A caller can keep every step. Editing a record after the call returns does not change a delta or a snapshot this module already returned.

The sequence number is the caller's label for a snapshot. It is not a clock and it does not wrap. The module does not sort snapshots by sequence and does not refuse a current sequence that is smaller than the baseline. The only sequence rule on apply is equality of `baseSequence` and the baseline `sequence`. That comparison happens after the delta shape is valid and before any entity id is looked up, so a wrong baseline fails the same way whether or not the entity maps would have matched.

`null` inside `changed` means the field is gone. Snapshot records cannot store `null`, so a deletion marker cannot be confused with a stored value. Removing an entity and removing a field are different operations. An id in `removed` drops the whole record. A `null` in a patch drops one field and leaves the entity. If the last field is dropped, the entity remains and its record is `{}`.

When both sides of a field are plain objects, the delta lists only the nested fields that changed. `applyDelta` copies the other nested fields from the baseline. That is a merge, not a replacement of the object. When the types differ, or when the field is new, the patch carries the whole new value and `applyDelta` replaces the field. An empty object is a real record. Merging an empty object into an existing object would report a change and then change nothing, so that patch is rejected.

Tolerance exists so a float that moved by less than the caller cares about does not produce a field. The test is absolute, not a fraction of the magnitude. `0.5` is within tolerance `0.5`. `0.5` is not within tolerance `0.25`. The value written by apply is the baseline number, not the current number and not a rounded number. A later exact `createDelta` from the baseline to that result contains the same changes as the tolerant delta. Tolerance does not apply to a field that exists on only one side, and it does not apply to strings or booleans. A numeric string is still a string.

`removed` is sorted so its JSON text depends on the ids and not on which entity was seen first. The sort is code-unit order. It is not `localeCompare`. Uppercase Latin letters stand before lowercase letters. Digit characters are compared one unit at a time, so `"10"` is before `"2"` in `removed`. Object keys are inserted in that order. `JSON.stringify` then follows ordinary enumeration, so integer indices still come out in numeric order. A map of `"2"`, `"10"`, `"Z"`, and `"a"` stringifies with `"2"` first. The text is still determined by the data alone.

Ids and field names are stored as own properties, including the names `"__proto__"`, `"constructor"`, and `"toString"`. Writes go through `Object.defineProperty`, so those names do not change the prototype of the object this module builds. The result's prototype is `Object.prototype`.

Each call keeps its state on the stack. The module has no mutable shared state. Payload records are cloned, so a later edit to the caller's object is not visible in the frozen result. A child object that was shared by two parents in the input is copied twice.

The same inputs produce the same results. `createDelta` and `applyDelta` do not read `Date`, a monotonic clock, a timer, or a random source.

## License

MIT. Copyright (c) 2026 Vadim Gubin. See [LICENSE](LICENSE).
