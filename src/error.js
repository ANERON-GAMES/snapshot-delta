const MESSAGE = "delta baseSequence does not match the baseline sequence";

export class BaselineMismatchError extends Error {
  constructor(baseSequence, sequence) {
    super(MESSAGE);
    this.name = "BaselineMismatchError";
    this.baseSequence = baseSequence;
    this.sequence = sequence;
  }
}
