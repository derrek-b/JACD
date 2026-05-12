# Changelog

All notable changes to the JACD project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-12

Major redesign positioning the project as a portfolio-ready demo. Faucet acquired a random NFT-drop mechanic, the open voting stage gained per-collection vote weights, governance thresholds were re-tuned for low-traffic demo flow, and the front end picked up a centralized toast notification system. Contract surface change requires a fresh deployment; on-chain `VERSION` constants added for attestation.

### Faucet & NFT Distribution

- **Random NFT drop** — `faucetRequest` now picks a collection at random per call (`block.prevrandao` + `msg.sender` keccak256 modulo collection count), giving the caller one NFT of that type if they don't already hold one and the manager has stock.
- **`FaucetClaim` event** — emitted on every successful call with `(claimer, collectionIdx, tokenId, usdcAmount)`. Front end reads the event from the receipt to build a precise post-claim notification including the granted collection name and token ID.
- **Silent skip** replaces the old hard-revert path. Previously, an empty NFT stash reverted the whole call (`'JACD: no hoverboards left for faucet'`); now the USDC top-up still succeeds and the NFT side is just not granted. Same UX behavior when the caller already holds the rolled NFT type.
- **Removed** the hardcoded `collections[1]` Hoverboard reference in the faucet path.

### Voting Model

