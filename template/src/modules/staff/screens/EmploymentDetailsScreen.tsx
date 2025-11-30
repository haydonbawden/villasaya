import { AppScreen, PlaceholderSection } from '@/components/ui';

function EmploymentDetailsScreen() {
  return (
    <AppScreen subtitle="Terms, pay structure, and documents" title="Employment details">
      <PlaceholderSection
        description="Employment status, rate, and allowances"
        items={[
          { subtitle: 'Full-time | 6 days/week', title: 'Status' },
          { subtitle: 'IDR 4,000,000 monthly', title: 'Rate' },
          { subtitle: 'Meals, BPJS, transport', title: 'Benefits' },
        ]}
        title="Contract snapshot"
      />
    </AppScreen>
  );
}

export default EmploymentDetailsScreen;
