import { Injectable, inject } from '@angular/core';
import { ApiClientService } from './api-client.service';

// Shapes from docs/specs/organizations/organizations.md (git show 42ec9a2:docs/stories/US-O001-release-1.md has the full contract).
export type OrgRequestInput = { displayName: string; companyName: string; cvr: string; billingEmail: string; message: string };
export type OrgRequest = OrgRequestInput & { id: string; state: 'pending' | 'declined' | 'approved';
  declineReason: string | null; submittedAt: string; decidedAt: string | null; organizationId: string | null;
  requesterName?: string; requesterEmail?: string };
export type Organization = { id: string; displayName: string; companyName: string; cvr: string; billingEmail: string;
  state: 'active' | 'suspended'; originalOwnerId: string; createdAt: string };
export type CourseRequest = { id: string; userId: string; userName: string; courseId: string;
  state: 'pending' | 'approved' | 'declined'; addOnPriceDkk: number | null; createdAt: string };
export type MyOrganization = { organization: Organization; role: 'member' | 'owner'; isOriginalOwner: boolean;
  careerId: string | null; seatPriceDkk: number | null; openCourseIds: string[]; courseRequests: CourseRequest[];
  billingState?: BillingState };
// US-O002 contract: docs/stories/US-O002-organization-billing.md. Amounts are whole DKK excl. moms.
export type BillingState = 'free' | 'setup-needed' | 'active' | 'overdue' | 'blocked' | 'cancelling' | 'cancelled';
export type BillingLine = { kind: 'base' | 'seat' | 'course'; id: string; title: string; unitDkk: number; quantity: number };
export type UnpaidInvoice = { id: string; amountDkk: number; dueAt: string; blocksAt: string; url: string | null };
export type OrgBillingView = { state: BillingState; method: 'card' | 'invoice' | null; lines: BillingLine[];
  monthlyTotalDkk: number; nextInvoiceAt: string | null; endsAt: string | null; unpaid: UnpaidInvoice[]; syncPending: boolean };
export type BillingAddress = { line1: string; postalCode: string; city: string };
export type AdminOrganization = Organization & { memberCount: number; billingState?: BillingState };
export type NoOrganization = { organization: null; request: OrgRequest | null; pendingInvitation: boolean };
export type Member = { userId: string; name: string; email: string; role: 'member' | 'owner'; careerId: string | null; joinedAt: string };
export type Invitation = { id: string; email: string; state: 'sent' | 'not-sent' | 'accepted' | 'cancelled' | 'expired';
  expiresAt: string; createdAt: string };
export type Prices = { careers: Record<string, number>; courses: Record<string, number> };
export type InvitationCheck = { organizationName: string; email: string; consentText: string };
export type RequestDecision = { action: 'approve'; billing?: 'paid' | 'free' } | { action: 'decline'; reason: string };
export type OrganizationResult<T> = { ok: true; body: T } | { ok: false; status: number; message: string };

/** US-O001 release 1 and US-O002 billing: organizations, invitations, members, careers, add-ons, prices and billing. */
@Injectable({ providedIn: 'root' })
export class OrganizationService {
  private readonly apiClient = inject(ApiClientService);

  mine(token: string) { return this.request<MyOrganization | NoOrganization>(token, '/users/me/organization'); }
  submitRequest(token: string, input: OrgRequestInput) { return this.request<OrgRequest>(token, '/users/me/organization-request', 'POST', input); }
  resubmitRequest(token: string, input: OrgRequestInput) { return this.request<OrgRequest>(token, '/users/me/organization-request', 'PUT', input); }
  leave(token: string) { return this.request<void>(token, '/users/me/organization', 'DELETE'); }

  adminRequests(token: string) { return this.request<OrgRequest[]>(token, '/admin/organization-requests?state=pending'); }
  decideRequest(token: string, id: string, decision: RequestDecision) {
    return this.request<OrgRequest>(token, `/admin/organization-requests/${enc(id)}/decision`, 'POST', decision);
  }
  adminOrganizations(token: string) { return this.request<AdminOrganization[]>(token, '/admin/organizations'); }
  setFree(token: string, id: string, free: boolean) {
    return this.request<AdminOrganization>(token, `/admin/organizations/${enc(id)}/billing`, 'PUT', { free });
  }
  setSuspended(token: string, id: string, suspended: boolean) {
    return this.request<Organization>(token, `/admin/organizations/${enc(id)}/${suspended ? 'suspend' : 'reactivate'}`, 'POST');
  }

