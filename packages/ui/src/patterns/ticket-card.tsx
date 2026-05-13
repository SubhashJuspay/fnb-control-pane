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
 * Reusable ticket card primitive used by the KDS surface. Header has a thick
 * coloured top edge that scales with urgency (primary indigo when fresh,
 * tertiary amber after 5min, error after 10min).
 */
export const TicketCard = React.forwardRef<HTMLElement, TicketCardProps>(
  ({ variant = 'default', headerSlot, footerSlot, children, className, ...props }, ref) => {
    const variantClasses: Record<TicketCardVariant, string> = {
      default: 'border-t-primary bg-surface-container-lowest',
      warning: 'border-t-tertiary bg-tertiary-fixed',
      danger: 'border-t-error bg-error-container',
    };
    return (
      <article
        ref={ref}
        data-variant={variant}
        className={cn(
          'flex min-h-[400px] flex-col overflow-hidden rounded-xl border-t-8 shadow-card-soft',
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        <header className="flex flex-col gap-2 border-b border-outline-variant/40 px-card-padding py-card-padding">
          {headerSlot}
        </header>
        <div className="flex-1 px-card-padding py-card-padding">{children}</div>
        {footerSlot ? (
          <footer className="flex items-center justify-end gap-2 border-t border-outline-variant/40 bg-surface-container-high/60 px-card-padding py-3">
            {footerSlot}
          </footer>
        ) : null}
      </article>
    );
  },
);
TicketCard.displayName = 'TicketCard';
