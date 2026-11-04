import { createHash } from "node:crypto";

export const DEMO_PASSWORD = "DemoOnly-2026!";
export const DEMO_COUNTS = {
  candidates: 440,
  employers: 55,
  admins: 5,
} as const;
const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_DEMO_SEED_ANCHOR_MS = Date.parse("2026-11-04T12:00:00.000Z");

const FIRST_NAMES = [
  "Avery",
  "Amira",
  "Arjun",
  "Ava",
  "Ben",
  "Camila",
  "Daniel",
  "Dina",
  "Elena",
  "Ethan",
  "Farah",
  "Felix",
  "Grace",
  "Hana",
  "Idris",
  "Iris",
  "Jamal",
  "Jin",
  "Jonah",
  "Kareem",
  "Layla",
  "Leo",
  "Lina",
  "Maya",
  "Mina",
  "Noah",
  "Nora",
  "Omar",
  "Priya",
  "Rami",
  "Sara",
  "Theo",
  "Yara",
  "Zara",
];
const LAST_NAMES = [
  "Abbas",
  "Adams",
  "Ali",
  "Baker",
  "Chen",
  "Cohen",
  "Costa",
  "Diaz",
  "El-Sayed",
  "Farouk",
  "Foster",
  "Garcia",
  "Hassan",
  "Ibrahim",
  "Johnson",
  "Khan",
  "Kim",
  "Lopez",
  "Martin",
  "Miller",
  "Morgan",
  "Nasser",
  "Patel",
  "Rahman",
  "Reed",
  "Rossi",
  "Singh",
  "Taylor",
  "Wilson",
  "Youssef",
];
const ROLES = [
  "Product Analyst",
  "Frontend Engineer",
  "Data Scientist",
  "UX Researcher",
  "Operations Associate",
  "Growth Marketer",
  "AI Product Manager",
  "Financial Analyst",
  "Customer Success Lead",
  "Backend Engineer",
  "Business Intelligence Analyst",
  "Talent Partner",
];
const COMPANIES = [
  "Northstar Labs",
  "Cedar & Finch",
  "Blue Lantern Analytics",
  "Pioneer Health",
  "Atlas Grove",
  "Brightline Systems",
  "Saffron Cloud",
  "Meridian Works",
  "Orbit Learning",
  "Juniper Capital",
  "Copperfield Robotics",
  "Daybreak Studio",
  "Nileway Digital",
  "Crescent Mobility",
  "Kindred Commerce",
  "Waypoint Energy",
  "Open Harbor",
  "Fable & Form",
  "Signal House",
  "Evergreen Logistics",
  "Lumen Civic Tech",
  "Foundry Nine",
  "Monarch Data",
  "Olive Branch AI",
  "Kiteframe Software",
  "Tandem Networks",
  "Palmstone Finance",
  "Radiant Healthworks",
  "Common Thread",
  "Arcadia Research",
];
const LOCATIONS = [
  "Cairo, Egypt",
  "Alexandria, Egypt",
  "London, UK",
  "Berlin, Germany",
  "Remote · EMEA",
  "Toronto, Canada",
  "Amman, Jordan",
  "Dubai, UAE",
];
const STAGES = [
  "considering",
  "preparing",
  "applied",
  "interviewing",
  "offer",
  "closed",
] as const;

