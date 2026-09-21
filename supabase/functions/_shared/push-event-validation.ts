export type PushDeliveryState = {
  selected_channel: string | null;
  status: string;
};

export function canRecordPushEvent(
  eventType: "opened" | "converted",
  delivery: PushDeliveryState,
) {
  if (delivery.selected_channel !== "push") return false;
  if (eventType === "opened") {
    return ["sent", "opened", "converted"].includes(delivery.status);
  }
  return ["opened", "converted"].includes(delivery.status);
}