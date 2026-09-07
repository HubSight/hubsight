/**
 * Pure TypeScript WebAuthn / Passkey client-side helpers.
 * Handles binary ArrayBuffer <-> Base64URL transformation for navigator.credentials.
 */

export const isPasskeySupported = async (): Promise<boolean> => {
  if (
    typeof window === 'undefined' ||
    !window.PublicKeyCredential ||
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
  ) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

export const bufferToBase64Url = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

export const base64UrlToBuffer = (base64url: string): ArrayBuffer => {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Prepares server-returned creation options for navigator.credentials.create()
 */
export function prepareCreationOptions(serverOptions: any): CredentialCreationOptions {
  const opts = { ...serverOptions };
  if (typeof opts.challenge === 'string') {
    opts.challenge = base64UrlToBuffer(opts.challenge);
  }
  if (opts.user && typeof opts.user.id === 'string') {
    opts.user = {
      ...opts.user,
      id: base64UrlToBuffer(opts.user.id),
    };
  }
  if (Array.isArray(opts.excludeCredentials)) {
    opts.excludeCredentials = opts.excludeCredentials.map((cred: any) => ({
      ...cred,
      id: typeof cred.id === 'string' ? base64UrlToBuffer(cred.id) : cred.id,
    }));
  }
  return { publicKey: opts };
}

/**
 * Converts a newly registered PublicKeyCredential into JSON for server verification
 */
export function serializeCreationResponse(credential: PublicKeyCredential): string {
  const response = credential.response as AuthenticatorAttestationResponse;
  const transports =
    typeof response.getTransports === 'function' ? response.getTransports() : [];

  const raw = {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
      transports,
    },
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
  };

  return JSON.stringify(raw);
}

/**
 * Prepares server-returned request options for navigator.credentials.get()
 */
export function prepareRequestOptions(serverOptions: any): CredentialRequestOptions {
  const opts = { ...serverOptions };
  if (typeof opts.challenge === 'string') {
    opts.challenge = base64UrlToBuffer(opts.challenge);
  }
  if (Array.isArray(opts.allowCredentials)) {
    opts.allowCredentials = opts.allowCredentials.map((cred: any) => ({
      ...cred,
      id: typeof cred.id === 'string' ? base64UrlToBuffer(cred.id) : cred.id,
    }));
  }
  return { publicKey: opts };
}

/**
 * Converts an assertion PublicKeyCredential into JSON for server verification
 */
export function serializeRequestResponse(credential: PublicKeyCredential): string {
  const response = credential.response as AuthenticatorAssertionResponse;

  const raw = {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
      userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
  };

  return JSON.stringify(raw);
}
