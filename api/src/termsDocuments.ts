/** Authoritative versions stamped by the API when a user explicitly accepts. */
export const TERMS_VERSIONS = { tos: 1, purchase: 1 } as const;
export type TermsDocumentId = keyof typeof TERMS_VERSIONS;
