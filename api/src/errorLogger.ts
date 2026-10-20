// Allowlisted diagnostics only: never serialize an exception, its message, or causes.
const classes = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'TimeoutError', 'AbortError',
  'MongoServerSelectionError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoNotConnectedError',
  'MongoServerError', 'APIError', 'APIConnectionError', 'AuthenticationError', 'RateLimitError', 'MailRefused']);
const codes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'unauthorized', 'unknown', 'missing_parameter', 'invalid_parameter', 'duplicate_parameter',
  'method_not_allowed', 'out_of_range', 'bad_request', 'not_enough_credits']);
const contextKeys = new Set(['courseId', 'componentId', 'assetId', 'uploadId', 'careerId', 'status']);
function field(error: unknown, key: string): unknown {
  // Reading data descriptors avoids invoking provider getters or toJSON hooks.
  try {
    let object = error;
    for (let depth = 0; object && typeof object === 'object' && depth < 8; depth++) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (descriptor) return 'value' in descriptor ? descriptor.value : undefined;
      object = Object.getPrototypeOf(object);
    }
  } catch { /* Even an unusual thrown value must not break error handling. */ }
}
export function logError(operation: string, error: unknown, context: Record<string, unknown> = {}, level: 'error' | 'warn' = 'error'): void {
  const name = field(error, 'name'), code = field(error, 'code');
  const diagnostic: Record<string, string | number> = { errorClass: typeof name === 'string' && classes.has(name) ? name : 'Error' };
  if ((typeof code === 'string' && codes.has(code)) || (typeof code === 'number' && Number.isSafeInteger(code) && code >= 0 && code <= 999999)) diagnostic.errorCode = code;
  for (const [key, value] of Object.entries(context)) {
    if (contextKeys.has(key) && ((typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)) || (typeof value === 'number' && Number.isSafeInteger(value)))) diagnostic[key] = value;
  }
  console[level](operation, diagnostic);
}
