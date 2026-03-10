// --- Core types for Q MEV AI SDK ---

export interface Bundle {
  id: string;
  transactions: string[];
  blockNumber: number;
  minTimestamp?: number;
  maxTimestamp?: number;
  revertingTxHashes?: string[];
}

export interface BundleStatus {
  bundleId: string;
  status: 'pending' | 'submitted' | 'landed' | 'failed' | 'cancelled';
  blockNumber?: number;
  txHash?: string;
  profit?: string;
  gasUsed?: number;
  error?: string;
}

export interface Auction {
  blockNumber: number;
  bids: AuctionBid[];
  winner?: string;
  winningBid?: string;
  status: 'open' | 'closed' | 'finalized';
  deadline: number;
}

export interface AuctionBid {
  bidder: string;
  amount: string;
  bundleHash: string;
  timestamp: number;
}

export interface RelayStats {
  relayId: string;
  name: string;
  url: string;
  status: 'active' | 'inactive' | 'degraded';
  bundlesSubmitted: number;
  bundlesLanded: number;
  avgLatencyMs: number;
  successRate: number;
  lastSeen: number;
}

export interface MempoolSnapshot {
  size: number;
  pendingTxs: number;
  gasStats: {
    min: string;
    max: string;
    avg: string;
    median: string;
  };
  topTokens: Array<{ token: string; count: number }>;
}

export interface EngineHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  version: string;
  chainId: number;
  blockNumber: number;
  peerCount: number;
  mempoolSize: number;
  bundleCount: number;
  activeRelays: number;
  lastBlockTime: number;
}

export interface ProfitHistory {
  timeRange: string;
  totalProfit: string;
  totalCost: string;
  netProfit: string;
  bundleCount: number;
  successRate: number;
  byStrategy: Record<string, { profit: string; count: number }>;
  dataPoints: Array<{ timestamp: number; profit: string }>;
}

export interface SimulationResult {
  success: boolean;
  profit: string;
  gasUsed: number;
  effectiveGasPrice: string;
  logs: string[];
  stateChanges: Array<{
    address: string;
    key: string;
    before: string;
    after: string;
  }>;
  error?: string;
}

export interface OFAStats {
  txsProtected: number;
  sandwichBlocked: number;
  mevCaptured: string;
  userRebates: string;
  rebateRate: number;
  avgSavingsPerTx: string;
}

export interface MEVEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface ChatResponse {
  message: string;
  conversationId: string;
  toolsCalled?: Array<{
    toolName: string;
    success: boolean;
    result?: unknown;
  }>;
}

export interface QMEVTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type MEVRole =
  | 'searcher'
  | 'builder'
  | 'validator'
  | 'operator'
  | 'analyst';

export interface QMEVClientConfig {
  apiUrl: string;
  apiKey: string;
  role?: MEVRole;
}

export interface GatewayClientConfig {
  url: string;
  apiKey?: string;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown[];
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}
