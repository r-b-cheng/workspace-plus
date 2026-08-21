import { cn } from '@/lib/cn';

type AppMarkProps = {
  className?: string;
  decorative?: boolean;
};

export function AppMark({ className, decorative = false }: AppMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-[34px] shrink-0', className)}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : 'Workspace Hub'}
    >
      <rect width="32" height="32" rx="8" fill="#176bff" />
      <rect x="3.5" y="4" width="18.5" height="15.5" rx="3.2" fill="#d7e4ff" />
      <rect x="9" y="11" width="19.5" height="16.5" rx="3.4" fill="#ffffff" />
      <circle cx="12.4" cy="14.4" r="1.35" fill="#176bff" />
      <rect x="11.6" y="17.8" width="5.4" height="5.4" rx="1.3" fill="#176bff" />
      <rect x="18.4" y="17.8" width="5.4" height="5.4" rx="1.3" fill="#176bff" />
    </svg>
  );
}
