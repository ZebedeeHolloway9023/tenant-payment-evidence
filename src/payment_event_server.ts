import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_storage.js";
import { paymentEventSchema, processPaymentEvent } from "./payment_event_workflow.js";

const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/payment-events") {
    response.writeHead(404).end(JSON.stringify({ error: "route_not_found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const event = paymentEventSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await processPaymentEvent(event);
    response.writeHead(201).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_payment_event" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code, message: error.message }));
      return;
    }
    console.error(error);
    response.writeHead(502).end(JSON.stringify({ error: "payment_event_processing_failed" }));
  }
});

server.listen(port, () => console.log(`Payment event service listening on http://localhost:${port}`));
