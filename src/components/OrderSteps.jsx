import { Check } from 'lucide-react'
import { stepStates } from '../lib/orderSteps.js'

// Ordered → Accepted → Paid → Ready → Collected, as dots on a line.
// Screen readers hear each step with "done", "now" or "not yet".
const SPOKEN = { done: 'done', now: 'now', next: 'not yet' }

export default function OrderSteps({ reached, text, highlight = false }) {
  const steps = stepStates(reached)
  return (
    <div className="mt-3" data-testid="order-steps">
      <ol aria-label="Order progress" className="grid grid-cols-5">
        {steps.map((step, index) => (
          <li key={step.label} className="relative flex flex-col items-center text-center" aria-current={step.state === 'now' ? 'step' : undefined}>
            {index > 0 && (
              <span
                aria-hidden="true"
                className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${
                  step.state === 'done' ? 'bg-accent' : 'bg-border'
                }`}
              />
            )}
            <span
              aria-hidden="true"
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                step.state === 'done'
                  ? 'border-accent bg-accent text-background'
                  : step.state === 'now'
                    ? 'border-accent bg-card'
                    : 'border-border bg-card'
              }`}
            >
              {step.state === 'done' ? <Check size={14} strokeWidth={3} /> : step.state === 'now' ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
            </span>
            <span
              className={`mt-1 text-[11px] leading-tight ${
                step.state === 'next' ? 'text-muted-foreground' : 'font-semibold text-foreground'
              }`}
            >
              {step.label}
              <span className="sr-only">: {SPOKEN[step.state]}</span>
            </span>
          </li>
        ))}
      </ol>
      {text && (
        <p
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            highlight ? 'border border-green-400/40 bg-green-100/10 font-semibold text-foreground' : 'bg-muted/50 text-muted-foreground'
          }`}
        >
          {text}
        </p>
      )}
    </div>
  )
}
