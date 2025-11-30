import { AppScreen, PlaceholderSection } from '@/components/ui';

function DocumentCategoriesScreen() {
  return (
    <AppScreen subtitle="Organize leases, manuals, and instructions" title="Document categories">
      <PlaceholderSection
        items={[
          { subtitle: 'Signed contracts and addendums', title: 'Lease' },
          { subtitle: 'Employment agreements', title: 'Staff contracts' },
          { subtitle: 'Procedures and contacts', title: 'Emergency' },
        ]}
        title="Categories"
      />
    </AppScreen>
  );
}

export default DocumentCategoriesScreen;
