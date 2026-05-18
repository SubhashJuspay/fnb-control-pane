// Sunmi InnerPrinter callback interface. Most print operations are async;
// the service reports success/failure via the methods below. Sourced from
// Sunmi's public InnerPrinter documentation.
package woyou.aidlservice.jiuiv5;

interface ICallback {
    void onRunResult(boolean isSuccess);
    void onReturnString(String result);
    void onRaiseException(int code, String msg);
    void onPrintResult(int code, String msg);
}
