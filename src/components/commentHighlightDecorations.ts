import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const SAVED_HIGHLIGHT_CLASS =
  "rounded bg-accent-warning/25 px-0.5 text-text-primary decoration-accent-warning underline decoration-2 underline-offset-2";

export interface CommentHighlightItem {
  id: string;
  from: number;
  to: number;
  quote: string;
}

interface CommentHighlightMeta {
  items: CommentHighlightItem[];
}

export const commentHighlightDecorationsKey = new PluginKey<DecorationSet>("commentHighlightDecorations");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentHighlightDecorations: {
      setCommentHighlights: (items: CommentHighlightItem[]) => ReturnType;
    };
  }
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function findQuoteRange(doc: PMNode, quote: string): { from: number; to: number } | null {
  const target = normalize(quote);
  if (!target) return null;

  let found: { from: number; to: number } | null = null;

  doc.descendants((node, pos) => {
    if (found) return false;
    if (!node.isText || !node.text) return true;

    const text = node.text;
    const normalizedText = normalize(text);
    const idx = normalizedText.indexOf(target);
    if (idx === -1) return true;

    let consumed = 0;
    let rawStart = -1;
    let rawEnd = -1;
    let prevWasSpace = true;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      const isSpace = /\s/.test(ch);
      const normalizedChar = isSpace ? (prevWasSpace ? "" : " ") : ch;
      if (normalizedChar) {
        if (consumed === idx && rawStart === -1) rawStart = i;
        consumed++;
        if (consumed === idx + target.length) {
          rawEnd = i + 1;
          break;
        }
      }
      prevWasSpace = isSpace;
    }

    if (rawStart === -1 || rawEnd === -1) return true;
    found = { from: pos + rawStart, to: pos + rawEnd };
    return false;
  });

  return found;
}

function buildDecorations(doc: PMNode, items: CommentHighlightItem[]): DecorationSet {
  const decorations: Decoration[] = [];

  for (const item of items) {
    const docSize = doc.content.size;
    let from = item.from;
    let to = item.to;

    const inBounds = from >= 0 && to <= docSize && from < to;
    const matches =
      inBounds && normalize(doc.textBetween(from, to, " ")) === normalize(item.quote);

    if (!matches) {
      const recovered = findQuoteRange(doc, item.quote);
      if (!recovered) continue;
      from = recovered.from;
      to = recovered.to;
    }

    decorations.push(
      Decoration.inline(from, to, {
        class: SAVED_HIGHLIGHT_CLASS,
        "data-comment-id": item.id,
      }),
    );
  }

  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

export const CommentHighlightDecorations = Extension.create({
  name: "commentHighlightDecorations",

  addStorage() {
    return {
      items: [] as CommentHighlightItem[],
    };
  },

  addCommands() {
    return {
      setCommentHighlights:
        (items) =>
        ({ tr, dispatch, editor }) => {
          const storage = (editor.storage as unknown as Record<string, { items: CommentHighlightItem[] } | undefined>)[
            "commentHighlightDecorations"
          ];
          if (storage) storage.items = items;
          if (dispatch) {
            const meta: CommentHighlightMeta = { items };
            dispatch(tr.setMeta(commentHighlightDecorationsKey, meta));
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage as { items: CommentHighlightItem[] };
    return [
      new Plugin<DecorationSet>({
        key: commentHighlightDecorationsKey,
        state: {
          init: (_, state) => buildDecorations(state.doc, storage.items),
          apply(tr, current) {
            const meta = tr.getMeta(commentHighlightDecorationsKey) as
              | CommentHighlightMeta
              | undefined;

            if (meta) return buildDecorations(tr.doc, meta.items);
            if (!tr.docChanged) return current;
            return current.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