- **Per-collection vote weights** in the open stage. Replaced the scalar `holdersWeight` (uniform across all collections) with a `uint256[] holdersWeights` array. Default Sepolia configuration: Jetpacks=5, Hoverboards=3, AVAs=1.
- **Constructor signature change** — `_holdersWeight: uint256` → `_holdersWeights: uint256[] memory`, with a length-must-match-collections require.
- **`getHoldersWeights()` getter** added so the front end can fetch the full weights array in one call (Solidity's auto-getter for public arrays only returns single elements).
- **Holder stage unchanged** — still raw NFT count, 1 vote per NFT regardless of collection.

### Treasury Accounting

- **Reservation-based available balance.** Renamed `usdcBalance` → `availableBalance` and changed its semantics from "actual USDC held" to "unencumbered funds available for new proposals." Funds are reserved at `createProposal` time and released only on a failed `finalizeHoldersVote` or failed `finalizeProposal` — closing a hole where N proposals could be created whose collective amount exceeded the treasury, leaving late finalizations to revert.
- **`createProposal`** decrements `availableBalance` by the requested amount alongside the max-amount check (`amount ≤ maxProposalAmountPercent × availableBalance / 100`), so the limit and the reservation are evaluated against the same number.
- **`finalizeProposal`** no longer decrements `availableBalance` on success — the reservation made at create-time covers it. The ERC20 transfer handles the actual movement of funds. The solvency `require` was relaxed from `>` to `>=`: under correct accounting the strict `>` would have DOS-ed one proposal's worth of treasury (a proposal that exactly drains remaining liquidity). The `>=` branch is mathematically unreachable under normal contract paths but kept as defense-in-depth and covered by a new balance-spoofing mock (`MockBadERC20.setSpoofedBalance`).
- **Front end** now distinguishes "Treasury Balance" (`usdcToken.balanceOf(dao)`) from "Available for Proposals" (`dao.availableBalance()`); the New Proposal max-amount label reads the latter and the input element gained a `max` attribute so the browser blocks over-limit submissions before they hit the contract.
- **`daily_testnet.js`** refill check now reads `dao.availableBalance()` (not raw treasury). When pending reservations stack up between runs, refilling against available — not real balance — keeps the DAO usable for new proposals at the cost of occasional benign over-top-up. Under-top-up was the worse failure mode for the demo: visitors would hit `'JACD: proposal exceeds limit'` because the contract's max-amount check is gated on `availableBalance`. `daily_scripts.md` gained a Section 2 documenting the same reservation-clamp guidance for the future proposal-lifecycle code path.
- **Removed `receive() external payable {}`** from `JACD.sol`. The DAO denominates everything in mUSDC and has no legitimate ETH inflow path; the vestigial `receive` only created a footgun where accidentally-sent ETH would be permanently locked. Direct ETH transfers to the DAO now revert at the EVM level — the sender's wallet shows the failure and no funds are lost. Added a regression test (`'rejects direct ETH transfers (no receive/fallback)'`) to document the design choice.

### Governance Tuning

- **`minHolderVotesToPass`**: 2001 → 10. Old value required 2/3 turnout on the full hypothetical NFT supply, making proposals effectively unfinalizable in a low-traffic demo. New value lets manager's NFT count alone (max ~30) satisfy the threshold during daily-script pre-loading, and keeps a visitor's 1–3 holder votes feeling proportional.
- **`minVotesToFinalize`**: `votes(210100)` → `votes(1000)`. Re-sized for the new vote-weight scale and demo-realistic participation. The daily script's `OPEN_PRELOAD_TARGET` of 990 is one less than this, leaving a deliberate 10-vote gap visitors can push over.
- **`holderVoteTime` / `openVoteTime`**: kept at 1 day each (86400). Bumped to 7 days mid-redesign and then reverted — short windows pair with the daily-cron lifecycle (proposals advance through stages faster, History stays bounded because daily finalizes overaccumulated expired ones).
- **NFT `_maxSupply`**: 1000 → 10,000 per collection. Long-term refill headroom for the daily maintenance script.

### Front-End UX

- **Toast notification system** — new `toasts` Redux slice + `<ToastDisplay>` container in `App.js`. Action-result feedback (vote/finalize/donate/proposal-create) replaces in-page Alerts with auto-dismissing bottom-right toasts. Persistent state (Wrong Network warning) and the faucet's token-ID-bearing alert remain in-place.
- **Faucet & Demo Video tabs** — moved from the persistent page footer to dedicated routed tabs. New tabs styled `text-danger` to visually separate auxiliary content from primary governance flows.
- **Faucets tab content** — Sepolia ETH faucet links updated (Google, Alchemy, Chainlink), each annotated with payout amount + access requirements. Token-address list expanded to include all 3 NFT collection contracts with a footnote explaining MetaMask NFT imports need both contract address and token ID.
- **Faucet eligibility** check now considers all 3 NFT collections (was Hoverboard-only). "Assets Claimed" only shows when the caller holds 100 mUSDC AND at least one of every NFT type.
- **Open Voting footer** displays the per-collection vote weight breakdown, replacing the old single "votes per NFT" scalar display.
- **Faucet alert** preserves on-page (separate from the toast system) with extended 10-second auto-dismiss so visitors have time to copy the granted token ID.

### Test Coverage & Dev Tooling

- **Mock contracts** added for failure-path testing: `MockBadJACDToken`, `MockBadERC20`, `MockBadOwner`. Cover the previously-untested `require(jacdToken.mint(...))` and `require(usdcToken.transfer(...))` revert paths.
- **`solidity-coverage`** declared as a direct devDependency (0.8.17) so coverage reports work against current Hardhat. Toolbox 1.0.2's pinned 0.7.x was incompatible.
- **Auto-write of contract addresses** to `src/config.json[chainId]` by both `deploy.js` and `deploy_testnet.js`. Eliminates the manual copy-paste step after every deploy.
- **`solidity-coverage` workflow** documented: requires `npx hardhat clean` before `npx hardhat coverage` because the toolbox/coverage version mix doesn't auto-clear the build cache.
- **ESLint cleanup** — all `react-hooks/exhaustive-deps` and `no-unused-vars` warnings addressed across the front end, allowing CRA's `CI=true` production build to pass without `CI=false` workaround.
- **App.js listener leak fix** — `window.ethereum` `accountsChanged`/`networkChanged` listeners moved into a properly-scoped `useEffect` with cleanup (previously stacked on every render).

### Deployment & Operations

- **Local + Sepolia symbol parity** — local Hardhat deploy now uses `mUSDC` symbol matching Sepolia (was `USDC`), so on-chain symbol reads behave identically across environments.
- **`master` → `main`** branch rename with associated GitHub default-branch update.

### Sepolia Maintenance Pipeline

- **`deploy_testnet.js` bootstrap** — added one-time setup at end of `main()`: deployer whitelists manager on each NFT contract, manager calls `setApprovalForAll(dao, true)` on each (×3), manager calls `approve(dao, MaxUint256)` for mUSDC. These are persistent state that never need re-doing, so they migrated from per-cycle work into the deploy script itself.
- **`daily_testnet.js`** — new recurring maintenance script. Idempotent (reads state, acts only on drift). Responsibilities:
  - **ETH balance pre-flight** — aborts before any state changes if either wallet holds < 0.02 ETH, with Sepolia faucet links in the error output.
  - **Asset refills** — manager mUSDC (target 1000, threshold 500), manager NFTs (target 10/collection, threshold 5/collection), DAO treasury (target 4000, threshold 2000 — checked against `availableBalance`, not raw treasury).
  - **NFT-contract ETH recovery** — withdraws accumulated mint fees from each NFT contract to deployer, then forwards back to manager so the manager's per-cycle mint costs are net-zero.
  - **Proposal lifecycle** — categorizes proposals by stage × locked-direction × expired status; finalizes the oldest in each expired category when count > 2 (cleanup); creates a new pass-locked holder proposal (rotating templates from a hardcoded list, recipient = `deployer.address`) when none exists in either active or expired state; pushes active open-stage proposals toward `minVotesToFinalize` matching whichever direction visitors lead (default FOR if tied/zero votes); auto-mints additional JACD to deployer via `receiveDeposit` when token balance is short of the open-vote pre-load target.
  - **Amount clamping** — `createProposal` amount = `min(template.amount, availableBalance × maxProposalAmountPercent / 100)`, so creation never reverts during temporarily-tight treasury periods.
- **`seed_testnet.js` removed** — its one-time bootstrap operations migrated to `deploy_testnet.js`; its recurring operations migrated to `daily_testnet.js`. Local-dev `seed.js` is unchanged.

### On-Chain Version Constants

- `string public constant VERSION = "1.0.0"` added to `JACD` and `JACDToken`. Allows on-chain version attestation via `dao.VERSION()` / `jacdToken.VERSION()`. Mock and demo-support contracts (`NFT`, `USDCToken`) intentionally not versioned — they're testnet-only stand-ins for production assets that would exist independently on mainnet.
- `package.json` version aligned at 1.0.0.

## [0.1.0] - 2023-08-07

Initial proof-of-concept. Single-collection faucet (Hoverboards only), uniform open-stage vote weight, basic two-stage holder→open governance with finalize. Deployed to Sepolia, but governance thresholds were sized for full-network turnout and proposals never advanced past the holder stage in practice.
