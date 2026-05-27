const URL_REGEX = /https?:\/\/[^\s<>"']+[^\s<>"'.,:;!?)'"\]]/g;

type TextSegment = { type: "text"; value: string };
type LinkSegment = { type: "link"; value: string; href: string };
type Segment = TextSegment | LinkSegment;

function trimTrailingPunctuation(url: string): string {
  const openParens = (url.match(/\(/g) ?? []).length;
  const closeParens = (url.match(/\)/g) ?? []).length;
  if (openParens === closeParens) return url;
  return url.replace(/[.,:;!?)'"\]]+$/, "");
}

export function linkifyText(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const { index } = match;
    if (index === undefined) continue;

    const href = trimTrailingPunctuation(match[0]);

    if (index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, index) });
    }

    segments.push({ type: "link", value: href, href });
    lastIndex = index + href.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

export function LinkifiedText({ text }: { text: string }) {
  const segments = linkifyText(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "link" ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-primary underline break-all"
          >
            {seg.value}
          </a>
        ) : (
          seg.value
        )
      )}
    </>
  );
}
