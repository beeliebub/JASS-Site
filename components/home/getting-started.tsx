import { Container } from "@/components/container";
import { siteConfig } from "@/lib/site-config";

const steps = [
  {
    number: "01",
    title: "Copy the server address",
    description: `Grab ${siteConfig.ip} from the box above.`,
  },
  {
    number: "02",
    title: "Open Minecraft: Java Edition",
    description: "Head to Multiplayer, then Add Server.",
  },
  {
    number: "03",
    title: "Paste the address and join",
    description: "You'll land in spawn — no whitelist, no waiting.",
  },
];

export function GettingStarted() {
  return (
    <section>
      <Container className="py-16 sm:py-20">
        <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Getting started</h2>
        <ol className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {steps.map((step) => (
            <li key={step.number} className="flex flex-col gap-2">
              <span className="font-mono text-sm text-primary">{step.number}</span>
              <span className="text-base font-semibold text-balance text-foreground">{step.title}</span>
              <span className="text-sm text-pretty text-muted">{step.description}</span>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
