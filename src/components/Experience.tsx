import { Reveal, SectionHeading } from './ui';

const CARDS = [
  {
    title: 'Open-Air Movie',
    text: 'A full cinema experience with no roof — just the screen, the breeze, and the stars above Harar.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4M7.5 9.5l2 1.5-2 1.5v-3zM12 9.5l2 1.5-2 1.5v-3zM16.5 9.5l2 1.5-2 1.5v-3z" /></svg>
    ),
  },
  {
    title: 'Great Company',
    text: 'Around one hundred movie lovers gathered together — bring friends, meet neighbors, share the night.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 8.5a2.6 2.6 0 1 1 2.5 3.4M17.5 14.3c1.4.7 2.4 2.1 2.8 4.2" /></svg>
    ),
  },
  {
    title: 'Free Snack',
    text: 'Every ticket includes a free snack — settle in, munch away, and enjoy the show.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10h10l-1.5 9.5a1 1 0 0 1-1 .5h-5a1 1 0 0 1-1-.5L7 10z" /><path d="M8 10l1.5-5h5L16 10M12 5V3M9.5 5.5 8.7 3.7M14.5 5.5l.8-1.8" /></svg>
    ),
  },
  {
    title: 'Night Atmosphere',
    text: 'String lights, cool night air, and the historic walls of Harar — a setting no indoor hall can match.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /><path d="M17 4.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6zM19.5 10.5l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4.4-1z" /></svg>
    ),
  },
];

export function Experience() {
  return (
    <section id="experience" className="scroll-mt-20 bg-ink-950 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          dark
          eyebrow="The Experience"
          title="More than a movie —"
          accent="a night out."
          description="Everything that makes an open-air screening in Harar unforgettable."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4 lg:gap-5">
          {CARDS.map((card, i) => (
            <Reveal key={card.title} delayMs={i * 70}>
              <article className="group h-full rounded-3xl bg-cream-50/[0.06] p-6 ring-1 ring-cream-50/12 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:bg-cream-50/[0.09] hover:ring-gold-400/40">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-wine-600 text-cream-50 shadow-lg transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
                  {card.icon}
                </span>
                <h3 className="mt-5 font-display text-xl font-black text-cream-50">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-cream-100/70">{card.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
