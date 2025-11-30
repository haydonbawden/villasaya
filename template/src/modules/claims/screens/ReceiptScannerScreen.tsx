import { useCallback } from 'react';

import { AppButton, AppScreen, PlaceholderSection } from '@/components/ui';

import { simulateReceiptScan } from '@/utils/ocr';

function ReceiptScannerScreen() {
  const handleScan = useCallback(() => {
    void simulateReceiptScan('camera');
  }, []);

  return (
    <AppScreen subtitle="OCR extraction preview" title="Receipt scanner">
      <PlaceholderSection
        action={<AppButton onPress={handleScan}>Capture</AppButton>}
        description="Real-time extraction of date, merchant, category, and amount"
        items={[{ subtitle: 'Demo Market - IDR 125,000', title: 'Last scan' }]}
        title="Preview"
      />
    </AppScreen>
  );
}

export default ReceiptScannerScreen;
