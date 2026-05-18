// Sunmi InnerPrinter service. Only the subset of methods we actually use
// for receipt printing is declared. Sunmi publishes the full AIDL in their
// developer docs — extend this file if you need barcode/QR/bitmap printing.
package woyou.aidlservice.jiuiv5;

import woyou.aidlservice.jiuiv5.ICallback;

interface IWoyouService {
    /** Reset printer state to defaults (font, size, alignment). */
    void printerInit(in ICallback callback);

    /** 0 = left, 1 = center, 2 = right. */
    void setAlignment(int alignment, in ICallback callback);

    /** Default size is 24px. Receipt body around 22-24, headers 28-32. */
    void setFontSize(float fontsize, in ICallback callback);

    /** Print a single string. Honour explicit `\n` for line breaks. */
    void printText(String text, in ICallback callback);

    /**
     * Multi-column print. Each entry in colsTextArr is one column; widths
     * are column widths summing to ~32 chars (58mm paper) or ~48 chars
     * (80mm paper). align is 0/1/2 per setAlignment.
     */
    void printColumnsText(
        in String[] colsTextArr,
        in int[] colsWidthArr,
        in int[] colsAlign,
        in ICallback callback
    );

    /** Advance paper by `n` lines without printing. */
    void lineWrap(int n, in ICallback callback);

    /** Cut paper. No-op on devices without a cutter. */
    void cutPaper(in ICallback callback);
}
