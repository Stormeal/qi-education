import type { Express, Request, RequestHandler, Response } from 'express';
import { z, ZodError } from 'zod';
import type { AuthenticatedUser } from './auth.js';
import { getCorsOrigins } from './config.js';
import { billingSetupSchema } from './organizationBilling.js';
import { OrganizationError } from './organization.js';
import { BillingSignatureError, type OrganizationBillingService } from './organizationBillingService.js';
import type { OrganizationService } from './organizationService.js';

function returnUrl(value: string): string {
  const url = new URL(value);
  if (!getCorsOrigins().includes(url.origin) || url.username || url.password) throw new OrganizationError(400, 'Invalid return URL');
  return url.href;
}
function cardReturn(value: string, success: boolean) {
  const url = new URL(value); url.searchParams.delete('session_id');
  url.searchParams.set('billing', success ? 'card' : 'cancelled');
  if (success) url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
  return url.href.replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}');
}
export function registerOrganizationBillingRoutes(app: Express, authenticate: RequestHandler, requireAdmin: RequestHandler, service: OrganizationService) {
  const userId = (r: Request) => (r as Request & { user: AuthenticatedUser }).user.id;
  const orgId = (r: Request) => String(r.params.id);
  const handle = (operation: (r: Request, s: Response) => Promise<unknown>): RequestHandler => async (r, s) => {
    try { await operation(r, s); }
    catch (error) {
      if (error instanceof OrganizationError) s.status(error.status).json({ message: error.message });
      else if (error instanceof ZodError) s.status(400).json({ message: 'Invalid request body' });
      else s.status(503).json({ message: 'Billing is temporarily unavailable.' });
    }
  };
  app.get('/organizations/:id/billing', authenticate, handle(async (r, s) => s.json(await service.getBilling(userId(r), orgId(r)))));
  app.post('/organizations/:id/billing/setup', authenticate, handle(async (r, s) => {
    const input = billingSetupSchema.parse(r.body);
    const target = input.method === 'card' ? returnUrl(input.returnUrl) : null;
    s.json(await service.setupBilling(userId(r), orgId(r), input.method, input.address,
      target ? { success: cardReturn(target, true), cancel: cardReturn(target, false) } : undefined));
  }));
  app.post('/organizations/:id/billing/card/confirm', authenticate, handle(async (r, s) =>
    s.json(await service.confirmBillingCard(userId(r), orgId(r), z.object({ sessionId: z.string().min(1).max(255) }).parse(r.body).sessionId))));
  app.put('/organizations/:id/billing/cancellation', authenticate, handle(async (r, s) =>
    s.json(await service.cancelBilling(userId(r), orgId(r), z.object({ cancel: z.boolean() }).parse(r.body).cancel))));
  app.post('/organizations/:id/billing/portal', authenticate, handle(async (r, s) =>
    s.json(await service.billingPortal(userId(r), orgId(r), returnUrl(z.object({ returnUrl: z.url() }).parse(r.body).returnUrl)))));
  app.put('/admin/organizations/:id/billing', authenticate, requireAdmin, handle(async (r, s) =>
    s.json(await service.setFreeBilling(orgId(r), z.object({ free: z.boolean() }).parse(r.body).free))));
}
export function createOrganizationBillingWebhook(service: OrganizationService, provider: OrganizationBillingService | null): RequestHandler {
  return async (r, s) => {
    s.set('Cache-Control', 'private, no-store');
    if (!provider) { s.status(503).json({ message: 'Billing is temporarily unavailable.' }); return; }
    let event;
    try { event = provider.readWebhook(Buffer.isBuffer(r.body) ? r.body.toString('utf8') : '', r.get('stripe-signature')); }
    catch (error) {
      if (error instanceof BillingSignatureError) s.status(400).json({ message: 'Invalid billing webhook signature.' });
      else s.status(400).json({ message: 'Invalid billing webhook.' });
      return;
    }
    try { await service.billingWebhook(event); s.json({ received: true }); }
    catch { s.status(500).json({ message: 'Billing webhook could not be stored.' }); }
  };
}
