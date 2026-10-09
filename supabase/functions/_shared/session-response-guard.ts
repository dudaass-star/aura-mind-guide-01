export function hasUnansweredSessionTurn(latestUserId: string | null, replies: { metadata?: Record<string, unknown> | null }[]) {
  return Boolean(latestUserId && !replies.some(reply => reply.metadata?.kind !== 'response_failure' && reply.metadata?.reply_to_message_id === latestUserId));
}