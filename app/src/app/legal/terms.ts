/**
 * US-P022: the binding legal texts, versioned in code so a change is a reviewed deploy.
 * Bump `version` on every wording change and bump TERMS_VERSIONS in api/src/termsDocuments.ts in
 * the same commit: the API stamps its own number and asks everyone to accept a new ToS version.
 * shortcut: placeholder wording until Alex/legal supply the final text.
 */
export type TermsDocumentId = 'tos' | 'purchase';
export type TermsDocument = {
  id: TermsDocumentId; version: number; effectiveDate: string; title: string; intro: string;
  sections: { heading: string; body: string }[];
};

export const TERMS_DOCUMENTS: Record<TermsDocumentId, TermsDocument> = {
  tos: {
    id: 'tos', version: 1, effectiveDate: '2026-11-01', title: 'Terms of Service',
    intro: 'These terms govern your use of QI Academy: courses, assignments, career paths and progress tracking.',
    sections: [
      { heading: 'Accounts', body: 'Give accurate account information and keep your password secure. An account is personal and may not be shared.' },
      { heading: 'Course access', body: 'You may use course materials, assignments and certifications that are made available through your account, for your own learning.' },
      { heading: 'Acceptable use', body: 'Do not misuse the platform, try to gain unauthorized access, disturb other learners, or copy and share course content without permission.' },
      { heading: 'Content you add', body: 'Teachers keep responsibility for the courses they write. Notes, feedback and other text you add must not break the law or the rights of others.' },
      { heading: 'Your data', body: 'We store the account, learning and payment data needed to run the platform. You can download or delete your data under Settings → Privacy & data.' },
      { heading: 'Changes', body: 'When these terms change, you are asked to accept the new version before you continue using QI Academy.' },
    ],
  },
  purchase: {
    id: 'purchase', version: 1, effectiveDate: '2026-11-01', title: 'Purchase & Refund Terms',
    intro: 'These terms apply when you buy a course on QI Academy. Payment is handled by Stripe.',
    sections: [
      { heading: 'Prices', body: 'Prices are shown in Danish kroner (DKK) including VAT. The price shown at checkout is the price you pay.' },
      { heading: 'Payment', body: 'You pay by card through Stripe. QI Academy never sees or stores your card details.' },
      { heading: 'Access', body: 'A bought course is added to My Learning as soon as the payment is confirmed, and stays available for as long as the course is offered.' },
      { heading: 'Right of withdrawal', body: 'Because a course is digital content you get access to straight away, you agree at checkout that the 14-day right of withdrawal ends when access starts.' },
      { heading: 'Refunds', body: 'If a course cannot be used as described, contact us and we refund the purchase. A refunded course is removed from My Learning.' },
      { heading: 'Receipts', body: 'Stripe sends a receipt by email. Your purchases are also listed under Settings → Purchases.' },
    ],
  },
};
