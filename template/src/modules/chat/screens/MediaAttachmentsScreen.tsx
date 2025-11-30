import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function MediaAttachmentsScreen() {
  return (
    <AppScreen subtitle="Photos, files, and quick tasks" title="Media attachments">
      <PlaceholderSection
        action={<AppButton>Attach file</AppButton>}
        description="Share photos, documents, and task links"
        items={[{ subtitle: 'Shared in Maintenance channel', title: 'Pump manual.pdf' }]}
        title="Attachments"
      />
    </AppScreen>
  );
}

export default MediaAttachmentsScreen;
