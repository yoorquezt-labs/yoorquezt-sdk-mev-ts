# Changelog

All notable changes to the YoorQuezt MEV TypeScript SDK.

## [Unreleased]

## [0.3.0] - 2026-03-10

### Added
- **SettlementClient**: 11 methods for interacting with settlement contracts (auction deposit/withdraw, settle, claim payout, publish epoch, claim rebate, submit/match/fulfill intent, register/deregister solver)
- **Settlement types**: `AuctionDeposit`, `AuctionResult`, `RebateEpoch`, `RebateClaim`, `Intent`, `SolverInfo`, `IntentStatus` (17 tests)
- **EIP-1193 wallet provider**: Browser wallet integration for MEV protection

### Security
- Added `.env`, `.env.*` to `.gitignore`

## [0.2.0] - 2026-03-09

### Added
- Comprehensive test suite: 89 unit tests covering client, streaming, OFA, and error handling
- Real testnet integration tests against live OFA proxy on Sepolia

## [0.1.0] - 2026-03-08

### Added
- `QMEVClient` — core HTTP client for MEV engine API
- `MEVGatewayClient` — WebSocket JSON-RPC 2.0 gateway client
- SSE streaming for MEV-Share hints and auction events
- Full OFA endpoint coverage: rebates, audit, SLA, health, WebSocket streaming
- TypeScript types for all API responses
