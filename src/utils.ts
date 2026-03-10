const ETH_DECIMALS = 18;
const GWEI_DECIMALS = 9;

/**
 * Format a wei value as a human-readable ETH string.
 * Example: formatWei("1000000000000000000") => "1.0 ETH"
 */
export function formatWei(wei: string | bigint): string {
  const value = typeof wei === 'string' ? BigInt(wei) : wei;
  const whole = value / 10n ** BigInt(ETH_DECIMALS);
  const remainder = value % 10n ** BigInt(ETH_DECIMALS);
  const decimal = remainder.toString().padStart(ETH_DECIMALS, '0').slice(0, 6).replace(/0+$/, '') || '0';
  return `${whole}.${decimal} ETH`;
}

/**
 * Format a gwei value as a human-readable string.
 * Example: formatGwei(30.5) => "30.5 gwei"
 */
export function formatGwei(gwei: number | string): string {
  const value = typeof gwei === 'string' ? parseFloat(gwei) : gwei;
  return `${value} gwei`;
}

/**
 * Parse an ETH string to wei as bigint.
 * Example: parseWei("1.5") => 1500000000000000000n
 */
export function parseWei(eth: string): bigint {
  const parts = eth.split('.');
  const whole = BigInt(parts[0]) * 10n ** BigInt(ETH_DECIMALS);
  if (parts.length === 1) return whole;

  const decimalStr = parts[1].slice(0, ETH_DECIMALS).padEnd(ETH_DECIMALS, '0');
  const decimal = BigInt(decimalStr);
  return whole + decimal;
}

/**
 * Truncate an address for display.
 * Example: truncateAddress("0xabcdef1234567890abcdef1234567890abcdef12") => "0xabcd...ef12"
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Validate an Ethereum address (0x-prefixed, 40 hex chars).
 */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * Example: formatDuration(90000) => "1m 30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Format a rate (0-1) as a percentage string.
 * Example: formatPercent(0.956) => "95.60%"
 */
export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}
