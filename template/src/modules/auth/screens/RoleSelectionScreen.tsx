import { AppScreen, PlaceholderSection } from '@/components/ui';

function RoleSelectionScreen() {
  return (
    <AppScreen subtitle="Tailor the experience for your responsibilities" title="Choose your role">
      <PlaceholderSection
        description="Tenant, staff, landlord, property manager, or contractor access."
        items={[
          { subtitle: 'Full villa control & approvals', title: 'Tenant' },
          { subtitle: 'Roster, tasks, attendance, expenses', title: 'Staff' },
          { subtitle: 'Lease, approvals, history', title: 'Landlord' },
          { subtitle: 'Oversee operations and documents', title: 'Manager' },
          { subtitle: 'Guest task access with limited chat', title: 'Contractor' },
        ]}
        title="Available roles"
      />
    </AppScreen>
  );
}

export default RoleSelectionScreen;
