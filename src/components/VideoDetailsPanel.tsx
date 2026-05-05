import { InlineEditor, type InlineEditorField } from "./InlineEditor";

interface VideoDetailsPanelProps {
  videoId: string;
  isOwner: boolean;
  targetAudience: string | null;
  hook: string | null;
  takeaway1: string | null;
  takeaway2: string | null;
  takeaway3: string | null;
  primaryCta: string | null;
  outro: string | null;
}

interface FieldRowProps {
  label: string;
  field: InlineEditorField;
  videoId: string;
  isOwner: boolean;
  value: string | null;
  placeholder: string;
  multiline?: boolean;
  maxLength: number;
}

function FieldRow({
  label,
  field,
  videoId,
  isOwner,
  value,
  placeholder,
  multiline,
  maxLength,
}: FieldRowProps) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <InlineEditor
        value={value ?? ""}
        field={field}
        videoId={videoId}
        isOwner={isOwner}
        placeholder={placeholder}
        multiline={multiline}
        maxLength={maxLength}
        className={
          multiline
            ? "max-w-2xl break-words text-sm text-text-secondary"
            : "max-w-2xl break-words text-sm text-text-primary"
        }
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      <div className="space-y-5 rounded-2xl border border-border-default bg-bg-secondary p-5 sm:p-6">
        {children}
      </div>
    </section>
  );
}

export function VideoDetailsPanel({
  videoId,
  isOwner,
  targetAudience,
  hook,
  takeaway1,
  takeaway2,
  takeaway3,
  primaryCta,
  outro,
}: VideoDetailsPanelProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-text-secondary">
        Document your video&apos;s intent. These notes guide your script and
        review.
      </p>

      <Section title="Audience & Positioning">
        <FieldRow
          label="Target Audience"
          field="targetAudience"
          videoId={videoId}
          isOwner={isOwner}
          value={targetAudience}
          placeholder="e.g. Junior React developers building their first SaaS"
          maxLength={200}
        />
        <FieldRow
          label="Hook"
          field="hook"
          videoId={videoId}
          isOwner={isOwner}
          value={hook}
          placeholder="The opening line that earns the next 10 seconds"
          multiline
          maxLength={500}
        />
      </Section>

      <Section title="Value Delivery">
        <FieldRow
          label="Takeaway 1"
          field="takeaway1"
          videoId={videoId}
          isOwner={isOwner}
          value={takeaway1}
          placeholder="Add takeaway 1…"
          maxLength={200}
        />
        <FieldRow
          label="Takeaway 2"
          field="takeaway2"
          videoId={videoId}
          isOwner={isOwner}
          value={takeaway2}
          placeholder="Add takeaway 2…"
          maxLength={200}
        />
        <FieldRow
          label="Takeaway 3"
          field="takeaway3"
          videoId={videoId}
          isOwner={isOwner}
          value={takeaway3}
          placeholder="Add takeaway 3…"
          maxLength={200}
        />
        <FieldRow
          label="Primary CTA"
          field="primaryCta"
          videoId={videoId}
          isOwner={isOwner}
          value={primaryCta}
          placeholder="e.g. Subscribe for the full course"
          maxLength={200}
        />
      </Section>

      <Section title="Closing">
        <FieldRow
          label="Outro"
          field="outro"
          videoId={videoId}
          isOwner={isOwner}
          value={outro}
          placeholder="How the video wraps and what viewers do next"
          multiline
          maxLength={500}
        />
      </Section>
    </div>
  );
}
