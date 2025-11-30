import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function UploadDocumentScreen() {
  return (
    <AppScreen subtitle="Categorize and set permissions" title="Upload document">
      <PlaceholderSection
        action={<AppButton>Upload file</AppButton>}
        description="Category folders and role-based access"
        items={[{ subtitle: 'Lease / Staff / Manuals / Emergency', title: 'Category' }]}
        title="Metadata"
      />
    </AppScreen>
  );
}

export default UploadDocumentScreen;
