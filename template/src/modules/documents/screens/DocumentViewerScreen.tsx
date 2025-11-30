import { AppScreen, PlaceholderSection } from '@/components/ui';

function DocumentViewerScreen() {
  return (
    <AppScreen subtitle="Preview PDFs and images" title="Document viewer">
      <PlaceholderSection
        description="In-app preview with download option"
        items={[{ subtitle: 'Pages 1-12', title: 'Lease 2024-2026.pdf' }]}
        title="Viewer"
      />
    </AppScreen>
  );
}

export default DocumentViewerScreen;
