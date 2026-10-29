import { coursePriceDkkSchema, coursePriceMessage } from './course.js';
import { logError } from './errorLogger.js';
import type { Express, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { getRolePermissions, requireConfirmedEmail, toAuthenticatedUser, type AuthenticatedUser } from './auth.js';
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
// record across hosts. Refunded records must never grant enrollment again.
async function recordPaidCheckout(session: CheckoutSession, deps: PaymentDependencies): Promise<AuthenticatedUser> {
  if (!session.paid || !session.customerId || !session.userId || !session.courseId) throw new Error('Invalid paid course session.');
  return deps.enrollmentWrites.run(session.userId, async () => {
    const added = await deps.payments.add({ _id: session.id, userId: session.userId, courseId: session.courseId,
      amountDkk: session.amountDkk, stripeCustomerId: session.customerId!, paidAt: new Date().toISOString() });
    if ((await deps.payments.findById(session.id))?.refundedAt) return reconcileRefundedCourse(session.userId, session.courseId, deps);
    const enrollment = await deps.auth.enrollUserInCourseWithChange(session.userId, session.courseId, session.id);
    if (!enrollment) throw new Error('Payment enrollment was not confirmed.');
    if (added && !enrollment.added && enrollment.purchaseSessionId !== session.id &&
      (!enrollment.purchaseSessionId || await deps.payments.findUnrefundedPurchase(session.userId, session.courseId, session.id))) {
      console.error('Duplicate course purchase', { sessionId: session.id, userId: session.userId, courseId: session.courseId });
    }
    // A refund on another instance may have arrived while this grant was in flight.
    if ((await deps.payments.findById(session.id))?.refundedAt) return reconcileRefundedCourse(session.userId, session.courseId, deps);
    return toAuthenticatedUser(enrollment.user);
  });
}

// Recheck after the atomic account write: a competing purchase/refund may have
// changed the remaining purchase while this instance awaited account storage.
async function reconcileRefundedCourse(userId: string, courseId: string, deps: PaymentDependencies): Promise<AuthenticatedUser> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = await deps.payments.findUnrefundedPurchase(userId, courseId);
    const user = await deps.auth.reconcileCoursePurchase(userId, courseId, remaining?._id ?? null);
    if (!user) throw new Error('Refund enrollment reconciliation was not confirmed.');
    const latest = await deps.payments.findUnrefundedPurchase(userId, courseId);
    if (latest?._id === remaining?._id) return toAuthenticatedUser(user);
  }
  throw new Error('Concurrent payment changes require a retry.');
}
async function recordRefund(paymentIntentId: string, deps: PaymentDependencies): Promise<void> {
  const session = await deps.paymentService!.findCheckoutByPaymentIntent(paymentIntentId);
  if (!session) { console.warn('Refund for unknown payment', { paymentIntentId }); return; }
  const payment = await deps.payments.findById(session.id);
  if (!payment) { console.warn('Refund for unknown payment', { sessionId: session.id }); return; }
  await deps.enrollmentWrites.run(payment.userId, async () => {
    await deps.payments.markRefunded(payment._id, new Date().toISOString());
    await reconcileRefundedCourse(payment.userId, payment.courseId, deps);
  });
}

export function createPaymentWebhookHandler(deps: PaymentDependencies): RequestHandler {
  return async (request, response, next) => {
    if (!deps.paymentService) { unavailable(response); return; }
    try {
      const rawBody = Buffer.isBuffer(request.body) ? request.body.toString('utf8') : '';
      const event = deps.paymentService.readWebhookEvent(rawBody, request.header('stripe-signature'));
      if (event && 'paymentIntentId' in event) await recordRefund(event.paymentIntentId, deps);
      else if (event) {
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
  app.use(['/users/me/courses/:id/checkout', '/users/me/billing-portal', '/users/me/payments'], (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  });
  app.post('/users/me/courses/:id/checkout', authenticate, async (request, response) => {
    const returnUrl = returnAddress(request.body);
    if (!returnUrl) { response.status(400).json({ message: 'Return address is not allowed.' }); return; }
    if (!paymentService) { unavailable(response); return; }
    const course = (await courses.listCourses()).find(c => c.id === String(request.params.id));
    if (!course) { response.status(404).json({ message: 'Course not found' }); return; }
    if (course.status !== 'published') { response.status(403).json({ message: 'Only published courses accept enrollment.' }); return; }
    if (!coursePriceDkkSchema.safeParse(course.priceDkk).success) { response.status(400).json({ message: coursePriceMessage }); return; }
    if (!(course.priceDkk && course.priceDkk > 0)) { response.status(400).json({ message: 'This course is free.' }); return; }
    const user = caller(request);
    if (user.enrolledCourseIds.includes(course.id)) { response.status(409).json({ message: 'Already enrolled in this course.' }); return; }
    if (!requireConfirmedEmail(user)) { response.status(403).json({ message: 'email-not-confirmed' }); return; }
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
  app.get('/users/me/payments', authenticate, async (request, response) => {
    const titles = new Map((await courses.listCourses()).map(course => [course.id, course.title]));
    const list = await payments.listByUser(caller(request).id);
    response.json({ payments: list.map(payment => ({ id: payment._id, courseId: payment.courseId,
      courseTitle: titles.get(payment.courseId) ?? 'Removed course', amountDkk: payment.amountDkk, paidAt: payment.paidAt,
      refunded: !!payment.refundedAt })) });
  });
  app.get('/users/me/payments/:id/receipt', authenticate, async (request, response) => {
    const payment = await payments.findById(String(request.params.id));
    if (!payment || payment.userId !== caller(request).id) { response.status(404).json({ message: 'Payment not found.' }); return; }
    if (!paymentService) { unavailable(response); return; }
    let url: string | null;
    try { url = await paymentService.receiptUrl(payment._id); }
    catch (error) { logError('Stripe receipt lookup failed', error); unavailable(response); return; }
    if (!url) { response.status(404).json({ message: 'This receipt is not available.' }); return; }
    response.json({ url });
  });
}
