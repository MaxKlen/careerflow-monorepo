import type { FastifyInstance } from "fastify";
import { completePaymentEvent } from "../billingService.js";
import { getPaymentProvider } from "../paymentProvider.js";

export async function registerPaymentWebhooks(
  app: FastifyInstance,
): Promise<void> {
  app.post("/stripe", { config: { rawBody: true } }, async (req, reply) => {
    const provider = getPaymentProvider();
    if (provider.name !== "stripe")
      return reply.code(404).send({ error: "provider_not_enabled" });
    try {
      const event = await provider.parseWebhook(
        (req as any).rawBody?.toString("utf8") ?? JSON.stringify(req.body),
        typeof req.headers["stripe-signature"] === "string"
          ? req.headers["stripe-signature"]
          : undefined,
      );
      if (!event) return { received: true, ignored: true };
      return { received: true, ...(await completePaymentEvent(event)) };
    } catch (error) {
      req.log.warn({ err: error }, "Stripe webhook rejected");
      return reply.code(400).send({ error: "invalid_webhook" });
    }
  });

  app.post("/paymob", { config: { rawBody: true } }, async (req, reply) => {
    const provider = getPaymentProvider();
    if (provider.name !== "paymob")
      return reply.code(404).send({ error: "provider_not_enabled" });
    try {
      const event = await provider.parseWebhook(
        (req as any).rawBody?.toString("utf8") ?? JSON.stringify(req.body),
        req.headers["x-paymob-signature"] as string | undefined,
      );
      if (!event) return { received: true, ignored: true };
      return { received: true, ...(await completePaymentEvent(event)) };
    } catch (error) {
      req.log.warn({ err: error }, "Paymob webhook rejected");
      return reply.code(400).send({ error: "invalid_webhook" });
    }
  });
}
