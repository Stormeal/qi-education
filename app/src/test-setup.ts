// No frontend test may reach a network. Without a local API the app falls back to the hosted
// API for reads, so an unstubbed request in a test became a real call to the live service.
// A spec that needs a reply stubs `ApiClientService.fetch` or `fetch` itself.
globalThis.fetch = (input: RequestInfo | URL) =>
  Promise.reject(new TypeError(`Test reached the network: ${typeof input === 'string' ? input : input instanceof URL ? input.href : input.url}`));
