# JACD

> NFT & Token gated, multi-tiered voting charitable DAO.

JACD is a decentralized autonomous organization that pools community contributions and donates them to recipients chosen by its governance process. Holders of JADU-themed NFTs (Jetpacks, Hoverboards, AVAs) and direct mUSDC contributors share authority through a two-stage voting model: NFT holders gate which proposals advance from the holder stage to the open stage, then the open stage weighs NFT votes by collection tier alongside contributor token votes for the final decision.

> **Note:** To interact with the live demo on Sepolia, visit the [hosted app](https://jacd.vercel.app) — connect MetaMask with the **Sepolia testnet** selected. Running this repository locally is for development. All assets are testnet-only and have no real-world value.

**Network:** Sepolia (testnet) · Hardhat (local dev)

## Architecture

```
                  ┌──────────────────────┐
                  │       Visitor        │
                  └───────────┬──────────┘
                              │ MetaMask
                  ┌───────────▼──────────┐
                  │    JACD Frontend     │
                  │    CRA + Redux       │
                  └───────────┬──────────┘
                              │ ethers.js v5
                  ┌───────────▼─────────────────────┐
                  │       JACD DAO Contract         │
                  │   - 2-stage voting              │
                  │   - per-collection vote weights │
                  │   - random-pick demo faucet     │
                  └─────┬──────────┬─────────┬──────┘
                        │          │         │
                  ┌─────▼─────┐ ┌──▼─────┐ ┌─▼──────────┐
                  │ JACDToken │ │ mUSDC  │ │ NFT × 3    │
                  │ (ERC20    │ │ (mock  │ │ Jetpacks,  │
                  │ governance│ │ USDC)  │ │ Hoverboards│
                  │ + burn)   │ │        │ │ AVAs       │
                  └───────────┘ └────────┘ └────────────┘
```

The JACD DAO contract is the source of truth: it holds the treasury, mints governance tokens against contributions, runs the two-stage voting flow, and orchestrates payouts. The supporting contracts (`JACDToken`, mock USDC, NFT collections) exist as the assets the DAO operates on.

## How It Works

### Two-Stage Voting

1. **Holder stage** — Only NFT holders can vote. Each NFT held = 1 vote. A proposal advances to the open stage if it gets `minHolderVotesToPass` total votes AND `votesFor > votesAgainst` (or once all NFT votes have been cast). A failing holder vote terminates the proposal.
2. **Open stage** — Both NFT holders and JACD-token contributors can vote. NFT votes carry **per-collection weights** (Jetpacks > Hoverboards > AVAs in the Sepolia configuration). JACD token votes count 1:1 and are *burned* on submission (token-spend = vote). A proposal is finalized — meaning the requested USDC actually transfers to the recipient — when `votesFor > votesAgainst` and total ≥ `minVotesToFinalize`.

### Random NFT Faucet

To let visitors actually participate in the demo without owning real JADU NFTs, the contract exposes a `faucetRequest(manager)` function that:

- Tops the caller's mUSDC balance up to 100 (via `transferFrom` against a pre-approved manager wallet)
- Picks one of the three NFT collections at random (per `block.prevrandao` + caller address) and transfers one NFT of that type to the caller — provided they don't already hold one of that type and the manager has stock
- Emits a `FaucetClaim` event with the rolled collection index, granted token ID, and USDC amount, which the front end uses to compose precise post-claim feedback

Re-claiming after a duplicate-roll is part of the design — it's the visitor's path to collecting the full set across multiple clicks.

### Treasury & Governance Tokens

Visitors deposit mUSDC to the DAO via `receiveDeposit`. The contract mints them JACD tokens at a fixed `1e12` ratio (100 mUSDC → 100 JACD), then those tokens become spendable open-stage votes. The DAO owns the JACD token contract, so only the DAO can mint.

## Getting Started (Local)

Three terminals:

```bash
# Terminal 1 — local Hardhat chain
npx hardhat node

# Terminal 2 — deploy contracts (auto-writes addresses to src/config.json),
#              then seed mUSDC, NFTs, and example proposals
npx hardhat run --network localhost scripts/deploy.js
npx hardhat run --network localhost scripts/seed.js

# Terminal 3 — frontend dev server
npm start
```

In MetaMask:

1. Add a network: name `Hardhat localhost`, RPC `http://127.0.0.1:8545`, chainId `31337`.
2. To exercise the visitor flow, **switch off the deployer account** — the deployer already holds all seeded assets. Import Hardhat's account[1] for a clean visitor wallet (private key in the `npx hardhat node` console output).

> **Local-dev gotcha:** every time you restart `npx hardhat node`, MetaMask's cache for that network goes stale. Settings → Advanced → "Clear activity tab data" after each restart, or you'll see flaky page loads.

## Available Scripts

| Script | Description |
|---|---|
| `npm start` | Start CRA dev server |
| `npm run build` | Build production bundle |
| `npm test` | Run frontend tests in watch mode |
| `npx hardhat compile` | Compile Solidity contracts |
| `npx hardhat test` | Run Hardhat contract test suite |
| `npx hardhat clean && npx hardhat coverage` | Generate Solidity coverage report (clean is required for the toolbox/coverage version mix) |
| `npx hardhat node` | Start local Hardhat chain (chainId 31337, port 8545) |
| `npx hardhat run --network localhost scripts/deploy.js` | Deploy contracts to local chain — auto-writes `src/config.json["31337"]` |
| `npx hardhat run --network localhost scripts/seed.js` | Seed local state (mUSDC, NFTs, example proposals across all stages) |
| `npx hardhat run --network sepolia scripts/deploy_testnet.js` | Deploy contracts to Sepolia — auto-writes `src/config.json["11155111"]` |
| `npx hardhat run --network sepolia scripts/seed_testnet.js` | Seed Sepolia state |

The Sepolia scripts read `ALCHEMY_API_KEY` and `PRIVATE_KEYS` (deployer + manager, comma-separated) from `.env`.

## Project Structure

```
jacd/
├── contracts/                  # Solidity contracts
│   ├── JACD.sol                # Core DAO — governance, treasury, faucet
│   ├── JACDToken.sol           # Governance ERC20 (ERC20Burnable, owned by DAO)
│   ├── NFT.sol                 # ERC721Enumerable used for Jetpacks/Hoverboards/AVAs
│   ├── USDCToken.sol           # Mock USDC for the demo (real USDC on hypothetical mainnet)
│   └── mocks/                  # Failure-path mocks for test coverage
├── scripts/                    # Deploy + seed scripts
│   ├── deploy.js               # Local Hardhat deploy (auto-writes config.json)
│   ├── deploy_testnet.js       # Sepolia deploy (auto-writes config.json)
│   ├── seed.js                 # Local-scale seed
│   └── seed_testnet.js         # Sepolia-scale seed
├── src/
│   ├── components/             # React components, one per page tab + shared
│   ├── store/                  # Redux Toolkit slices + the interactions layer
│   │   ├── reducers/           # provider, tokens, dao, nfts, toasts
│   │   └── interactions.js     # All ethers contract calls live here
│   ├── abis/                   # Bare ABI arrays per contract
│   └── config.json             # Per-chain contract addresses (auto-managed by deploy scripts)
└── test/                       # Hardhat contract test suite
```

## Tech Stack

### Frontend

- **Create React App 5** — bundle + dev server
- **React 18** — UI
- **Redux Toolkit** — state management (provider/wallet, contracts, balances, proposals, toasts)
- **React Bootstrap** — UI components
- **ethers.js v5** — chain interaction
- **react-router-dom** — HashRouter for tab routing

### Smart Contracts

- **Solidity ^0.8.0**
- **OpenZeppelin Contracts v4** — ERC20Burnable, ERC721Enumerable, Ownable
- **Hardhat 2.x** — compilation, local chain, testing, coverage
- **solidity-coverage 0.8.17** — coverage reports

## Version History

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

The deployed contracts also expose `string public constant VERSION` for on-chain version attestation (`dao.VERSION()` / `jacdToken.VERSION()`).

## License

Copyright (c) 2026 Derrek Brack. All rights reserved.

Proprietary — provided for portfolio demonstration purposes only.

## Author

**Derrek Brack** & **Claude Code**

For licensing inquiries, please contact the copyright holder.
