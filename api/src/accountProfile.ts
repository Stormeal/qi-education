import { z } from 'zod';

export const notificationPrefsSchema = z.object({
  reviewActivity: z.boolean().default(true), organization: z.boolean().default(true), adminInbox: z.boolean().default(true),
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const accountProfileSchema = z.object({
  bio: z.string().trim().max(280),
  jobTitle: z.string().trim().max(120),
  company: z.string().trim().max(120),
  learningGoals: z.string().trim().max(280),
  avatarColor: z.string().length(7).regex(/^#[0-9a-fA-F]{6}$/),
  notificationPrefs: notificationPrefsSchema.default({ reviewActivity: true, organization: true, adminInbox: true }),
});

export type AccountProfileInput = z.infer<typeof accountProfileSchema>;
export type AccountProfileDocument = AccountProfileInput & { _id: string; updatedAt: string };
export type AccountProfile = AccountProfileInput & { updatedAt: string | null };

// Whitelist fields on both storage and HTTP boundaries; identifiers and extras
// can never escape through a document spread or come from the request body.
export function accountProfileFields(profile: AccountProfileInput): AccountProfileInput {
  return { bio: profile.bio, jobTitle: profile.jobTitle, company: profile.company,
    learningGoals: profile.learningGoals, avatarColor: profile.avatarColor,
    notificationPrefs: notificationPrefsSchema.parse(profile.notificationPrefs ?? {}) };
}

export function accountProfileResponse(profile: AccountProfileDocument | null): AccountProfile {
  return profile ? { ...accountProfileFields(profile), updatedAt: profile.updatedAt } : {
    bio: '', jobTitle: '', company: '', learningGoals: '', avatarColor: '#2f4f43', updatedAt: null,
    notificationPrefs: notificationPrefsSchema.parse({}),
  };
}
