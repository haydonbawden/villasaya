import { AppScreen, PlaceholderSection } from '@/components/ui';

function TemplateLibraryScreen() {
  return (
    <AppScreen subtitle="Reusable SOPs for villa routines" title="Workflow templates">
      <PlaceholderSection
        description="Guest check-in, deep cleaning, maintenance rounds"
        items={[
          { subtitle: 'Pre-arrival to handover', title: 'Guest check-in' },
          { subtitle: 'Quarterly task set', title: 'Deep clean' },
          { subtitle: 'Weekly water tests', title: 'Pool maintenance' },
        ]}
        title="Templates"
      />
    </AppScreen>
  );
}

export default TemplateLibraryScreen;
