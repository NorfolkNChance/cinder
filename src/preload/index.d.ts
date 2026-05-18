export {};

declare global {
  interface Window {
    api: {
      app: {
        getVersion: () => Promise<string>;
      };
    };
  }
}
