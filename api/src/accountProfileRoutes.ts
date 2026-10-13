import type { Express, Request, RequestHandler, Response } from 'express';
import type { AuthenticatedUser } from './auth.js';
import { accountProfileResponse, accountProfileSchema } from './accountProfile.js';
import { AccountProfileUnavailableError, type AccountProfileRepository } from './accountProfileRepository.js';

export function registerAccountProfileRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; profiles: AccountProfileRepository;
}): void {
  const { authenticate, profiles } = dependencies;
  const path = '/users/me/profile';
  const owner = (request: Request) => (request as Request & { user: AuthenticatedUser }).user.id;
  const unavailable = (response: Response) => {
    // Do not pass provider exceptions to the generic logging/500 handler.
    response.status(503).json({ message: new AccountProfileUnavailableError().message });
  };

  app.get(path, authenticate, async (request, response) => {
    try { response.json(accountProfileResponse(await profiles.get(owner(request)))); }
    catch { unavailable(response); }
  });

  app.put(path, authenticate, async (request, response) => {
    const parsed = accountProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: parsed.error.issues.map(issue =>
        `${String(issue.path[0] ?? 'Profile')}: ${issue.message}`).join(' ') });
      return;
    }
    try {
      const stored = await profiles.save(owner(request), parsed.data);
      response.json(accountProfileResponse(stored));
    } catch { unavailable(response); }
  });
}
