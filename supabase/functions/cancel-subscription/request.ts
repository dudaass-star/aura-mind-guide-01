const ACTIONS = ["check", "reactivate", "pause", "apply_discount_3m", "downgrade_to_lite", "downgrade_to_base", "cancel"];

export function validCancelRequest(value: unknown): value is {
  authenticated?: boolean; phone?: string; token?: string; retention_code?: string;
  action?: string; reason?: string | null; reason_detail?: string | null; pause_days?: number; offer?: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if ("user_id" in body || "userId" in body) return false;
  if (body.authenticated !== undefined && typeof body.authenticated !== "boolean") return false;
  if (body.action !== undefined && !ACTIONS.includes(String(body.action))) return false;
  for (const key of ["phone", "token", "retention_code", "reason", "reason_detail", "offer"]) {
    const v = body[key];
    if (v != null && (typeof v !== "string" || v.length > (key === "reason_detail" ? 1000 : 200))) return false;
  }
  if (body.pause_days !== undefined && ![30, 60, 90].includes(Number(body.pause_days))) return false;
  // O modo App nunca aceita outra identidade enviada pelo cliente.
  if (body.authenticated === true && (body.phone || body.token || body.retention_code)) return false;
  return body.authenticated === true || Boolean(body.phone || body.token || body.retention_code);
}