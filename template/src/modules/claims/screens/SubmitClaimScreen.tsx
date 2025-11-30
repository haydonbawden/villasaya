import { useCallback } from 'react';

import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

import { simulateReceiptScan } from '@/utils/ocr';

function SubmitClaimScreen() {
  const handleScan = useCallback(() => {
    void simulateReceiptScan('local-file');
  }, []);

  return (
    <AppScreen subtitle="OCR-assisted receipt capture" title="Submit claim">
      <PlaceholderSection
        action={<AppButton onPress={handleScan}>Scan receipt</AppButton>}
        description="Attach image and auto-extract merchant, date, and amount"
        items={[{ subtitle: 'Demo Market (OCR)', title: 'Merchant' }]}
        title="Receipt"
      />
    </AppScreen>
  );
}

export default SubmitClaimScreen;
