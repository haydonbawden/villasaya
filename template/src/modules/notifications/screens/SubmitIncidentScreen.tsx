import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function SubmitIncidentScreen() {
  return (
    <AppScreen subtitle="Capture issues with media and severity" title="Report incident">
      <PlaceholderSection
        action={<AppButton>Submit report</AppButton>}
        description="Upload photos/videos and select severity"
        items={[{ subtitle: 'Select Low/Medium/High/Critical', title: 'Severity' }]}
        title="New incident"
      />
    </AppScreen>
  );
}

export default SubmitIncidentScreen;
