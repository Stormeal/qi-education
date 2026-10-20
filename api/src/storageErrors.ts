// Driver failures can be wrapped by repositories; do not expose connection details.
export function isMongoConnectionError(error: unknown): boolean {
  const names = new Set(['MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoNotConnectedError']);
  const seen = new Set<unknown>();
  let cause = error;
  while (cause && typeof cause === 'object' && !seen.has(cause)) {
    seen.add(cause);
    if ('name' in cause && typeof cause.name === 'string' && names.has(cause.name)) return true;
    cause = 'cause' in cause ? cause.cause : undefined;
  }
  return false;
}
