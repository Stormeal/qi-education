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
    version: '0.1.503',
    date: '2026-10-26',
    sections: [
      {
        title: 'New',
        items: [
          'Admins can ask one or more teachers or admins to review a course before it is published.',
          'Reviewers get an email and see the course under "To review" on Home.',
          'Reviewers read the course without changing it, then approve it or ask for changes with a comment.',
          'A course with reviewers can only be published once every reviewer has approved it.',
        ],
      },
    ],
  },
  {
    version: '0.1.483',
    date: '2026-10-26',
    sections: [
      {
        title: 'Fixed',
        items: [
          'All feedback sent before the move is back in the admin feedback inbox, and new feedback can be sent again.',
        ],
      },
    ],
  },
  {
    version: '0.1.482',
    date: '2026-10-26',
    sections: [
      {
        title: 'New',
        items: [
          'The Feedback button now lets you choose between giving feedback, reporting a defect and requesting a change.',
          'Admins can filter feedback by type, and defect reports show their steps and expected behaviour.',
          'A quiz holds up to 50 questions and a lesson up to 50 files, and the editor says so when you reach the limit.',
        ],
      },
      {
        title: 'Fixed',
        items: [
          'An exercise gets its length in minutes from its intro video once the video is ready.',
          'On a phone, the Save button in the course editor is no longer cut off.',
          'On a phone, the career path setup steps fit on the screen.',
          'Dialogs on the course page can be used with the keyboard alone and close with Escape.',
          'Screen readers now say which lesson, chapter, career or invitation a button belongs to.',
          'The server is better protected against unusual requests.',
        ],
      },
    ],
  },
  {
    version: '0.1.468',
    date: '2026-10-25',
    sections: [
      {
        title: 'New',
        items: [
          'Admins get their own Home page with courses waiting for review, organization requests and new feedback.',
        ],
      },
      {
        title: 'Fixed',
        items: [
          'Links in our emails, such as the email confirmation link, can now be clicked in every mail program.',
        ],
      },
    ],
  },
  {
    version: '0.1.464',
    date: '2026-10-25',
    sections: [
      {
        title: 'New',
        items: [
          'An Expand button on a career tree shows all careers together on one map.',
          'A video lesson gets its length in minutes from the video once the video is ready.',
          'While a video is being processed, a moving bar shows that work is still going on.',
          'The roadmap shows whether each item is live, built, in progress or not started.',
        ],
      },
      {
        title: 'Improved',
        items: [
          'The course list next to a lesson now fits the window when the page opens.',
          'The organization page shows a spinner while it loads.',
          'Signing in stays quick when many people sign in at the same time.',
          'Organization pages stay quick as organizations grow.',
          'The course editor opens a course without waiting for every course picture.',
        ],
      },
      {
        title: 'Fixed',
        items: [
          'Opening a second invitation link in the same tab now shows that invitation.',
          'The organization shown on an invitation is always the one you join.',
          'A member who was removed can no longer rejoin with their old invitation link.',
          'While an organization is suspended, the course request form is turned off.',
          'Scanning a CV refuses files that are far longer than a CV.',
          'A career achievement keeps its meaning when it is taken out and later added back.',
          'Importing a course only uses files from the course export itself.',
        ],
      },
    ],
  },
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