  prices(token: string) { return this.request<Prices>(token, '/organization-prices'); }
  setCareerPrice(token: string, pathId: string, priceDkk: number | null) {
    return this.request<Prices>(token, `/admin/organization-prices/careers/${enc(pathId)}`, 'PUT', { priceDkk });
  }
  setCoursePrice(token: string, courseId: string, priceDkk: number | null) {
    return this.request<Prices>(token, `/admin/organization-prices/courses/${enc(courseId)}`, 'PUT', { priceDkk });
  }

  members(token: string, orgId: string) { return this.request<Member[]>(token, `/organizations/${enc(orgId)}/members`); }
  removeMember(token: string, orgId: string, userId: string) {
    return this.request<void>(token, `/organizations/${enc(orgId)}/members/${enc(userId)}`, 'DELETE');
  }
  promote(token: string, orgId: string, userId: string) {
    return this.request<Member>(token, `/organizations/${enc(orgId)}/members/${enc(userId)}/promote`, 'POST');
  }
  setCareer(token: string, orgId: string, userId: string, careerId: string | null) {
    return this.request<Member>(token, `/organizations/${enc(orgId)}/members/${enc(userId)}/career`, 'PUT', { careerId });
  }

  invitations(token: string, orgId: string) { return this.request<Invitation[]>(token, `/organizations/${enc(orgId)}/invitations`); }
  invite(token: string, orgId: string, email: string) {
    return this.request<Invitation>(token, `/organizations/${enc(orgId)}/invitations`, 'POST', { email });
  }
  resendInvitation(token: string, orgId: string, id: string) {
    return this.request<Invitation>(token, `/organizations/${enc(orgId)}/invitations/${enc(id)}/resend`, 'POST');
  }
  cancelInvitation(token: string, orgId: string, id: string) {
    return this.request<void>(token, `/organizations/${enc(orgId)}/invitations/${enc(id)}`, 'DELETE');
  }
  // The token travels only in request bodies, never in a URL (contract).
  checkInvitation(invitationToken: string) {
    return this.request<InvitationCheck>(null, '/organization-invitations/check', 'POST', { token: invitationToken });
  }
  acceptInvitation(token: string, invitationToken: string) {
    return this.request<MyOrganization | { state: 'pending-email' }>(token, '/organization-invitations/accept', 'POST',
      { token: invitationToken, consent: true });
  }

  courseRequests(token: string, orgId: string) { return this.request<CourseRequest[]>(token, `/organizations/${enc(orgId)}/course-requests`); }
  requestCourse(token: string, orgId: string, courseId: string) {
    return this.request<CourseRequest>(token, `/organizations/${enc(orgId)}/course-requests`, 'POST', { courseId });
  }
  decideCourseRequest(token: string, orgId: string, id: string, action: 'approve' | 'decline') {
    return this.request<CourseRequest>(token, `/organizations/${enc(orgId)}/course-requests/${enc(id)}/decision`, 'POST', { action });
  }

  billing(token: string, orgId: string) { return this.request<OrgBillingView>(token, `/organizations/${enc(orgId)}/billing`); }
  setupInvoice(token: string, orgId: string, address: BillingAddress) {
    return this.request<OrgBillingView>(token, `/organizations/${enc(orgId)}/billing/setup`, 'POST', { method: 'invoice', address });
  }
  setupCard(token: string, orgId: string, address: BillingAddress, returnUrl: string) {
    return this.request<{ url: string }>(token, `/organizations/${enc(orgId)}/billing/setup`, 'POST', { method: 'card', address, returnUrl });
  }
  confirmCard(token: string, orgId: string, sessionId: string) {
    return this.request<OrgBillingView>(token, `/organizations/${enc(orgId)}/billing/card/confirm`, 'POST', { sessionId });
  }
  setCancellation(token: string, orgId: string, cancel: boolean) {
    return this.request<OrgBillingView>(token, `/organizations/${enc(orgId)}/billing/cancellation`, 'PUT', { cancel });
  }
  billingPortal(token: string, orgId: string, returnUrl: string) {
    return this.request<{ url: string }>(token, `/organizations/${enc(orgId)}/billing/portal`, 'POST', { returnUrl });
  }

  private async request<T>(token: string | null, path: string, method = 'GET', body?: unknown): Promise<OrganizationResult<T>> {
    try {
      const response = await this.apiClient.fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = response.status === 204 ? {} : await response.json().catch(() => ({}));
      return response.ok ? { ok: true, body: json as T }
        : { ok: false, status: response.status, message: json.message ?? 'The request could not be completed.' };
    } catch {
      return { ok: false, status: 0, message: 'Unable to reach the API. Please try again.' };
    }
  }
}

const enc = encodeURIComponent;
