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
