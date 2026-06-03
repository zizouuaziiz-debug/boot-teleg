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
    // استخدام getContract بدل getTransactionsRelated
    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    
    // نجلب transfer events من البلوكتشين
    const events = await contract.getEvents('Transfer', {
      sinceTimestamp: sinceTimestamp,
      filters: { to: address },
      size: 50,
      onlyConfirmed: true,
    });
    
    let totalReceived = 0;
    const validTxs: any[] = [];
    
    if (events && events.length > 0) {
      for (const event of events) {
        const value = sunToUsdt(Number(event.result.value));
        totalReceived += value;
        validTxs.push({
          txId: event.transaction,
          from: event.result.from,
          to: event.result.to,
          amount: value,
          timestamp: event.block_timestamp,
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
