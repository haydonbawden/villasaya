import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function MediaCaptureScreen() {
  return (
    <AppScreen subtitle="Take photos or videos for incident reports" title="Capture media">
      <PlaceholderSection
        action={<AppButton>Open camera</AppButton>}
        description="Supports offline capture and upload queue"
        items={[{ subtitle: 'Photo attached', title: 'Latest capture' }]}
        title="Camera"
      />
    </AppScreen>
  );
}

export default MediaCaptureScreen;
