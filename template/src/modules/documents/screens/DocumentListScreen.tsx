import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function DocumentListScreen() {
  return (
    <AppScreen subtitle="Vault with permissions per role" title="Documents">
      <PlaceholderSection
        action={<AppButton>Upload</AppButton>}
        description="Lease, manuals, emergency instructions"
        items={[
          { subtitle: 'Landlord uploaded', title: 'Lease 2024-2026.pdf' },
          { subtitle: 'Manager uploaded', title: 'Generator manual.pdf' },
        ]}
        title="Files"
      />
    </AppScreen>
  );
}

export default DocumentListScreen;
