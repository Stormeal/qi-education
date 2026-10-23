import { z } from 'zod';

const name = z.string().trim().min(1).max(120);
export const organizationRequestInputSchema = z.object({ displayName: name, companyName: name,
  cvr: z.string().regex(/^\d{8}$/), billingEmail: z.string().trim().toLowerCase().pipe(z.email()),
  message: z.string().trim().max(1000).default('') });
export const declineSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
export const priceSchema = z.object({ priceDkk: z.number().int().min(0).max(999999).nullable() });
export const inviteSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });
export const acceptSchema = z.object({ token: z.string().min(1).max(200), consent: z.literal(true) });
export type OrgRequest = { id: string; state: 'pending' | 'declined' | 'approved'; displayName: string;
  companyName: string; cvr: string; billingEmail: string; message: string; declineReason: string | null;
  submittedAt: string; decidedAt: string | null; organizationId: string | null };
export type Organization = { id: string; displayName: string; companyName: string; cvr: string;
  billingEmail: string; state: 'active' | 'suspended'; originalOwnerId: string; createdAt: string };
export type Member = { userId: string; name: string; email: string; role: 'member' | 'owner';
  careerId: string | null; joinedAt: string };
export type Invitation = { id: string; email: string; state: 'sent' | 'not-sent' | 'accepted' | 'cancelled' | 'expired';
  expiresAt: string; createdAt: string };
export type CourseRequest = { id: string; userId: string; userName: string; courseId: string;
  state: 'pending' | 'approved' | 'declined'; addOnPriceDkk: number | null; createdAt: string };
export type Prices = { careers: Record<string, number>; courses: Record<string, number> };
export type MyOrganization = { organization: Organization; role: 'member' | 'owner'; isOriginalOwner: boolean;
  careerId: string | null; seatPriceDkk: number | null; openCourseIds: string[]; startedCourseIds: string[]; courseRequests: CourseRequest[] };
export type StoredOrgRequest = OrgRequest & { userId: string };
export type StoredInvitation = Invitation & { orgId: string; tokenHash: string; acceptedBy?: string; joining?: boolean };
export type StoredCourseRequest = CourseRequest & { orgId: string };
export type OrganizationMembership = { userId: string; orgId: string; role: 'member' | 'owner';
  state: 'pending-email' | 'active'; careerId: string | null; startedCourseIds: string[]; consentAt: string; joinedAt: string };
export class OrganizationError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
