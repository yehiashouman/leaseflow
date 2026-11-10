import { Button } from '@/components/ui/button';
export function PreviewBanner() {
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b bg-accent px-4 py-2 text-xs lg:h-12 text-accent-foreground">
      <span>
        Public preview · Synthetic data · Changes stay in this browser. Do not enter personal data.
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          const { resetPreview } = await import('../preview/adapter');
          resetPreview();
          window.location.reload();
        }}
      >
        Reset demo data
      </Button>
    </div>
  );
}
