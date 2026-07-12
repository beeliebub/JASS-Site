"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { AddButton } from "@/components/admin/list-controls";
import { BlockShell } from "@/components/blocks/block-shell";
import {
  ADDABLE_BLOCK_TYPES,
  blockComponents,
  blockTypeLabels,
  defaultBlockData,
  type ClientBlock,
  type ReferenceData,
} from "@/components/blocks/registry";

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

/**
 * Client-owned list of a Page's Blocks -- the analogue of
 * RulesEditor/FeaturesEditor's list state, one level up. Renders bare
 * content for visitors/non-edit-mode admins; in edit mode, wraps each block
 * in BlockShell (reorder/delete) and offers an "Add block" picker below the
 * last one.
 */
export function PageBlocks({
  pageId,
  initialBlocks,
  referenceData,
}: {
  pageId: string;
  initialBlocks: ClientBlock[];
  referenceData: ReferenceData;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const showChrome = isAdmin && editMode;

  async function saveBlockData(id: string, data: unknown) {
    const previous = blocks;
    setBlocks((prev) => prev.map((blk) => (blk.id === id ? { ...blk, data } : blk)));

    try {
      const res = await fetch(`/api/blocks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to save block."));
    } catch (error) {
      setBlocks(previous);
      showError(error instanceof Error ? error.message : "Failed to save block.");
      throw error;
    }
  }

  async function moveBlock(id: string, direction: -1 | 1) {
    const idx = sorted.findIndex((b) => b.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];
    const previous = blocks;

    setBlocks((prev) =>
      prev.map((blk) => {
        if (blk.id === a.id) return { ...blk, order: b.order };
        if (blk.id === b.id) return { ...blk, order: a.order };
        return blk;
      }),
    );

    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/blocks/${a.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: b.order }),
        }),
        fetch(`/api/blocks/${b.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: a.order }),
        }),
      ]);
      if (!resA.ok || !resB.ok) throw new Error("Failed to reorder blocks.");
    } catch (error) {
      setBlocks(previous);
      showError(error instanceof Error ? error.message : "Failed to reorder blocks.");
    }
  }

  async function deleteBlock(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this block?")) return;
    const previous = blocks;
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    try {
      const res = await fetch(`/api/blocks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete block."));
    } catch (error) {
      setBlocks(previous);
      showError(error instanceof Error ? error.message : "Failed to delete block.");
    }
  }

  async function addBlock(type: (typeof ADDABLE_BLOCK_TYPES)[number]) {
    setAdding(true);
    const nextOrder = blocks.length ? Math.max(...blocks.map((b) => b.order)) + 1 : 0;
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, type, order: nextOrder, data: defaultBlockData[type] }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to add block."));
      const { data } = (await res.json()) as { data: { id: string; order: number } };
      setBlocks((prev) => [...prev, { id: data.id, type, order: data.order, data: defaultBlockData[type] }]);
      setPickerOpen(false);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to add block.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex flex-col">
      {sorted.map((block, i) => {
        const Renderer = blockComponents[block.type];
        return (
          <BlockShell
            key={block.id}
            label={blockTypeLabels[block.type]}
            canMoveUp={i > 0}
            canMoveDown={i < sorted.length - 1}
            onMoveUp={() => moveBlock(block.id, -1)}
            onMoveDown={() => moveBlock(block.id, 1)}
            onDelete={() => deleteBlock(block.id)}
          >
            <Renderer block={block} referenceData={referenceData} onSaveData={(next) => saveBlockData(block.id, next)} />
          </BlockShell>
        );
      })}

      {showChrome && (
        <div className="px-4 py-6 sm:px-6">
          {pickerOpen ? (
            <div className="flex max-w-2xl flex-wrap items-center gap-2 rounded-lg border border-dashed border-primary/60 bg-surface p-4">
              {ADDABLE_BLOCK_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addBlock(type)}
                  disabled={adding}
                  className="flex h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {blockTypeLabels[type]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                disabled={adding}
                className="flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-muted transition hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <AddButton onClick={() => setPickerOpen(true)}>Add block</AddButton>
          )}
        </div>
      )}
    </div>
  );
}
