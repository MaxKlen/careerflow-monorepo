# CareerFlow Investor Demo ($0)

Local-only: no paid hosting, production data, real AI/email or payment gateways. All users, plans, invoices, MRR and churn are **DEMO / SYNTHETIC**.

**Run locally** (Docker Compose, Node.js 22+, pnpm; repository root):

```sh
pnpm install --frozen-lockfile
pnpm demo:up
export DATABASE_URL=postgres://careerflow:careerflow@localhost:5434/careerflow_demo DEMO_MODE=true NODE_ENV=development
pnpm demo:seed
```

URLs: Candidate `localhost:3000`, Admin `localhost:3001`, Employer `localhost:3002`; API health `localhost:4000/ready`. Seed: **500 accounts** (440 candidates, 55 employers, 5 admins), 440 workspaces, 400 applications, 210 active subscriptions, 232 synthetic invoices; all emails are reserved `.test` addresses. Logins: `owner@demo.example.test`, `candidate-001@example.test`, `employer-001@example.test`; password `DemoOnly-2026!`. Reset with `pnpm demo:reset`; stop with `pnpm demo:down`. Seed/reset refuse production, remote or non-demo databases.

**Optional free pitch tunnel.** No public tunnel starts automatically. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) need no account/domain. Run:

```sh
pnpm demo:tunnel-prepare
cloudflared tunnel --url http://localhost:8080
```

Copy the printed URL; in another terminal run `pnpm demo:tunnel-up https://YOUR-URL.trycloudflare.com`. Share only its `/candidate`, `/employer` and `/admin` paths. Anyone with the link can reach your laptop; never use production data. Stop `cloudflared` with Ctrl+C, then run `pnpm demo:down`.

**Safety.** Mock checkout grants synthetic access/invoices; no charge or public webhook. Owner suspension revokes sessions; impersonation is audited, 15-minute and read-only. Stripe/Paymob are disabled; live payments still need real integration, credentials, signed webhooks and compliance/security work. The existing Candidate PWA preview is unchanged.
