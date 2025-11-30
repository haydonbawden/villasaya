import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function WelcomeScreen() {
  return (
    <AppScreen subtitle="Operational HQ for your villa" title="Welcome to VillaSaya">
      <PlaceholderSection
        action={<AppButton>Begin onboarding</AppButton>}
        description="Create an account, set your role, and invite your team."
        title="Get started"
      />
    </AppScreen>
  );
}

export default WelcomeScreen;
