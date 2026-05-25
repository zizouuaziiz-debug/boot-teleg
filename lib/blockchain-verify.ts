const ETHERSCAN_API   = "https://api.etherscan.io/api";
const BSCSCAN_API     = "https://api.bscscan.com/api";
const TRONGRID_API    = "https://api.trongrid.io";

const USDT_ERC20_CONTRACT  = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_BEP20_CONTRACT  = "0x55d398326f99059fF775485246999027B3197955";
const USDT_TRC20_CONTRACT  = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

export interface BlockchainTx {
  hash:        string;
  from:        string;
  to:          string;
  value:       number;
  timestamp:   number;
  confirmed:   boolean;
}

export async function checkEthereumDeposit(
  address: string,
  minAmount: number,
  afterTs: number
): Promise<BlockchainTx | null> {
  const apiKey = process.env.ETHERSCAN_API_KEY ?? "";
  const url =
    `${ETHERSCAN_API}?module=account&action=tokentx` +
    `&contractaddress=${USDT_ERC20_CONTRACT}` +
    `&address=${address}&startblock=0&endblock=99999999` +
    `&sort=desc&apikey=${apiKey}`;
  try {
    const res  = await fetch(url, { next: { revalidate: 0 } });
    const data = await res.json();
    if (data.status !== "1" || !Array.isArray(data.result)) return null;

    for (const tx of data.result) {
      const ts       = Number(tx.timeStamp) * 1000;
      const decimals = Number(tx.tokenDecimal ?? 6);
      const value    = Number(tx.value) / Math.pow(10, decimals);
      const confirmed = Number(tx.confirmations) >= 12;

      if (
        tx.to?.toLowerCase() === address.toLowerCase() &&
        value >= minAmount &&
        ts >= afterTs &&
        confirmed
      ) {
        return { hash: tx.hash, from: tx.from, to: tx.to, value, timestamp: ts, confirmed };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function checkBscDeposit(
  address: string,
  minAmount: number,
  afterTs: number
): Promise<BlockchainTx | null> {
  const apiKey = process.env.BSCSCAN_API_KEY ?? "";
  const url =
    `${BSCSCAN_API}?module=account&action=tokentx` +
    `&contractaddress=${USDT_BEP20_CONTRACT}` +
    `&address=${address}&startblock=0&endblock=99999999` +
    `&sort=desc&apikey=${apiKey}`;
  try {
    const res  = await fetch(url, { next: { revalidate: 0 } });
    const data = await res.json();
    if (data.status !== "1" || !Array.isArray(data.result)) return null;

    for (const tx of data.result) {
      const ts       = Number(tx.timeStamp) * 1000;
      const decimals = Number(tx.tokenDecimal ?? 18);
      const value    = Number(tx.value) / Math.pow(10, decimals);
      const confirmed = Number(tx.confirmations) >= 12;

      if (
        tx.to?.toLowerCase() === address.toLowerCase() &&
        value >= minAmount &&
        ts >= afterTs &&
        confirmed
      ) {
        return { hash: tx.hash, from: tx.from, to: tx.to, value, timestamp: ts, confirmed };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function checkTronDeposit(
  address: string,
  minAmount: number,
  afterTs: number
): Promise<BlockchainTx | null> {
  const tronGridKey = process.env.TRONGRID_API_KEY ?? "";
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (tronGridKey) headers["TRON-PRO-API-KEY"] = tronGridKey;

  const url = `${TRONGRID_API}/v1/accounts/${address}/transactions/trc20` +
    `?contract_address=${USDT_TRC20_CONTRACT}&limit=20&order_by=block_timestamp,desc`;

  try {
    const res  = await fetch(url, { headers, next: { revalidate: 0 } });
    const data = await res.json();
    if (!Array.isArray(data.data)) return null;

    for (const tx of data.data) {
      const ts    = Number(tx.block_timestamp);
      const value = Number(tx.value ?? 0) / 1_000_000;

      if (
        tx.to === address &&
        value >= minAmount &&
        ts >= afterTs
      ) {
        return {
          hash:      tx.transaction_id,
          from:      tx.from,
          to:        tx.to,
          value,
          timestamp: ts,
          confirmed: true,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function checkNowpaymentsStatus(paymentId: string): Promise<{
  status: string;
  actually_paid: number;
} | null> {
  try {
    const apiKey = process.env.NOWPAYMENTS_API_KEY ?? "";
    if (!apiKey) return null;

    const res = await fetch(`https://api.nowpayments.io/v1/payment/${paymentId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      status:        d.payment_status ?? "waiting",
      actually_paid: Number(d.actually_paid ?? 0),
    };
  } catch {
    return null;
  }
}
