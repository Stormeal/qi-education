export type ReleaseNote = {
  version: string;
  /** ISO date of the push, e.g. 2026-10-24. */
  date: string;
  sections: { title: string; items: string[] }[];
};

// Newest first. Claude adds the note for each push here, in the commit that is pushed.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.432',
    date: '2026-10-24',
    sections: [
      {
        title: 'New',
        items: [
          'Teachers and admins have a Roadmap tab in the top navigation. It shows the three planned releases and what release 1 contains.',
          'The Roadmap page has a Release notes tab that lists what each update to QI Academy changed, newest first.',
        ],
      },
    ],
  },
];
