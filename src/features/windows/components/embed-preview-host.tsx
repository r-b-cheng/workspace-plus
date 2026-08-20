import { Button } from '@/components/ui/button';
import { EMBED_PREVIEW_LABEL, EXIT_EMBED_PREVIEW_LABEL } from '@/features/windows/embed-copy';

type EmbedPreviewHostProps = {
  active: boolean;
  onExit: () => void;
};

export function EmbedPreviewHost({ active, onExit }: EmbedPreviewHostProps) {
  if (!active) {
    return null;
  }

  return (
    <section className="grid gap-2" data-testid="embed-preview-host">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{EMBED_PREVIEW_LABEL}</span>
        <Button
          variant="ghost"
          className="h-auto w-fit rounded-lg px-2.5 py-2 text-muted-foreground"
          data-testid="embed-preview-exit-button"
          onClick={onExit}
        >
          {EXIT_EMBED_PREVIEW_LABEL}
        </Button>
      </div>
      <div
        data-embed-host-surface
        data-testid="embed-preview-host-surface"
        className="min-h-[240px] rounded-[10px] border border-dashed border-border bg-muted/30"
      />
    </section>
  );
}
