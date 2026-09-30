import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createWithWooviReconciliation, type WooviCaller } from "./woovi-create-recovery.ts";

function response(status: number, data: Record<string, unknown> | null = null) {
  return { ok: status >= 200 && status < 300, status, data, raw: "" };
}

Deno.test("recupera criação quando a resposta 504 se perdeu", async () => {
  const replies = [response(504), response(200, { subscription: { globalID: "sub_1" } })];
  const paths: string[] = [];
  const call: WooviCaller = async (path) => {
    paths.push(path);
    return replies.shift() ?? response(500);
  };
  const result = await createWithWooviReconciliation(call, {
    createPath: "/api/v1/subscriptions",
    lookupPath: "/api/v1/subscriptions/corr_1",
    body: { correlationID: "corr_1" },
  });
  assertEquals(result.outcome, "recovered");
  assertEquals(paths, ["/api/v1/subscriptions", "/api/v1/subscriptions/corr_1"]);
});

Deno.test("repete com a mesma identidade somente após confirmar ausência", async () => {
  const replies = [response(500), response(404), response(200, { subscription: { globalID: "sub_1" } })];
  const bodies: unknown[] = [];
  const call: WooviCaller = async (_path, init) => {
    if (init?.method === "POST") bodies.push(init.body);
    return replies.shift() ?? response(500);
  };
  const body = { correlationID: "corr_estavel" };
  const result = await createWithWooviReconciliation(call, {
    createPath: "/api/v1/subscriptions",
    lookupPath: "/api/v1/subscriptions/corr_estavel",
    body,
  });
  assertEquals(result.outcome, "created");
  assertEquals(bodies, [body, body]);
});

Deno.test("não repete quando nem a consulta consegue confirmar o resultado", async () => {
  const replies = [response(504), response(503)];
  let posts = 0;
  const call: WooviCaller = async (_path, init) => {
    if (init?.method === "POST") posts += 1;
    return replies.shift() ?? response(500);
  };
  const result = await createWithWooviReconciliation(call, {
    createPath: "/api/v1/subscriptions",
    lookupPath: "/api/v1/subscriptions/corr_1",
    body: { correlationID: "corr_1" },
  });
  assertEquals(result.outcome, "unknown");
  assertEquals(posts, 1);
});

Deno.test("não repete erro definitivo de dados", async () => {
  let calls = 0;
  const call: WooviCaller = async () => {
    calls += 1;
    return response(422);
  };
  const result = await createWithWooviReconciliation(call, {
    createPath: "/api/v1/subscriptions",
    lookupPath: "/api/v1/subscriptions/corr_1",
    body: { correlationID: "corr_1" },
  });
  assertEquals(result.outcome, "definitive_failure");
  assertEquals(calls, 1);
});