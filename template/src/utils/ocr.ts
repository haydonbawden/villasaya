export type OcrResult = {
  readonly amount?: number;
  readonly currency?: string;
  readonly date?: string;
  readonly merchant?: string;
};

export function simulateReceiptScan(fileUri: string): Promise<OcrResult> {
  return Promise.resolve({
    amount: 125_000,
    currency: 'IDR',
    date: new Date().toISOString(),
    fileUri,
    merchant: 'Demo Market',
  });
}