export function deterministicUuid(name: string): string {
  const bytes = createHash("sha256")
    .update(`careerflow-demo:${name}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface DemoAccount {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  index: number;
}

export function generateDemoSeedData(
  anchor = new Date(DEFAULT_DEMO_SEED_ANCHOR_MS),
) {
  const anchorMs = anchor.getTime();
  const dateAt = (offsetDays: number) => new Date(anchorMs - offsetDays * DAY);
  const candidates: DemoAccount[] = Array.from(
    { length: DEMO_COUNTS.candidates },
    (_, index) => {
      const name = `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]}`;
      return {
        id: deterministicUuid(`candidate:${index + 1}`),
        email: `candidate-${String(index + 1).padStart(3, "0")}@example.test`,
        name,
        createdAt: dateAt(index % 150),
        index,
      };
    },
  );
  const employers: (DemoAccount & { companyName: string })[] = Array.from(
    { length: DEMO_COUNTS.employers },
    (_, index) => {
      const companyName = `${COMPANIES[index % COMPANIES.length]}${index >= COMPANIES.length ? ` ${Math.floor(index / COMPANIES.length) + 1}` : ""}`;
      return {
        id: deterministicUuid(`employer:${index + 1}`),
        email: `employer-${String(index + 1).padStart(3, "0")}@example.test`,
        name: `${FIRST_NAMES[(index + 7) % FIRST_NAMES.length]} ${LAST_NAMES[(index + 11) % LAST_NAMES.length]}`,
        companyName,
        createdAt: dateAt((index * 3) % 120),
        index,
      };
    },
  );
  const admins = [
    {
      id: deterministicUuid("admin:owner"),
      email: "owner@demo.example.test",
      name: "Demo Owner",
      role: "owner" as const,
      createdAt: dateAt(90),
      index: 0,
    },
    {
      id: deterministicUuid("admin:support:1"),
      email: "support-1@demo.example.test",
      name: "Demo Support One",
      role: "support" as const,
      createdAt: dateAt(75),
      index: 1,
    },
    {
      id: deterministicUuid("admin:support:2"),
      email: "support-2@demo.example.test",
      name: "Demo Support Two",
      role: "support" as const,
      createdAt: dateAt(65),
      index: 2,
    },
    {
      id: deterministicUuid("admin:viewer:1"),
      email: "viewer-1@demo.example.test",
      name: "Demo Viewer One",
      role: "viewer" as const,
      createdAt: dateAt(50),
      index: 3,
    },
    {
      id: deterministicUuid("admin:viewer:2"),
      email: "viewer-2@demo.example.test",
      name: "Demo Viewer Two",
      role: "viewer" as const,
      createdAt: dateAt(35),
      index: 4,
    },
  ];
  const workspaces = candidates.map((candidate) => ({
    id: deterministicUuid(`workspace:${candidate.id}`),
    ownerId: candidate.id,
    kind: "personal" as const,
    name: `${candidate.name.split(" ")[0]}'s Career Workspace`,
    createdAt: candidate.createdAt,
  }));
  const opportunities = Array.from({ length: 30 }, (_, index) => {
    const id = deterministicUuid(`opportunity:${index + 1}`);
    const sourceId = deterministicUuid(`opportunity-source:${index + 1}`);
    return {
      id,
      sourceId,
      title: ROLES[index % ROLES.length]!,
      company: COMPANIES[index % COMPANIES.length]!,
      location: LOCATIONS[index % LOCATIONS.length]!,
      arrangement:
        index % 3 === 0 ? "Remote" : index % 3 === 1 ? "Hybrid" : "On-site",
      compensation: {
        currency: "USD",
        minimum: 70000 + (index % 7) * 5000,
        maximum: 110000 + (index % 5) * 7000,
        period: "year",
      },
      description: `Synthetic investor-demo vacancy for a ${ROLES[index % ROLES.length]!} at ${COMPANIES[index % COMPANIES.length]!}. This record is not a real job listing.`,
      createdAt: dateAt(index % 45),
    };
  });
  const applications = candidates.slice(0, 320).flatMap((candidate, index) => {
    const count = index < 80 ? 2 : 1;
    return Array.from({ length: count }, (_, sequence) => {
      const position = index * 2 + sequence;
      const stage = STAGES[(index + sequence * 2) % STAGES.length]!;
      const dueDate = dateAt(-((index % 21) + 1));
      return {
        id: deterministicUuid(`application:${candidate.id}:${sequence + 1}`),
        workspaceId: deterministicUuid(`workspace:${candidate.id}`),
        opportunityId:
          opportunities[(index * 3 + sequence) % opportunities.length]!.id,
        stage,
        nextAction:
          stage === "interviewing"
            ? "Prepare a concise portfolio walkthrough"
            : stage === "offer"
              ? "Review the synthetic offer terms"
              : stage === "closed"
                ? null
                : "Follow up with the hiring team",
        dueDate: stage === "closed" ? null : dueDate,
        notes: `Synthetic demo application ${position + 1}; not a real candidate record.`,
        submissionRecordedAt: [
          "applied",
          "interviewing",
          "offer",
          "closed",
        ].includes(stage)
          ? dateAt(14 + (index % 60))
          : null,
        submissionConfirmedAt: ["interviewing", "offer", "closed"].includes(
          stage,
        )
          ? dateAt(12 + (index % 55))
          : null,
        createdAt: dateAt((index * 2 + sequence) % 90),
        updatedAt: dateAt((index + sequence) % 15),
      };
    });
  });
  const candidateSubscriptions = candidates
    .slice(0, 198)
    .map((candidate, index) => {
      const status = index >= 180 ? ("canceled" as const) : ("active" as const);
      const plan = index % 5 === 0 ? ("growth" as const) : ("plus" as const);
      const workspaceId = deterministicUuid(`workspace:${candidate.id}`);
      const id = deterministicUuid(`candidate-subscription:${candidate.id}`);
      return {
        id,
        workspaceId,
        plan,
        status,
        provider: "mock",
        externalId: `seed-subscription:candidate:${index + 1}`,
        currentPeriodStart: dateAt(15),
        currentPeriodEnd: dateAt(-15),
        canceledAt: status === "canceled" ? dateAt(8) : null,
        createdAt: dateAt(65 + (index % 90)),
        updatedAt: dateAt(status === "canceled" ? 8 : index % 15),
        amountCents: plan === "growth" ? 2400 : 1200,
        invoiceId: deterministicUuid(`candidate-invoice:${candidate.id}`),
        externalInvoiceId: `seed-invoice:candidate:${String(index + 1).padStart(3, "0")}`,
        eventId: `seed-event:candidate:${String(index + 1).padStart(3, "0")}`,
      };
    });
  const employerSubscriptions = employers
    .slice(0, 34)
    .map((employer, index) => {
      const status = index >= 30 ? ("canceled" as const) : ("active" as const);
      const plan = index % 3 === 0 ? ("growth" as const) : ("plus" as const);
      const id = deterministicUuid(`employer-subscription:${employer.id}`);
      return {
        id,
        employerUserId: employer.id,
        plan,
        status,
        provider: "mock",
        externalId: `seed-subscription:employer:${index + 1}`,
        currentPeriodStart: dateAt(15),
        currentPeriodEnd: dateAt(-15),
        canceledAt: status === "canceled" ? dateAt(8) : null,
        createdAt: dateAt(55 + (index % 70)),
        updatedAt: dateAt(status === "canceled" ? 8 : index % 15),
        amountCents: plan === "growth" ? 9900 : 4900,
        invoiceId: deterministicUuid(`employer-invoice:${employer.id}`),
        externalInvoiceId: `seed-invoice:employer:${String(index + 1).padStart(3, "0")}`,
        eventId: `seed-event:employer:${String(index + 1).padStart(3, "0")}`,
      };
    });
  return {
    candidates,
    employers,
    admins,
    workspaces,
    opportunities,
    applications,
    candidateSubscriptions,
    employerSubscriptions,
    totals: {
      accounts: candidates.length + employers.length + admins.length,
      applications: applications.length,
      activeSubscriptions:
        candidateSubscriptions.filter((row) => row.status === "active").length +
        employerSubscriptions.filter((row) => row.status === "active").length,
      invoices: candidateSubscriptions.length + employerSubscriptions.length,
    },
  };
}
