import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.headers.has("origin")) return NextResponse.next();

  // Same-origin browser GETs omit Origin; forward the configured app origin
  // so the API can keep enforcing its exact trusted-origin allowlist.
  const headers = new Headers(request.headers);
  headers.set("origin", process.env.EMPLOYER_URL ?? request.nextUrl.origin);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/api/:path*"] };
