import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function PhotoUploaderScreen() {
  return (
    <AppScreen subtitle="Require visual confirmation for QA" title="Completion photos">
      <PlaceholderSection
        action={<AppButton>Upload media</AppButton>}
        description="Capture or attach photos/videos"
        items={[{ subtitle: 'At least 1 photo', title: 'Required' }]}
        title="Upload options"
      />
    </AppScreen>
  );
}

export default PhotoUploaderScreen;
