import { MEVGatewayClient } from './gateway';

// --- AuctionSettlement types ---

/** Deposit made by a searcher into the on-chain auction settlement contract. */
export interface AuctionDeposit {
  /** Unique auction identifier. */
  auctionId: string;
  /** Deposit amount in wei (bigint serialized as string over JSON-RPC). */
  amount: bigint;
  /** ERC-20 token address (or 0x0 for native ETH). */
  token: string;
}

/**
 * Result of a settled auction.
 * Mirrors the AuctionSettlement.sol `AuctionResult` struct.
 */
export interface AuctionResult {
  /** Unique auction identifier. */
  auctionId: string;
  /** Address of the winning searcher. */
  winner: string;
  /** Winning bid amount in wei. */
  amount: string;
  /** Protocol fee deducted from the winning bid (wei). */
  protocolFee: string;
  /** Whether the auction has been settled on-chain. */
  settled: boolean;
}

// --- RebateDistributor types ---

/**
 * A rebate epoch published by the RebateDistributor contract.
 * Each epoch contains a Merkle root covering all eligible rebate claims.
 */
export interface RebateEpoch {
  /** Sequential epoch identifier. */
  epochId: number;
  /** Merkle root of the rebate distribution tree. */
  merkleRoot: string;
  /** Total rebate amount available in this epoch (wei). */
  totalAmount: string;
  /** ERC-20 token address used for rebate payouts. */
  token: string;
  /** Unix timestamp after which unclaimed rebates are forfeited. */
  claimDeadline: number;
}

/**
 * A Merkle proof claim for a single account within a rebate epoch.
 * Submitted on-chain to the RebateDistributor contract.
 */
export interface RebateClaim {
  /** Epoch this claim belongs to. */
  epochId: number;
  /** Claimant address. */
  account: string;
  /** Claimable rebate amount (wei). */
  amount: string;
  /** Merkle proof siblings (bottom-up). */
  proof: string[];
}

// --- IntentRegistry types ---

/** Status of an intent in the IntentRegistry contract. */
export type IntentStatus =
  | 'pending'
  | 'matched'
  | 'fulfilled'
  | 'cancelled'
  | 'expired';

/**
 * An intent registered on-chain via the IntentRegistry contract.
 * Intents express a desired swap outcome and are matched by solvers.
 */
export interface Intent {
  /** Unique intent identifier (keccak256 hash). */
  id: string;
  /** Address that created the intent. */
  creator: string;
  /** Type of intent (e.g. "swap", "limit", "twap"). */
  intentType: string;
  /** Address of the input token. */
  inputToken: string;
  /** Address of the desired output token. */
  outputToken: string;
  /** Input token amount (wei). */
  inputAmount: string;
  /** Minimum acceptable output amount (wei). */
  minOutputAmount: string;
  /** Unix timestamp deadline for fulfillment. */
  deadline: number;
  /** Current status of the intent. */
  status: IntentStatus;
  /** Address of the solver that matched/fulfilled the intent. */
  solver?: string;
}

/**
 * On-chain solver registration info from the IntentRegistry contract.
 */
export interface SolverInfo {
  /** Solver's Ethereum address. */
  address: string;
  /** Staked amount required for solver registration (wei). */
  stake: string;
  /** Whether the solver is currently registered. */
  registered: boolean;
  /** Number of intents successfully fulfilled. */
  successCount: number;
  /** Number of intents the solver failed to fulfill. */
  failureCount: number;
}

// --- SettlementClient config ---

/** Configuration for the SettlementClient. */
export interface SettlementClientConfig {
  /** MEVGatewayClient instance to use for JSON-RPC calls. */
  gateway: MEVGatewayClient;
}

/**
 * SettlementClient wraps MEV Gateway JSON-RPC calls for on-chain settlement
 * contracts: AuctionSettlement, RebateDistributor, and IntentRegistry.
 */
export class SettlementClient {
  private readonly gateway: MEVGatewayClient;

  constructor(config: SettlementClientConfig) {
    this.gateway = config.gateway;
  }

  // --- AuctionSettlement ---

