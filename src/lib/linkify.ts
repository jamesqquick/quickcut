import React from "react";

const URL_REGEX = /https?:\/\/[^\s<>"']+[^\s<>"'.,:;!?)'"\]]/g;

type TextSegment = { type: "text"; value: string };
type LinkSegment = { type: "link"; value: string; href: string };
type Segment = TextSegment | LinkSegment;

export function linkifyText(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const { index } = match;
    if (index === undefined) continue;

    if (index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, index) });
    }

    segments.push({ type: "link", value: match[0], href: match[0] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

export function LinkifiedText({ text }: { text: string }) {
  const segments = linkifyText(text);

  return React.createElement(
    React.Fragment,
    null,
    ...segments.map((seg, i) =>
      seg.type === "link"
        ? React.createElement(
            "a",
            {
              key: i,
              href: seg.href,
              target: "_blank",
              rel: "noopener noreferrer",
              className: "text-accent-primary underline break-all",
            },
            seg.value
          )
        : React.createElement(React.Fragment, { key: i }, seg.value)
    )
  );
}
