import { useState } from 'react';
import { FAQS } from '../data/event';
import { Reveal, SectionHeading, cn } from './ui';

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-20 bg-cream-200/50 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Good to know"
          title="Questions,"
          accent="answered."
          description="Anything else on your mind? Details will be announced by the organizers."
        />
        <div className="mt-10 space-y-3">
          {FAQS.map((faq, i) => {
            const open = openIndex === i;
            return (
              <Reveal key={faq.question} delayMs={Math.min(i, 5) * 40}>
                <div
                  className={cn(
                    'overflow-hidden rounded-2xl bg-cream-50 ring-1 transition-all duration-300',
                    open ? 'ring-wine-600/40 shadow-lg' : 'ring-ink-950/10 hover:ring-ink-950/20',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenIndex(open ? null : i)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
                  >
                    <span className="font-display text-[17px] font-black text-ink-950">
                      {faq.question}
                    </span>
                    <span
                      className={cn(
                        'grid h-8 w-8 shrink-0 place-items-center rounded-full transition-all duration-300',
                        open ? 'rotate-45 bg-wine-700 text-cream-50' : 'bg-ink-950/8 text-ink-800',
                      )}
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    </span>
                  </button>
                  <div
                    className={cn(
                      'grid transition-[grid-template-rows] duration-300 ease-out',
                      open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-[15px] leading-relaxed font-medium text-ink-700 sm:px-6">
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
