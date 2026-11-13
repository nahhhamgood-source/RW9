function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedBackupEnvelope {
  ascendEncryptedBackup: true;
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
}

export async function encryptBackupJson(plainJson: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plainJson)
  );
  const envelope: EncryptedBackupEnvelope = {
    ascendEncryptedBackup: true,
    version: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptBackupJson(rawText: string, passphrase: string): Promise<string> {
  const parsed = JSON.parse(rawText) as Partial<EncryptedBackupEnvelope>;
  if (!parsed.ascendEncryptedBackup || !parsed.salt || !parsed.iv || !parsed.ciphertext) {
    throw new Error('Invalid encrypted backup format.');
  }
  const salt = fromBase64(parsed.salt);
  const iv = fromBase64(parsed.iv);
  const cipher = fromBase64(parsed.ciphertext);
  const key = await deriveAesKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipher as BufferSource
  );
  return new TextDecoder().decode(decrypted);
}
