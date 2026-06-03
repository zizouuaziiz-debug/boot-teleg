// lib/tronweb.ts
import TronWeb from 'tronweb';

const TRON_FULL_NODE = process.env.TRON_FULL_NODE || 'https://api.trongrid.io';
const TRON_SOLIDITY_NODE = process.env.TRON_SOLIDITY_NODE || 'https://api.trongrid.io';
const TRON_EVENT_SERVER = process.env.TRON_EVENT_SERVER || 'https://api.trongrid.io';
const MASTER_PRIVATE_KEY = process.env.MASTER_PRIVATE_KEY || '';

let tronWebInstance: TronWeb | null = null;

// ✅ أضفنا privateKey parameter اختياري
export function getTronWeb(privateKey?: string): TronWeb {
  const key = privateKey || MASTER_PRIVATE_KEY;
  
  if (!privateKey && tronWebInstance) {
    return tronWebInstance;
  }
  
  const instance = new TronWeb({
    fullHost: TRON_FULL_NODE,
    solidityNode: TRON_SOLIDITY_NODE,
    eventServer: TRON_EVENT_SERVER,
    privateKey: key,
  });
  
  if (!privateKey) {
    tronWebInstance = instance;
  }
  
  return instance;
}

export function getReadOnlyTronWeb(): TronWeb {
  return new TronWeb({
    fullHost: TRON_FULL_NODE,
    solidityNode: TRON_SOLIDITY_NODE,
    eventServer: TRON_EVENT_SERVER,
  });
}

export const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

export function usdtToSun(amount: number): number {
  return Math.floor(amount * 1_000_000); // ✅ أضفنا Math.floor للدقة
}

export function sunToUsdt(amount: number): number {
  return amount / 1_000_000;
}
