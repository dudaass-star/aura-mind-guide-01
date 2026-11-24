import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";
import { cn } from "@/lib/utils";

export function VoiceMessageText({ content, mine, children }: { content: string; mine: boolean; children: (toggle: ReactNode) => ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const textId = useId();

  const toggle = content.trim() ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-expanded={expanded}
      aria-controls={expanded ? textId : undefined}
      onClick={() => setExpanded((value) => !value)}
      className={cn(
        "h-5 shrink-0 rounded-sm px-1 text-[11px] font-medium",
        mine
          ? "text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {expanded ? "Ocultar texto" : "Ler mensagem"}
    </Button>
  ) : null;

  return (
    <div className="w-[min(15.5rem,70vw)] max-w-full">
      {children(toggle)}
      {expanded && content.trim() && (
        <div
          id={textId}
          className={cn(
            "mt-1 border-t pt-2 text-[14px] leading-[1.5] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200",
            mine ? "border-primary-foreground/20" : "border-border/30",
          )}
        >
          {mine ? (
            <p className="whitespace-pre-wrap break-words">{content}</p>
          ) : (
            <MessageResponse className="whitespace-pre-wrap break-words text-[14px] leading-[1.5]">{content}</MessageResponse>
          )}
        </div>
      )}
    </div>
  );
}