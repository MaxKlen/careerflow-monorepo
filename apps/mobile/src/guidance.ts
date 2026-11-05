export type CandidateGuideSection = {
  id: 'tasks' | 'profile' | 'evidence' | 'documents' | 'privacy' | 'devices' | 'meh' | 'limits';
  eyebrow: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export const candidateGuideSafetyNote =
  'Start with the fictional example projects and tasks. Your career profile starts blank. Use made-up details while exploring, and avoid real or sensitive personal information in this demo.';

export const candidateGuideSections: CandidateGuideSection[] = [
  {
    id: 'tasks',
    eyebrow: 'WORK IN MOTION',
    title: 'Tasks, projects, and progress',
    paragraphs: [
      'The workspace begins with fictional example projects and tasks. Create a task with a title, then move its status or mark it complete.',
      'The home progress figure is a simple calculation from completed tasks and milestone checkboxes. It is not job-market analysis or a verified career assessment.',
    ],
  },
  {
    id: 'profile',
    eyebrow: 'YOUR DIRECTION',
    title: 'Profile and milestones',
    paragraphs: [
      'Add a target role and a career goal to make your profile more useful; the other profile fields are optional.',
      'Journey checkpoints are a manual record of your own progress. Ticking a milestone does not verify that an outcome happened. Application or interview labels are checklist items only—not application or interview services.',
    ],
  },
  {
    id: 'evidence',
    eyebrow: 'REUSABLE EXAMPLES',
    title: 'Evidence library',
    paragraphs: [
      'Open Evidence Library from Home to organize fictional examples as context, action, result, and optional skill tags. Search, edit, or delete saved examples on this phone.',
      'The Applications tracker can compare whole requirement phrases with Profile skills and Evidence skill tags using exact normalized text only. You can also choose an Evidence Library example to link manually; that link preserves a snapshot but is separate from phrase overlap and does not verify evidence or prove qualification. For an application, you may prepare and edit a local materials outline from its saved phrases and selected snapshots, with source IDs and dates visible. Review every line; it does not invent facts, use live AI, score fit, or submit anything.',
      'Use made-up details only. Local storage is not encrypted or synced and is not automatically backed up; you can create a manual local backup.',
    ],
  },
  {
    id: 'documents',
    eyebrow: 'CV & LINKEDIN CAPTURE',
    title: 'Bring in text you choose',
    paragraphs: [
      'Under Profile → CV, import a plain-text .txt or Markdown .md file, or paste CV text into the field. PDF and Word text extraction, scanned-document OCR, and other file types are not supported; copy and paste text yourself.',
      'Under Profile → LinkedIn, manually copy only the sections you want to review into Headline, About, Experience, Skills, and Education. CareerFlow does not log in to, scrape, or send anything to LinkedIn.',
      'Writing suggestions use simple checks on the device, not AI. Review every suggestion and keep only accurate details.',
    ],
  },
  {
    id: 'privacy',
    eyebrow: 'SAVE & PROTECT',
    title: 'Local storage and document export',
    paragraphs: [
      'Profile, CV, LinkedIn notes, and document text are stored in this app on this phone. Profile edits save automatically; use the save buttons for CV, LinkedIn, letters, and other documents.',
      'Save/share PDF opens the phone’s share sheet when available; Print opens the print sheet. An exported file may contain your entered information, so keep it somewhere private.',
      'Local app storage is not encrypted by CareerFlow, backed up, or synced between devices. Data may be lost if app data is cleared or the app is removed. Use your phone passcode and keep a private copy of anything important.',
    ],
  },
  {
    id: 'devices',
    eyebrow: 'DEVICE & RECOVERY',
    title: 'Supported preview and local recovery',
    paragraphs: [
      'This companion targets iOS and Android through Expo Go, with Expo Web available as a browser preview. Automated checks do not certify real-device behavior or establish a complete OS/browser support matrix; owner-device acceptance is still outstanding.',
      'Use Local backup & restore to export a JSON copy before reinstalling the app, clearing app data, or moving to another phone. A restore replaces the current tracker and document workspace; it does not merge. If local data is lost and no backup exists, CareerFlow cannot recover it.',
      'Backup files contain your local career text and are not encrypted by CareerFlow. Use fictional, non-sensitive examples and save any copy only in a private place you control. Export and restore are manual file operations, not cloud backup or sync.',
    ],
  },
  {
    id: 'meh',
    eyebrow: 'OFFLINE DEMO',
    title: 'MEH AI is a local preview',
    paragraphs: [
      'Open the floating MEH AI button for preloaded, rule-based guidance based on limited saved profile, task, and milestone context. The MEH demo makes no network calls and does not use live AI; CV and LinkedIn drafts are not included.',
      'Treat its prompts as ideas to consider, not professional advice or verified recommendations.',
    ],
  },
  {
    id: 'limits',
    eyebrow: 'WHAT IS NOT INCLUDED',
    title: 'Know the limits of this preview',
    paragraphs: [
      'There is no live AI, account sync, cloud backup, job search or matching, automatic applications, employer access, interview service, or payment feature in this mobile preview. Milestones are only your own checklist.',
      'Video tutorials are not included yet; they remain a roadmap item.',
    ],
  },
];
