import { MetadataField } from "./MetadataField";

interface VideoDetailsPanelProps {
  videoId: string;
  isOwner: boolean;
  description: string | null;
  targetAudience: string | null;
  hook: string | null;
  takeaway1: string | null;
  takeaway2: string | null;
  takeaway3: string | null;
  primaryCta: string | null;
  outro: string | null;
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
  description,
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

      <Section title="Overview">
        <MetadataField
          videoId={videoId}
          field="description"
          initialValue={description}
          isOwner={isOwner}
          label="Description"
          placeholder="Add a description…"
          multiline
          maxLength={2000}
        />
      </Section>

      <Section title="Audience & Positioning">
        <MetadataField
          videoId={videoId}
          field="targetAudience"
          initialValue={targetAudience}
          isOwner={isOwner}
          label="Target Audience"
          placeholder="e.g. Junior React developers building their first SaaS"
          maxLength={200}
        />
        <MetadataField
          videoId={videoId}
          field="hook"
          initialValue={hook}
          isOwner={isOwner}
          label="Hook"
          placeholder="The opening line that earns the next 10 seconds"
          multiline
          maxLength={500}
        />
      </Section>

      <Section title="Value Delivery">
        <MetadataField
          videoId={videoId}
          field="takeaway1"
          initialValue={takeaway1}
          isOwner={isOwner}
          label="Takeaway 1"
          placeholder="Add takeaway 1…"
          maxLength={200}
        />
        <MetadataField
          videoId={videoId}
          field="takeaway2"
          initialValue={takeaway2}
          isOwner={isOwner}
          label="Takeaway 2"
          placeholder="Add takeaway 2…"
          maxLength={200}
        />
        <MetadataField
          videoId={videoId}
          field="takeaway3"
          initialValue={takeaway3}
          isOwner={isOwner}
          label="Takeaway 3"
          placeholder="Add takeaway 3…"
          maxLength={200}
        />
        <MetadataField
          videoId={videoId}
          field="primaryCta"
          initialValue={primaryCta}
          isOwner={isOwner}
          label="Primary CTA"
          placeholder="e.g. Subscribe for the full course"
          maxLength={200}
        />
      </Section>

      <Section title="Closing">
        <MetadataField
          videoId={videoId}
          field="outro"
          initialValue={outro}
          isOwner={isOwner}
          label="Outro"
          placeholder="How the video wraps and what viewers do next"
          multiline
          maxLength={500}
        />
      </Section>
    </div>
  );
}
