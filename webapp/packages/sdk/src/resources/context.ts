import type { InternalHttpClient } from '../internal/http/types';

export type HttpLike = { readonly http: InternalHttpClient } | InternalHttpClient;

export function resolveHttpClient(target: HttpLike): InternalHttpClient {
  return 'http' in target ? target.http : target;
}
