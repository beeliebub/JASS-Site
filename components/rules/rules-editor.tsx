"use client";

import { useState } from "react";
import type { Rule, RuleSection } from "@/app/generated/prisma/client";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { RuleSectionBlock } from "@/components/rules/rule-section";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";

type SectionWithRules = RuleSection & { rules: Rule[] };
type Field = "title" | "description";

export type RuleListData = Record<string, never>;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function withStartIndices(sections: SectionWithRules[]) {
  const result: { section: SectionWithRules; startIndex: number }[] = [];
  let running = 1;
  for (const section of sections) {
    result.push({ section, startIndex: running });
    running += section.rules.length;
  }
  return result;
}

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function RulesEditor({
  initialSections,
  blockId,
}: {
  initialSections: SectionWithRules[];
  blockId: string;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [sections, setSections] = useState(initialSections);
  const [addingSection, setAddingSection] = useState(false);

  if (!isAdmin || !editMode) {
    const withIndices = withStartIndices(sections);
    return (
      <div className="flex flex-col gap-10 sm:gap-14">
        {withIndices.map(({ section, startIndex }) => (
          <RuleSectionBlock key={section.id} section={section} startIndex={startIndex} />
        ))}
      </div>
    );
  }

  async function saveSectionField(id: string, field: Field, value: string) {
    const res = await fetch(`/api/rule-sections/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to save section."));
  }

  async function saveRuleField(id: string, field: Field, value: string) {
    const res = await fetch(`/api/rules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to save rule."));
  }

  async function addSection() {
    setAddingSection(true);
    const nextOrder = sections.length ? Math.max(...sections.map((s) => s.order)) + 1 : 0;
    try {
      const res = await fetch("/api/rule-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId,
          order: nextOrder,
          title: "New section",
          description: "Describe this section.",
        }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to add section."));
      const { data } = (await res.json()) as { data: RuleSection };
      setSections((prev) => [...prev, { ...data, rules: [] }]);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to add section.");
    } finally {
      setAddingSection(false);
    }
  }

  async function deleteSection(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this rule section and all its rules?")) return;

    const previous = sections;
    setSections((prev) => prev.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/rule-sections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete section."));
    } catch (error) {
      setSections(previous);
      showError(error instanceof Error ? error.message : "Failed to delete section.");
    }
  }

  async function moveSection(id: string, direction: -1 | 1) {
    const idx = sections.findIndex((s) => s.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= sections.length) return;

    const a = sections[idx];
    const b = sections[swapIdx];
    const previous = sections;

    const next = [...sections];
    next[idx] = { ...b, order: a.order };
    next[swapIdx] = { ...a, order: b.order };
    next.sort((x, y) => x.order - y.order);
    setSections(next);

    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/rule-sections/${a.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: b.order }),
        }),
        fetch(`/api/rule-sections/${b.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: a.order }),
        }),
      ]);
      if (!resA.ok || !resB.ok) throw new Error("Failed to reorder sections.");
    } catch (error) {
      setSections(previous);
      showError(error instanceof Error ? error.message : "Failed to reorder sections.");
    }
  }

  async function addRule(sectionId: string) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const nextOrder = section.rules.length ? Math.max(...section.rules.map((r) => r.order)) + 1 : 0;

    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, order: nextOrder, title: "New rule", description: "Describe this rule." }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to add rule."));
      const { data } = (await res.json()) as { data: Rule };
      setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, rules: [...s.rules, data] } : s)));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to add rule.");
    }
  }

  async function deleteRule(sectionId: string, ruleId: string) {
    const previous = sections;
    setSections((prev) =>
      prev.map((s) => (s.id === sectionId ? { ...s, rules: s.rules.filter((r) => r.id !== ruleId) } : s)),
    );
    try {
      const res = await fetch(`/api/rules/${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete rule."));
    } catch (error) {
      setSections(previous);
      showError(error instanceof Error ? error.message : "Failed to delete rule.");
    }
  }

  async function moveRule(sectionId: string, ruleId: string, direction: -1 | 1) {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;
    const idx = section.rules.findIndex((r) => r.id === ruleId);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= section.rules.length) return;

    const a = section.rules[idx];
    const b = section.rules[swapIdx];
    const previous = sections;

    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const rules = [...s.rules];
        rules[idx] = { ...b, order: a.order };
        rules[swapIdx] = { ...a, order: b.order };
        rules.sort((x, y) => x.order - y.order);
        return { ...s, rules };
      }),
    );

    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/rules/${a.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: b.order }),
        }),
        fetch(`/api/rules/${b.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: a.order }),
        }),
      ]);
      if (!resA.ok || !resB.ok) throw new Error("Failed to reorder rules.");
    } catch (error) {
      setSections(previous);
      showError(error instanceof Error ? error.message : "Failed to reorder rules.");
    }
  }

  const withIndices = withStartIndices(sections);

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      {withIndices.map(({ section, startIndex }, sectionIdx) => (
        <section key={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-24">
          <div className="mb-4 flex items-start justify-between gap-4 sm:mb-5">
            <div className="min-w-0 flex-1">
              <EditableText
                as="h2"
                value={section.title}
                onSave={(v) => saveSectionField(section.id, "title", v)}
                label={`rule section ${sectionIdx + 1} title`}
                className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
              />
              <EditableText
                as="p"
                value={section.description}
                onSave={(v) => saveSectionField(section.id, "description", v)}
                label={`rule section ${sectionIdx + 1} description`}
                className="mt-1 block text-sm text-muted"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1 pt-0.5">
              <MoveUpButton disabled={sectionIdx === 0} onClick={() => moveSection(section.id, -1)} />
              <MoveDownButton
                disabled={sectionIdx === sections.length - 1}
                onClick={() => moveSection(section.id, 1)}
              />
              <DeleteButton label="Delete section" onClick={() => deleteSection(section.id)} />
            </div>
          </div>

          <ol className="divide-y divide-border rounded-md border border-border bg-surface">
            {section.rules.map((rule, i) => (
              <li key={rule.id} className="flex gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-5">
                <span aria-hidden className="shrink-0 font-mono text-sm text-primary sm:text-base">
                  {pad(startIndex + i)}
                </span>
                <div className="min-w-0 flex-1">
                  <EditableText
                    as="h3"
                    value={rule.title}
                    onSave={(v) => saveRuleField(rule.id, "title", v)}
                    label={`rule ${startIndex + i} title`}
                    className="block font-medium text-foreground sm:text-lg"
                  />
                  <EditableText
                    as="p"
                    multiline
                    value={rule.description}
                    onSave={(v) => saveRuleField(rule.id, "description", v)}
                    label={`rule ${startIndex + i} description`}
                    className="mt-1 block text-sm leading-relaxed text-muted break-words"
                  />
                </div>
                <div className="flex shrink-0 items-start gap-1">
                  <MoveUpButton disabled={i === 0} onClick={() => moveRule(section.id, rule.id, -1)} />
                  <MoveDownButton
                    disabled={i === section.rules.length - 1}
                    onClick={() => moveRule(section.id, rule.id, 1)}
                  />
                  <DeleteButton label="Delete rule" onClick={() => deleteRule(section.id, rule.id)} />
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-3">
            <AddButton onClick={() => addRule(section.id)}>Add rule</AddButton>
          </div>
        </section>
      ))}

      <AddButton onClick={addSection} disabled={addingSection}>
        Add rule section
      </AddButton>
    </div>
  );
}
