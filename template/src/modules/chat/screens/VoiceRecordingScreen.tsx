import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function VoiceRecordingScreen() {
  return (
    <AppScreen subtitle="Push-to-talk attachments" title="Voice message">
      <PlaceholderSection
        action={<AppButton>Record</AppButton>}
        description="Hold to record, release to send"
        items={[{ subtitle: '12s • unread by 2', title: 'Last clip' }]}
        title="Recorder"
      />
    </AppScreen>
  );
}

export default VoiceRecordingScreen;
