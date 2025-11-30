import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

function PdfExportScreen() {
  return (
    <AppScreen subtitle="Share reports with stakeholders" title="PDF export">
      <PlaceholderSection
        action={<AppButton>Generate PDF</AppButton>}
        description="Send via email or save to device"
        items={[{ subtitle: 'Landlord, Manager', title: 'Recipients' }]}
        title="Export"
      />
    </AppScreen>
  );
}

export default PdfExportScreen;
