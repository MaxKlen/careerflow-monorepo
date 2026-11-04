export interface DemoDatabaseTarget {
  hostname: string;
  database: string;
}

const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "host.docker.internal",
]);

export function parseDemoDatabaseTarget(
  databaseUrl: string,
): DemoDatabaseTarget | null {
  try {
    const parsed = new URL(databaseUrl);
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!database) return null;
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return { hostname, database };
  } catch {
    return null;
  }
}

export function isAllowedDemoDatabase(input: {
  databaseUrl: string;
  demoMode: boolean;
  nodeEnv: string;
}): boolean {
  if (!input.demoMode || input.nodeEnv === "production") return false;
  const target = parseDemoDatabaseTarget(input.databaseUrl);
  if (!target) return false;
  return (
    LOCAL_HOSTS.has(target.hostname) &&
    (target.database.endsWith("_demo") || target.database.endsWith("_test"))
  );
}
