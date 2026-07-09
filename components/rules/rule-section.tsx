import type { Rule, RuleSection } from "@/app/generated/prisma/client";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function RuleSectionBlock({
  section,
  startIndex,
}: {
  section: RuleSection & { rules: Rule[] };
  startIndex: number;
}) {
  return (
    <section aria-labelledby={`${section.id}-heading`} className="scroll-mt-24">
      <div className="mb-4 sm:mb-5">
        <h2
          id={`${section.id}-heading`}
          className="text-xl font-semibold tracking-tight text-balance text-foreground sm:text-2xl"
        >
          {section.title}
        </h2>
        <p className="mt-1 text-sm text-pretty text-muted">{section.description}</p>
      </div>

      <ol className="divide-y divide-border rounded-md border border-border bg-surface">
        {section.rules.map((rule, i) => (
          <li key={rule.id} className="flex gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-5">
            <span
              aria-hidden
              className="shrink-0 font-mono text-sm text-primary sm:text-base"
            >
              {pad(startIndex + i)}
            </span>
            <div className="min-w-0">
              <h3 className="font-medium text-balance text-foreground sm:text-lg">{rule.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-pretty text-muted break-words">
                {rule.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
