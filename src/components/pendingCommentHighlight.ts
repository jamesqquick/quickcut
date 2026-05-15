import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const PENDING_HIGHLIGHT_CLASS =
  "rounded bg-accent-warning/15 px-0.5 text-text-primary decoration-accent-warning/70 underline decoration-dashed decoration-2 underline-offset-2";

export interface PendingRange {
  from: number;
  to: number;
}

interface PendingMeta {
  range: PendingRange | null;
}

export const pendingCommentHighlightKey = new PluginKey<DecorationSet>("pendingCommentHighlight");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pendingCommentHighlight: {
      setPendingCommentRange: (range: PendingRange | null) => ReturnType;
    };
  }
}

export const PendingCommentHighlight = Extension.create({
  name: "pendingCommentHighlight",

  addCommands() {
    return {
      setPendingCommentRange:
        (range) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const meta: PendingMeta = { range };
            dispatch(tr.setMeta(pendingCommentHighlightKey, meta));
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: pendingCommentHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, current) {
            const meta = tr.getMeta(pendingCommentHighlightKey) as PendingMeta | undefined;

            if (meta) {
              if (!meta.range) return DecorationSet.empty;
              const { from, to } = meta.range;
              if (from === to) return DecorationSet.empty;
              const decoration = Decoration.inline(from, to, {
                class: PENDING_HIGHLIGHT_CLASS,
              });
              return DecorationSet.create(tr.doc, [decoration]);
            }

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
