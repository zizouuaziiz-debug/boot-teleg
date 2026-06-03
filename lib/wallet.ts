// lib/wallet.ts
import { getTronWeb } from './tronweb';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'change-me-32-chars-secret-key!!';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const [ivHex, encrypted] = text.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY),
    Buffer.from(ivHex, 'hex')
  );
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function generateWallet() {
  const tronWeb = getTronWeb();
  const account = await tronWeb.createAccount();
  
  return {
    address: account.address.base58,
    privateKey: account.privateKey,
    publicKey: account.publicKey,
    encryptedPrivateKey: encrypt(account.privateKey),
  };
}

export function decryptPrivateKey(encrypted: string): string {
  return decrypt(encrypted);
}
