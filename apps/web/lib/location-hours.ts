// Re-export the shared opening-hours helpers so the web layer keeps a stable
// import path. The implementation lives in `@repo/types` so the API can use
// the same logic to reject `submitOnlineOrder` when a location is closed.
export * from '@repo/types';
