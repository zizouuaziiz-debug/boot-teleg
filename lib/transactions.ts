// lib/transactions.ts
import { getReadOnlyTronWeb, USDT_CONTRACT, sunToUsdt } from './tronweb';

export interface FeeConfig {
  platformFee: number;
  escrowFee: number;
  minFee: number;
  maxFee: number;
}

export async function getFeeConfig(): Promise<FeeConfig> {
  return {
    platformFee: Number(process.env.PLATFORM_FEE) || 2,
    escrowFee: Number(process.env.ESCROW_FEE) || 1,
    minFee: 0.5,
    maxFee: 50,
  };
}

export function calculateFees(amount: number, feeConfig: FeeConfig, isEscrow: boolean) {
  const platformFee = Math.max(
    Math.min((amount * feeConfig.platformFee) / 100, feeConfig.maxFee),
    feeConfig.minFee
  );
  const escrowFee = isEscrow ? (amount * feeConfig.escrowFee) / 100 : 0;
  const totalFee = platformFee + escrowFee;
  
  return {
    totalFee: Number(totalFee.toFixed(6)),
    platformFee: Number(platformFee.toFixed(6)),
    escrowFee: Number(escrowFee.toFixed(6)),
    netAmount: Number((amount - totalFee).toFixed(6)),
  };
}

export async function checkIncomingTransactions(
  address: string,
  sinceTimestamp: number,
  expectedAmount?: number
) {
  const tronWeb = getReadOnlyTronWeb();
  
  try {
    const options = {
      only_confirmed: true,
      only_to: true,
      limit: 50,
      min_timestamp: sinceTimestamp,
      contract_address: USDT_CONTRACT,
    };
    
    const txs = await tronWeb.getTransactionsRelated(address, 'trc20', options);
    
    let totalReceived = 0;
    const validTxs: any[] = [];
    
    if (txs && txs.length > 0) {
      for (const tx of txs) {
        const value = sunToUsdt(tx.value);
        totalReceived += value;
        validTxs.push({
          txId: tx.transaction_id,
          from: tx.from,
          to: tx.to,
          amount: value,
          timestamp: tx.block_timestamp,
        });
      }
    }
    
    return {
      found: expectedAmount ? totalReceived >= expectedAmount : totalReceived > 0,
      transactions: validTxs,
      totalReceived: Number(totalReceived.toFixed(6)),
    };
  } catch (error) {
    console.error('Check transactions error:', error);
    return { found: false, transactions: [], totalReceived: 0 };
  }
}
