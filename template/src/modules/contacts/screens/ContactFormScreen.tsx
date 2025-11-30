import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function ContactFormScreen() {
  return (
    <AppScreen subtitle="Shared villa directory" title="Add/edit contact">
      <PlaceholderSection
        action={<AppButton>Save contact</AppButton>}
        description="Name, phone, email, and role"
        items={[{ subtitle: 'Contractor / Supplier / Emergency', title: 'Type' }]}
        title="Contact form"
      />
    </AppScreen>
  );
}

export default ContactFormScreen;
