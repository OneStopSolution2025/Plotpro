import mongoose from "mongoose";

/**
 * Counter — atomic sequence store for PlotPro customId generation.
 *
 * Each document holds a named counter (_id) and its current sequence value (seq).
 * Increments are performed with MongoDB's atomic findOneAndUpdate($inc),
 * which is safe under concurrency even with retryWrites=false (single-document
 * atomic operation, no transaction required).
 *
 * Counter IDs used by PlotPro:
 *   - "project:customId"          -> global Project customId sequence
 *   - "plot:<projectId>"          -> per-project Plot customId suffix sequence
 *
 * The sequence never decreases: initialization only raises the floor.
 * Deleted IDs are never reused because $inc only ever moves forward.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    seq: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: false,
  }
);

// seq index helps when scanning / debugging counter state
counterSchema.index({ seq: 1 });

export const Counter = mongoose.model("Counter", counterSchema);
export default Counter;
