export function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message ? message + ": " : ""}Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`
    );
  }
}

export function assertNotEqual(actual, unexpected, message) {
  if (actual === unexpected) {
    throw new Error(
      `${message ? message + ": " : ""}Expected value NOT to equal ${JSON.stringify(unexpected)}`
    );
  }
}

export function assertIncludes(container, item, message) {
  if (typeof container === "string") {
    if (!container.includes(item)) {
      throw new Error(
        `${message ? message + ": " : ""}Expected string to contain ${JSON.stringify(item)}, but got ${JSON.stringify(container.slice(0, 100))}`
      );
    }
  } else if (Array.isArray(container)) {
    if (!container.includes(item)) {
      throw new Error(
        `${message ? message + ": " : ""}Expected array to contain ${JSON.stringify(item)}`
      );
    }
  } else {
    throw new Error(`assertIncludes called on unsupported type: ${typeof container}`);
  }
}

export function assertApprox(actual, expected, tolerance = 2, message) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `${message ? message + ": " : ""}Expected ${actual} to be within ${tolerance} of ${expected} (diff: ${diff})`
    );
  }
}
