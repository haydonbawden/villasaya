import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function ConfigurationWizardScreen() {
  return (
    <AppScreen subtitle="Configure villa, invite staff, and enable notifications" title="First-time setup">
      <PlaceholderSection
        action={<AppButton>Launch wizard</AppButton>}
        description="Walk through the required onboarding tasks"
        items={[
          { subtitle: 'Address, timezone, landlord and manager', title: 'Add villa details' },
          { subtitle: 'Send SMS/email invites', title: 'Invite staff' },
          { subtitle: 'Default shifts and holidays', title: 'Set roster rules' },
          { subtitle: 'Create role-based channels', title: 'Configure chat' },
        ]}
        title="Setup checklist"
      />
    </AppScreen>
  );
}

export default ConfigurationWizardScreen;
