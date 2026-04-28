import * as React from 'react';
import { cn } from '../lib/cn.js';

export type TicketCardVariant = 'default' | 'warning' | 'danger';

export interface TicketCardProps extends React.HTMLAttributes<HTMLElement> {
  /** Border-tint variant; reflects time-since-fire urgency on the KDS. */
  variant?: TicketCardVariant;
  /** Top portion of the card — usually number + meta + age badge. */
  headerSlot: React.ReactNode;
  /** Optional bottom portion — bump buttons, totals, etc. */
  footerSlot?: React.ReactNode;
  /** Body content rendered between header and footer. */
  children?: React.ReactNode;
}

/**
 * Reusable ticket card primitive used by the KDS surface and any future
 * ticket-style UI. Provides consistent padding, a header/body/footer slot
 * layout, and a thin coloured top border that callers tint based on
 * urgency. The root element is `<article>` so it appears as a landmark and
 * exposes a `data-variant` attribute that tests can assert against without
 * relying on tailwind class strings.
 */
export const TicketCard = React.forwardRef<HTMLElement, TicketCardProps>(
  ({ variant = 'default', headerSlot, footerSlot, children, className, ...props }, ref) => {
    const variantClasses: Record<TicketCardVariant, string> = {
      default: 'border-t-emerald-500',
      warning: 'border-t-amber-500',
      danger: 'border-t-red-500',
    };
    return (
      <article
        ref={ref}
        data-variant={variant}
        className={cn(
          'flex flex-col rounded-lg border bg-surface text-foreground shadow-sm',
          'border-t-4',
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        <header className="flex flex-col gap-1 border-b px-4 py-3">{headerSlot}</header>
        <div className="flex-1 px-4 py-3">{children}</div>
        {footerSlot ? (
          <footer className="flex items-center justify-end gap-2 border-t bg-muted/40 px-4 py-2">
            {footerSlot}
          </footer>
        ) : null}
      </article>
    );
  },
);
TicketCard.displayName = 'TicketCard';
