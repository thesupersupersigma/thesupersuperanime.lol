/**
 * These helpers run inside graceful-degradation catch blocks, so the contract
 * under test is "never throws, for any input" — a formatter that throws turns a
 * handled failure into an unhandled one.
 *
 * Every case below is a value that makes plain `String(x)` or plain property
 * access throw.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { errorDetail, errorInfo, errorStack, safeString } from "./log-error.ts";

/** Every hostile shape we can construct, plus the mundane ones. */
function hostileValues(): unknown[] {
  const nullProto = Object.create(null) as object;

  const throwingToString = {
    toString() {
      throw new Error("toString exploded");
    },
  };

  const throwingValueOf = {
    valueOf() {
      throw new Error("valueOf exploded");
    },
    [Symbol.toPrimitive]() {
      throw new Error("toPrimitive exploded");
    },
  };

  const hostileProxy = new Proxy(
    {},
    {
      get() {
        throw new Error("get trap exploded");
      },
      getPrototypeOf() {
        throw new Error("getPrototypeOf trap exploded");
      },
      has() {
        throw new Error("has trap exploded");
      },
    },
  );

  const circular: Record<string, unknown> = {};
  circular.self = circular;

  const errorWithThrowingMessage = new Error("placeholder");
  Object.defineProperty(errorWithThrowingMessage, "message", {
    get() {
      throw new Error("message getter exploded");
    },
  });

  const errorWithThrowingName = new Error("fine");
  Object.defineProperty(errorWithThrowingName, "name", {
    get() {
      throw new Error("name getter exploded");
    },
  });

  const errorWithThrowingStack = new Error("fine");
  Object.defineProperty(errorWithThrowingStack, "stack", {
    get() {
      throw new Error("stack getter exploded");
    },
  });

  const errorWithObjectMessage = new Error("x");
  Object.defineProperty(errorWithObjectMessage, "message", { value: nullProto });

  return [
    nullProto,
    throwingToString,
    throwingValueOf,
    hostileProxy,
    circular,
    errorWithThrowingMessage,
    errorWithThrowingName,
    errorWithThrowingStack,
    errorWithObjectMessage,
    Symbol("sneaky"),
    // BigInt(10) rather than a 10n literal — tsconfig targets ES2017.
    BigInt(10),
    undefined,
    null,
    NaN,
    Infinity,
    "",
    0,
    false,
    [],
    [1, 2, 3],
    () => {},
    new Error("ordinary"),
    new TypeError("typed"),
    { code: "P2002" },
    Promise.resolve(),
    new Map(),
  ];
}

test("baseline: these shapes really do break String()", () => {
  // Guards the guard — if a future runtime stops throwing here, the tests below
  // would pass vacuously.
  assert.throws(() => String(Object.create(null) as object));
  assert.throws(() =>
    String({
      toString() {
        throw new Error("boom");
      },
    }),
  );
});

test("safeString never throws", () => {
  // NB: the label is the INDEX, not a rendering of the value. Calling
  // Object.prototype.toString on the hostile proxy fires its get trap and
  // throws -- the exact failure mode this module exists to prevent.
  hostileValues().forEach((value, i) => {
    let out: string;
    assert.doesNotThrow(() => {
      out = safeString(value);
    }, `safeString threw on hostileValues()[${i}] (typeof ${typeof value})`);
    assert.equal(typeof out!, "string");
  });
});

test("errorInfo never throws and always returns two strings", () => {
  hostileValues().forEach((value, i) => {
    let info: ReturnType<typeof errorInfo>;
    assert.doesNotThrow(() => {
      info = errorInfo(value);
    }, `errorInfo threw on hostileValues()[${i}] (typeof ${typeof value})`);
    assert.equal(typeof info!.errName, "string");
    assert.equal(typeof info!.errMessage, "string");
    assert.ok(info!.errName.length > 0, "errName must never be empty");
  });
});

test("errorStack and errorDetail never throw", () => {
  hostileValues().forEach((value, i) => {
    assert.doesNotThrow(() => errorStack(value), `errorStack threw on hostileValues()[${i}]`);
    assert.doesNotThrow(() => errorDetail(value), `errorDetail threw on hostileValues()[${i}]`);
  });
});

test("the formatted output is still useful for ordinary errors", () => {
  const info = errorInfo(new TypeError("bad input"));
  assert.equal(info.errName, "TypeError");
  assert.equal(info.errMessage, "bad input");

  const detail = errorDetail(new Error("with stack"));
  assert.equal(detail.errName, "Error");
  assert.ok(detail.stack?.includes("with stack"), "stack should be captured for real errors");
});

test("AbortError/TimeoutError stay distinguishable — the reason this exists", () => {
  // /api/source needs "timed out" and "upstream 502" to look different in logs.
  const timeout = new Error("The operation was aborted due to timeout");
  timeout.name = "TimeoutError";
  assert.equal(errorInfo(timeout).errName, "TimeoutError");

  const abort = new Error("This operation was aborted");
  abort.name = "AbortError";
  assert.equal(errorInfo(abort).errName, "AbortError");
});

test("non-Error throwables are labelled by type, not silently blanked", () => {
  assert.equal(errorInfo("just a string").errName, "NonError(string)");
  assert.equal(errorInfo("just a string").errMessage, "just a string");
  assert.equal(errorInfo(undefined).errName, "NonError(undefined)");
  assert.equal(errorInfo({ code: "P2002" }).errName, "NonError(object)");
  assert.equal(errorInfo(null).errMessage, "null");
});

test("stack is omitted rather than faked for non-Errors", () => {
  assert.equal(errorStack("nope"), undefined);
  assert.equal(errorStack({ stack: "fake stack" }), undefined);
  assert.equal("stack" in errorDetail("nope"), false);
});
