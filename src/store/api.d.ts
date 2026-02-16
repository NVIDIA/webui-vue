import type { AxiosRequestConfig, AxiosResponse } from 'axios';

interface ApiInstance {
  get<T = unknown>(path: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  delete<T = unknown>(path: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  post<T = unknown>(path: string, payload?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  patch<T = unknown>(path: string, payload?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  put<T = unknown>(path: string, payload?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  all<T>(promises: Promise<T>[]): Promise<T[]>;
  allSettled<T>(promises: Promise<T>[]): Promise<PromiseSettledResult<T>[]>;
  spread<T, R>(callback: (...args: T[]) => R): (array: T[]) => R;
  set_auth_token(token: string | null | undefined): void;
  resetApiState(): void;
}

declare const api: ApiInstance;
export default api;

export declare function getResponseCount(responses: unknown[]): {
  successCount: number;
  errorCount: number;
};

export declare function isPasswordExpired(data: unknown): boolean;

export declare function findMessageId(
  data: unknown,
  key: string,
  registry?: string,
): Record<string, unknown> | undefined;
