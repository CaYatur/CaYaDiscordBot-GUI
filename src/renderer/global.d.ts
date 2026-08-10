import type { AppApi } from '../shared/contracts';

declare global {
  interface Window {
    caya: AppApi;
  }
}

export {};