  /**
   * Get the result of a settled auction.
   * @param auctionId - The auction identifier.
   * @returns The auction result including winner, amount, and settlement status.
   */
  async getAuctionResult(auctionId: string): Promise<AuctionResult> {
    return this.gateway.call<AuctionResult>('settlement_getAuctionResult', [auctionId]);
  }

  /**
   * Get the deposit for a specific auction.
   * @param auctionId - The auction identifier.
   * @param depositor - Address of the depositor.
   * @returns The deposit details.
   */
  async getDeposit(auctionId: string, depositor: string): Promise<AuctionDeposit> {
    const raw = await this.gateway.call<{ auctionId: string; amount: string; token: string }>(
      'settlement_getDeposit',
      [auctionId, depositor],
    );
    return {
      auctionId: raw.auctionId,
      amount: BigInt(raw.amount),
      token: raw.token,
    };
  }

  /**
   * List all auction results within a block range.
   * @param fromBlock - Start block number (inclusive).
   * @param toBlock - End block number (inclusive).
   * @returns Array of auction results.
   */
  async listAuctionResults(fromBlock: number, toBlock: number): Promise<AuctionResult[]> {
    return this.gateway.call<AuctionResult[]>('settlement_listAuctionResults', [fromBlock, toBlock]);
  }

  // --- RebateDistributor ---

  /**
   * Get a rebate epoch by its identifier.
   * @param epochId - The epoch identifier.
   * @returns The epoch details including Merkle root and claim deadline.
   */
  async getRebateEpoch(epochId: number): Promise<RebateEpoch> {
    return this.gateway.call<RebateEpoch>('settlement_getRebateEpoch', [epochId]);
  }

  /**
   * Get the current (latest) rebate epoch.
   * @returns The most recent rebate epoch.
   */
  async getCurrentEpoch(): Promise<RebateEpoch> {
    return this.gateway.call<RebateEpoch>('settlement_getCurrentEpoch');
  }

  /**
   * Generate a Merkle proof claim for an account in a given epoch.
   * @param epochId - The epoch identifier.
   * @param account - The claimant address.
   * @returns The rebate claim with Merkle proof.
   */
  async getRebateClaim(epochId: number, account: string): Promise<RebateClaim> {
    return this.gateway.call<RebateClaim>('settlement_getRebateClaim', [epochId, account]);
  }

  /**
   * Check whether a rebate has already been claimed.
   * @param epochId - The epoch identifier.
   * @param account - The claimant address.
   * @returns True if the rebate has been claimed.
   */
  async isRebateClaimed(epochId: number, account: string): Promise<boolean> {
    return this.gateway.call<boolean>('settlement_isRebateClaimed', [epochId, account]);
  }

  // --- IntentRegistry ---

  /**
   * Get an intent by its identifier.
   * @param intentId - The intent identifier (keccak256 hash).
   * @returns The intent details.
   */
  async getIntent(intentId: string): Promise<Intent> {
    return this.gateway.call<Intent>('settlement_getIntent', [intentId]);
  }

  /**
   * List intents with optional status filter.
   * @param status - Optional status to filter by.
   * @param limit - Maximum number of intents to return (default: 50).
   * @returns Array of intents matching the filter.
   */
  async listIntents(status?: IntentStatus, limit?: number): Promise<Intent[]> {
    const params: unknown[] = [];
    if (status) params.push(status);
    if (limit !== undefined) params.push(limit);
    return this.gateway.call<Intent[]>('settlement_listIntents', params);
  }

  /**
   * Get solver registration info from the IntentRegistry contract.
   * @param solverAddress - The solver's Ethereum address.
   * @returns Solver registration details including stake and performance stats.
   */
  async getSolverInfo(solverAddress: string): Promise<SolverInfo> {
    return this.gateway.call<SolverInfo>('settlement_getSolverInfo', [solverAddress]);
  }

  /**
   * List all registered solvers.
   * @returns Array of solver registrations.
   */
  async listSolvers(): Promise<SolverInfo[]> {
    return this.gateway.call<SolverInfo[]>('settlement_listSolvers');
  }
}
