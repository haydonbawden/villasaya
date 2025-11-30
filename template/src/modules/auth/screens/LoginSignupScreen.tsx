import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function LoginSignupScreen() {
  return (
    <AppScreen subtitle="Secure access for every role" title="Login or Sign up">
      <PlaceholderSection
        action={<AppButton>Continue</AppButton>}
        description="Email/phone verification, passwordless links, and MFA-ready."
        title="Authentication"
      />
    </AppScreen>
  );
}

export default LoginSignupScreen;
