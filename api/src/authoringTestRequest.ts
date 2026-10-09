/** Existing authorization/lifecycle fixtures save a freshly loaded snapshot.
 * Concurrency regressions in courseSave.test.ts deliberately use raw fetch and
 * captured old revisions, so this helper never masks a stale-edit assertion.
 */
export async function freshAuthoringFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const match = url.pathname.match(/^(.*\/courses\/[^/]+)(?:\/content)?$/);
  if (init?.method === 'PATCH' && match) {
    const headers = new Headers(init.headers);
    if (headers.has('authorization') && !headers.has('X-Course-Revision')) {
      const loaded = await fetch(`${url.origin}${match[1]}/content?view=author`, { headers: { authorization: headers.get('authorization')! } });
      const body = await loaded.json();
      if (body.review) headers.set('X-Course-Revision', JSON.stringify({ version: body.review.version, revisionId: body.review.revisionId }));
      return fetch(input, { ...init, headers });
    }
  }
  return fetch(input, init);
}
