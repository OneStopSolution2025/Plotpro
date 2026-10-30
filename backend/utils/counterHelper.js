import { Counter } from "../models/Counter.js";

/**
 * Atomically increment a named counter and return the new sequence value.
 *
 * Uses findOneAndUpdate with $inc and upsert: true, which is atomic at the
 * document level. Safe under concurrent callers even with retryWrites=false.
 *
 * The sequence only ever increases. If the counter does not exist, it is
 * created and the first returned value is 1.
 *
 * @param {string} counterId - Name of the counter (e.g. "project:customId" or "plot:<projectId>")
 * @returns {Promise<number>} The next sequence value (>= 1)
 * @throws {Error} If counterId is not a non-empty string
 */
export const getNextSequence = async (counterId) => {
  if (!counterId || typeof counterId !== "string") {
    throw new Error("counterId must be a non-empty string");
  }

  const doc = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return doc.seq;
};

/**
 * Initialize a counter to a minimum sequence value without ever decreasing it.
 *
 * Idempotent: calling with the same or lower targetSeq on an existing counter
 * leaves it unchanged. Safe for concurrent initialization (an E11000 on the
 * unique _id is caught and the current value is returned).
 *
 * This is intended for one-time migration seeding, not for per-request use.
 *
 * @param {string} counterId - Name of the counter
 * @param {number} targetSeq - Desired minimum sequence value (counter will be at least this)
 * @returns {Promise<number>} The final sequence value after initialization
 * @throws {Error} If counterId is not a non-empty string or targetSeq is invalid
 */
export const initializeCounter = async (counterId, targetSeq = 0) => {
  if (!counterId || typeof counterId !== "string") {
    throw new Error("counterId must be a non-empty string");
  }
  if (!Number.isInteger(targetSeq) || targetSeq < 0) {
    throw new Error("targetSeq must be a non-negative integer");
  }

  try {
    // $max only raises seq if targetSeq is higher; upsert creates the counter
    // at targetSeq when it does not yet exist. setDefaultsOnInsert ensures the
    // schema default (0) is applied before $max compares.
    const doc = await Counter.findOneAndUpdate(
      { _id: counterId },
      { $max: { seq: targetSeq } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return doc.seq;
  } catch (err) {
    if (err.code === 11000) {
      // Concurrent initialization: another process created the counter first.
      // Read the current value and return the higher of the two.
      const existing = await Counter.findOne({ _id: counterId });
      return existing ? Math.max(existing.seq, targetSeq) : targetSeq;
    }
    throw err;
  }
};

/**
 * Determine whether an error is a duplicate-key (E11000) error on the
 * `customId` unique index. Used to decide whether a create/retry is safe.
 *
 * @param {Error} err - The error to inspect
 * @returns {boolean} True if the error is an E11000 on customId
 */
export const isCustomIdDuplicateError = (err) => {
  if (!err || err.code !== 11000) return false;
  const keyValue = err.keyValue || {};
  return Object.prototype.hasOwnProperty.call(keyValue, "customId");
};

/**
 * Execute a create function, retrying only on customId-specific E11000 errors.
 *
 * On each retry, the caller is expected to obtain a fresh sequence value from
 * the counter before attempting the create again, so gaps (not duplicates)
 * are the only side effect.
 *
 * @param {Function} fn - Async function that performs the create
 * @param {number} maxRetries - Maximum number of retry attempts (default 3)
 * @returns {Promise<*>} The result of fn
 * @throws {Error} The last error if retries are exhausted or the error is not customId-related
 */
export const withCustomIdRetry = async (fn, maxRetries = 3) => {
  let attempts = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!isCustomIdDuplicateError(err) || attempts >= maxRetries) throw err;
      attempts += 1;
    }
  }
};
