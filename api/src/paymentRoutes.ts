import { logError } from './errorLogger.js';
import type { Express, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { getRolePermissions, toAuthenticatedUser, type AuthenticatedUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import { getCorsOrigins } from './config.js';
import type { CourseRepository } from './courseRepository.js';
import type { KeyedSerialQueue } from './keyedSerialQueue.js';
import type { PaymentRepository } from './paymentRepository.js';
import { PaymentSignatureError, type CheckoutSession, type PaymentService } from './paymentService.js';

type PaymentDependencies = {
  authenticate: RequestHandler; auth: AuthRepository; courses: CourseRepository; payments: PaymentRepository;
  paymentService: PaymentService | null; enrollmentWrites: KeyedSerialQueue;
};
const unavailable = (response: Response) => response.status(503).json({ message: 'Purchases are temporarily unavailable.' });
const caller = (request: Request) => (request as Request & { user: AuthenticatedUser }).user;
const returnSchema = z.object({ returnUrl: z.url() });
const confirmSchema = z.object({ sessionId: z.string().min(1) });

function returnAddress(body: unknown): string | null {
  const parsed = returnSchema.safeParse(body);
  if (!parsed.success) return null;
  const url = new URL(parsed.data.returnUrl);
  return getCorsOrigins().includes(url.origin) && !url.username && !url.password ? url.href : null;
}
function checkoutReturn(returnUrl: string, success: boolean): string {
  const url = new URL(returnUrl);
  url.searchParams.delete('session_id');
  url.searchParams.set('payment', success ? 'success' : 'cancelled');
  if (success) url.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
  // Stripe substitutes this literal placeholder; URLSearchParams encodes braces.
  return url.href.replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}');
}

// Always retry the enrollment, including when the payment insert succeeded on an
// earlier delivery whose enrollment failed. Mongo's session key deduplicates the
// record across hosts; the auth repository's enrollment operation is add-only.
async function recordPaidCheckout(session: CheckoutSession, deps: PaymentDependencies): Promise<AuthenticatedUser> {
  if (!session.paid || !session.customerId || !session.userId || !session.courseId) throw new Error('Invalid paid course session.');
  return deps.enrollmentWrites.run(session.userId, async () => {
    const before = await deps.auth.findById(session.userId, { fresh: true });
    if (!before) throw new Error('Payment account missing.');
    const added = await deps.payments.add({ _id: session.id, userId: session.userId, courseId: session.courseId,
      amountDkk: session.amountDkk, stripeCustomerId: session.customerId!, paidAt: new Date().toISOString() });
    if (added && before.enrolledCourseIds.includes(session.courseId)) {
      console.error('Duplicate course purchase', { sessionId: session.id, userId: session.userId, courseId: session.courseId });
    }
    const user = await deps.auth.enrollUserInCourse(session.userId, session.courseId);
    if (!user) throw new Error('Payment enrollment was not confirmed.');
    return toAuthenticatedUser(user);
  });
}

export function createPaymentWebhookHandler(deps: PaymentDependencies): RequestHandler {
  return async (request, response, next) => {
    if (!deps.paymentService) { unavailable(response); return; }
    try {
      const rawBody = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : '';
      const event = deps.paymentService.readWebhookEvent(rawBody, request.header('stripe-signature'));
      if (event) {
        const session = await deps.paymentService.readCheckout(event.sessionId);
        if (session?.paid) await recordPaidCheckout(session, deps);
      }
      response.json({ received: true });
    } catch (error) {
      if (error instanceof PaymentSignatureError) { response.status(400).json({ message: 'Invalid Stripe webhook signature.' }); return; }
      next(error);
    }
  };
}

export function registerPaymentRoutes(app: Express, deps: PaymentDependencies): void {
  const { authenticate, courses, payments, paymentService } = deps;
  app.use(['/users/me/courses/:id/checkout', '/users/me/billing-portal'], (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  });
  app.post('/users/me/courses/:id/checkout', authenticate, async (request, response) => {
    const returnUrl = returnAddress(request.body);
    if (!returnUrl) { response.status(400).json({ message: 'Return address is not allowed.' }); return; }
    if (!paymentService) { unavailable(response); return; }
    const course = (await courses.listCourses()).find(c => c.id === String(request.params.id));
    if (!course) { response.status(404).json({ message: 'Course not found' }); return; }
    if (course.status !== 'published') { response.status(403).json({ message: 'Only published courses accept enrollment.' }); return; }
    if (!(course.priceDkk && course.priceDkk > 0)) { response.status(400).json({ message: 'This course is free.' }); return; }
    const user = caller(request);
    if (user.enrolledCourseIds.includes(course.id)) { response.status(409).json({ message: 'Already enrolled in this course.' }); return; }
    const customerId = await payments.latestCustomerId(user.id);
    try {
      response.json(await paymentService.createCheckout({ userId: user.id, email: user.email, courseId: course.id,
        courseTitle: course.title, amountDkk: course.priceDkk, customerId,
        successUrl: checkoutReturn(returnUrl, true), cancelUrl: checkoutReturn(returnUrl, false) }));
    } catch (error) {
      logError('Stripe checkout creation failed', error);
      unavailable(response);
    }
  });
  app.post('/users/me/courses/:id/checkout/confirm', authenticate, async (request, response) => {
    const { sessionId } = confirmSchema.parse(request.body);
    if (!paymentService) { unavailable(response); return; }
    let session: CheckoutSession | null;
    try { session = await paymentService.readCheckout(sessionId); }
    catch { unavailable(response); return; }
    if (!session || session.userId !== caller(request).id || session.courseId !== String(request.params.id)) {
      response.status(404).json({ message: 'Checkout session not found.' }); return;
    }
    if (!session.paid) { response.json({ paid: false }); return; }
    const user = await recordPaidCheckout(session, deps);
    response.json({ paid: true, user, permissions: getRolePermissions(user.role) });
  });
  app.post('/users/me/billing-portal', authenticate, async (request, response) => {
    const returnUrl = returnAddress(request.body);
    if (!returnUrl) { response.status(400).json({ message: 'Return address is not allowed.' }); return; }
    if (!paymentService) { unavailable(response); return; }
    const customerId = await payments.latestCustomerId(caller(request).id);
    if (!customerId) { response.status(404).json({ message: 'No payments yet.' }); return; }
    try { response.json(await paymentService.createPortal(customerId, returnUrl)); }
    catch { unavailable(response); }
  });
}
