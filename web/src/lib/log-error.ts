/**
 * Error description helpers for log lines.
 *
 * These exist because most of the site's diagnostics live inside catch blocks
 * whose whole purpose is graceful degradation. A formatter that can throw turns
 * a handled failure into an unhandled one — a sibling repo shipped exactly that
 * and a 200-with-empty-result became a 502.
 *
 * So: **nothing in this file may throw, for any input.** `String(x)` alone is
 * not safe — it throws on null-prototype objects, on values with a throwing
 * `toString`, and on hostile proxies. Every conversion here is guarded, and the
 * fallbacks are plain literals.
 */

const UNREADABLE = "[unreadable]";

/** Best-effort string form of any value. Never throws. */
export function safeString(value: unknown): string {
  try {
    if (typeof value === "string") return value;
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "symbol") {
      // `${sym}` throws; String(sym) does not.
      return String(value);
    }
    if (typeof value === "bigint") return `${value}n`;
    // Object.create(null), { toString() { throw } } and hostile proxies all
    // land here and can throw out of String().
    const out = String(value);
    return typeof out === "string" ? out : UNREADABLE;
  } catch {
    return UNREADABLE;
  }
}

export interface ErrorInfo {
  errName: string;
  errMessage: string;
}

/**
 * `{ errName, errMessage }` for any thrown value — Error or otherwise.
 * Never throws.
 */
export function errorInfo(err: unknown): ErrorInfo {
  let isError = false;
  try {
    isError = err instanceof Error;
  } catch {
    // A proxy with a throwing getPrototypeOf trap.
    isError = false;
  }

  if (isError) {
    let errName = "Error";
    let errMessage = "";
    try {
      // .name / .message can be throwing getters.
      errName = safeString((err as Error).name) || "Error";
    } catch {
      errName = "Error";
    }
    try {
      errMessage = safeString((err as Error).message);
    } catch {
      errMessage = UNREADABLE;
    }
    return { errName, errMessage };
  }

  // typeof never throws, even on hostile proxies.
  return { errName: `NonError(${typeof err})`, errMessage: safeString(err) };
}

/** Stack trace when there is one, otherwise undefined. Never throws. */
export function errorStack(err: unknown): string | undefined {
  try {
    if (!(err instanceof Error)) return undefined;
    const stack = err.stack;
    return typeof stack === "string" ? stack : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `{ errName, errMessage, stack }` in one call, for the handful of sites that
 * want the stack too. Never throws.
 */
export function errorDetail(err: unknown): ErrorInfo & { stack?: string } {
  const info = errorInfo(err);
  const stack = errorStack(err);
  return stack ? { ...info, stack } : info;
}
