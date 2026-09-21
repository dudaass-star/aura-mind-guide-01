type NotificationContext = {
  userId: string;
  category: "response" | "session" | "journey" | "practice" | "report" | "reminder" | "engagement";
  priority: "low" | "normal" | "high";
};

export type NotificationPersonalization = {
  allowed: boolean;
  reason?: "daily_non_urgent_cap";
  stage: "first_week" | "early" | "established";
  preferredHourBrt: number;
  timingSource: "recent_activity" | "entry_time" | "category_default";
  rule: string;
};

const DEFAULT_HOURS: Record<NotificationContext["category"], number> = {
  response: 9,
  session: 9,
  journey: 19,
  practice: 19,
  report: 18,
  reminder: 9,
  engagement: 19,
};

function brtHour(value: string) {
  return (new Date(value).getUTCHours() - 3 + 24) % 24;
}

function brtDayStartIso() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return new Date(`${read("year")}-${read("month")}-${read("day")}T03:00:00.000Z`).toISOString();
}

export async function evaluateNotificationPersonalization(
  supabase: any,
  context: NotificationContext,
): Promise<NotificationPersonalization> {
  const [profileResult, activityResult] = await Promise.all([
    supabase.from("profiles")
      .select("created_at,trial_started_at,converted_at")
      .eq("user_id", context.userId)
      .maybeSingle(),
    supabase.from("messages")
      .select("created_at")
      .eq("user_id", context.userId)
      .eq("role", "user")
      .not("created_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const profile = profileResult.data;
  const startAt = profile?.converted_at || profile?.trial_started_at || profile?.created_at;
  const ageDays = startAt ? Math.max(0, Math.floor((Date.now() - new Date(startAt).getTime()) / 86_400_000)) : 30;
  const stage = ageDays <= 7 ? "first_week" : ageDays <= 30 ? "early" : "established";
  const activity = (activityResult.data || []).filter((item: { created_at: string | null }) => item.created_at);

  let preferredHourBrt = DEFAULT_HOURS[context.category];
  let timingSource: NotificationPersonalization["timingSource"] = "category_default";
  if (activity.length >= 3) {
    const counts = new Map<number, number>();
    for (const item of activity) {
      const hour = brtHour(item.created_at);
      counts.set(hour, (counts.get(hour) || 0) + 1);
    }
    preferredHourBrt = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    preferredHourBrt = Math.min(21, Math.max(8, preferredHourBrt));
    timingSource = "recent_activity";
  } else if (startAt) {
    preferredHourBrt = Math.min(21, Math.max(8, brtHour(startAt)));
    timingSource = "entry_time";
  }

  const nonUrgent = context.priority !== "high"
    && !["response", "session", "reminder"].includes(context.category);
  if (nonUrgent) {
    const { count } = await supabase.from("notification_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .in("status", ["sent", "opened", "converted"])
      .not("category", "in", "(response,session,reminder,billing,security)")
      .gte("created_at", brtDayStartIso());
    if ((count || 0) >= 1) {
      return {
        allowed: false,
        reason: "daily_non_urgent_cap",
        stage,
        preferredHourBrt,
        timingSource,
        rule: "one_non_urgent_per_brt_day",
      };
    }
  }

  return {
    allowed: true,
    stage,
    preferredHourBrt,
    timingSource,
    rule: stage === "first_week" ? "first_week_value_discovery" : "behavioral_timing",
  };
}