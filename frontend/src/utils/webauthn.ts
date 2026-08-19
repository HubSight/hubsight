/**
 * WebAuthn helper utilities for Platform Biometrics (Face ID, Touch ID, Fingerprint, Windows Hello, Device PIN)
 */

export const isPlatformAuthenticatorAvailable = async (): Promise<boolean> => {
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

const bufferToBase64Url = (buffer: ArrayBuffer): string => {
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

const base64UrlToBuffer = (base64url: string): ArrayBuffer => {
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
 * Registers a platform biometric credential (Passkey / Device Biometric)
 */
export const registerPlatformCredential = async (
  username: string,
  displayName: string
): Promise<string | null> => {
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn is not supported on this browser/device');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);

  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'CCTV Surveillance',
      id: window.location.hostname,
    },
    user: {
      id: userId,
      name: username,
      displayName: displayName || username,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' }, // ES256
      { alg: -257, type: 'public-key' }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };

  const credential = (await navigator.credentials.create({
    publicKey: publicKeyCredentialCreationOptions,
  })) as PublicKeyCredential | null;

  if (!credential) return null;

  return bufferToBase64Url(credential.rawId);
};

/**
 * Verifies the registered platform biometric credential
 */
export const verifyPlatformCredential = async (
  credentialId?: string | null
): Promise<boolean> => {
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn is not supported on this browser/device');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const allowCredentials: PublicKeyCredentialDescriptor[] = [];
  if (credentialId) {
    try {
      allowCredentials.push({
        id: base64UrlToBuffer(credentialId),
        type: 'public-key',
        transports: ['internal'],
      });
    } catch (e) {
      console.warn('Failed to parse credential ID, requesting any platform credential', e);
    }
  }

  const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: window.location.hostname,
    userVerification: 'required',
    timeout: 60000,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
  };

  const assertion = await navigator.credentials.get({
    publicKey: publicKeyCredentialRequestOptions,
  });

  return !!assertion;
};
