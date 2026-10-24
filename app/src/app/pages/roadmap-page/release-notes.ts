export type ReleaseNote = {
  version: string;
  /** ISO date of the push, e.g. 2026-10-24. */
  date: string;
  sections: { title: string; items: string[] }[];
};

// Newest first. Claude adds the note for each push here, in the commit that is pushed.
// Keep notes short and plain (Alex): one sentence per item, written for a teacher, no technical terms.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.442',
    date: '2026-10-24',
    sections: [
      {
        title: 'New',
        items: [
          'Your profile has tabs for your details, your password and your purchases.',
          'The Purchases tab lists the courses you bought, each with a link to its receipt.',
          'The About page tells you about QI Academy and TestHuset.',
          'The top bar shows your organization next to your picture.',
          'When a career milestone gets new requirements, learners see a note about what changed.',
        ],
      },
      {
        title: 'Improved',
        items: [
          'In the career editor, "Comes after" is now a list you can search.',
          'The top bar picture uses the colour you saved on your profile.',
          'The course list next to a lesson no longer makes the page longer than the lesson.',
          'The server is better protected against a known weakness in one of its building blocks.',
        ],
      },
    ],
  },
  {
    version: '0.1.433',
    date: '2026-10-24',
    sections: [
      {
        title: 'New',
        items: [
          'A Roadmap page shows what is planned for QI Academy.',
          'Release notes like these now tell you what changed in each update.',
        ],
      },
    ],
  },
];
