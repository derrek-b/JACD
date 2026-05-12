# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

Hybrid repo: Solidity contracts under `contracts/` built/tested with **Hardhat**, and a **Create React App** front end under `src/` that talks to those contracts via `ethers` v5. There is no monorepo tooling — both halves share one root `package.json`.

## Common commands

Front end (CRA, runs from repo root):
- `npm start` — dev server
- `npm test` — Jest watch (CRA)
- `npm run build`

Contracts (Hardhat):
- `npx hardhat compile`
- `npx hardhat test` — full Solidity test suite
- `npx hardhat test test/JACD.js` — single file
- `npx hardhat test --grep "<pattern>"` — filter by `describe`/`it` name
- `npx hardhat node` — local chain on `127.0.0.1:8545` (chainId `31337`)
- `npx hardhat run --network localhost scripts/deploy.js` — local deploy
- `npx hardhat run --network localhost scripts/seed.js` — populate state for the UI
- `npx hardhat run --network sepolia scripts/deploy_testnet.js` — Sepolia deploy (uses `scripts/seed_testnet.js` to seed)

`hardhat.config.js` reads `ALCHEMY_API_KEY` and `PRIVATE_KEYS` (comma-separated) from `.env` for the `sepolia` network.

## Deploy → wire-up flow (don't skip)

After any deploy you must do two things or the system is broken:
1. Copy all addresses logged by `deploy.js` into `src/config.json` under the matching chainId (`31337` for local, `11155111` for Sepolia). The front end and `seed.js` both read this file by chainId.
2. Transfer `JACDToken` ownership to the deployed `JACD` DAO contract (`deploy.js` does this for the local script — the DAO must be the JACD token's owner because `receiveDeposit` calls `jacdToken.mint`, and `openVote` calls `burnFrom`). If you deploy ad-hoc, replicate that step.

## Architecture: the JACD DAO

`contracts/JACD.sol` is the core. Read it before changing anything that touches voting, deposits, or token math.

**Deposits → governance tokens.** `receiveDeposit(usdcAmount)` pulls USDC (6 decimals), then `distributeTokens` mints JACD (18 decimals) at a fixed `10**12` multiplier. Anywhere you convert between the two on-chain or in the front end, that scaling factor is the contract behavior — don't "fix" it without changing both sides.

**Reservation accounting.** `availableBalance` is unencumbered treasury — decremented at `createProposal`, re-incremented on either failure branch (`finalizeHoldersVote`-fail, `finalizeProposal`-fail), unchanged at `finalizeProposal`-pass (the real ERC20 transfer handles the actual outflow). It is NOT the same as `usdcToken.balanceOf(dao)`; the difference is `Σ(amounts of proposals currently in {Holder, Open})`. The contract's max-amount check uses `availableBalance`, so the front-end max-proposal label and the `daily_testnet.js` refill check should both read `availableBalance` too. `Info.js` shows both values as separate rows ("Treasury Balance" vs "Available for Proposals").

**Two-stage voting (`VoteStage` enum: Holder → Open → Finalized/Failed).**
- `holdersVote` (stage 1): only addresses holding any NFT in `collections[]` may vote. Weight = sum of NFT balances across all collections. Tracked per-address in `holderVoted[index][addr]`.
- `finalizeHoldersVote`: moves a proposal to `Open` if total votes ≥ `minHolderVotesToPass` AND for > against; else `Failed`. Resets vote tallies and `voteEnd` to `block.timestamp + openVoteTime`.
- `openVote` (stage 2): NFT holders **and** JACD token contributors may vote. Each NFT contributes `holdersWeight * 1e18` votes (one-time per address per proposal, gated by `holderOpenVoted`). JACD token votes are burned via `burnFrom` (so the JACD token must have allowance set, and the DAO must own the JACD token to call `burnFrom` indirectly — `burnFrom` is the standard ERC20Burnable mechanism, which does not actually require ownership; ownership is only needed for `mint`). The same address can cast additional JACD-token-only votes after spending its NFT weight.
- `finalizeProposal`: requires `block.timestamp > voteEnd`, `votesFor > votesAgainst`, and total ≥ `minVotesToFinalize`; transfers USDC to `proposal.recipient`. The reservation made at `createProposal` already covers the spend (see "Reservation accounting" below); failed finalizes release the reservation back into `availableBalance`. Solvency `require` uses `>=` and is unreachable under correct accounting — kept as defense-in-depth.

**Authorization modifiers.** `onlyHolders` (any NFT in any collection), `onlyContributors` (JACD balance > 0), `holdersOrContributors` (either). All three loop over `collections[]` — gas grows with collection count.

**`faucetRequest`** is a demo helper: pulls USDC up to a 100-USDC top-up and a Hoverboard NFT from a "faucet" address (`config.manager`) into the caller. It assumes `collections[1]` is the Hoverboards collection — the deploy scripts deploy in the order Jetpacks, Hoverboards, AVAs to satisfy that index.

**The `set*` configuration functions are `private`.** They are not callable externally today, so DAO parameters are immutable post-deploy. `NOTES.txt` flags adding governance over these as future work.

## Front end architecture

- `src/index.js` wraps `<App>` in a Redux `<Provider>` (store from `src/store/store.js`). The store uses four slices: `provider`, `tokens`, `dao`, `nfts`. `serializableCheck` is **disabled** in middleware because ethers `Contract`/`Provider` instances are kept in state — leave that off.
- All chain interaction lives in `src/store/interactions.js`. Components dispatch via these helpers; they should not instantiate contracts directly.
- `src/components/App.js` runs `loadBlockchainData()` on mount: provider → chainId → token contracts → DAO contract → balances → proposals (split into `loadHolderProposals`/`loadOpenProposals`/`loadClosedProposals` by `VoteStage`) → NFT contracts. The UI gates on `chainId === 31337 || 11155111`; other networks show the "Wrong Network" alert.
- ABIs in `src/abis/` are committed as **bare ABI arrays** (just the `.abi` field of the Hardhat artifact, not the whole `{ abi, bytecode, ... }` object — ethers v5 `new Contract(addr, abiOrFragments, provider)` calls `.map` on its second arg and breaks at runtime if given the full artifact). After contract changes, rerun `npx hardhat compile`, then extract: `node -e "require('fs').writeFileSync('src/abis/<Name>.json', JSON.stringify(require('./artifacts/contracts/<Name>.sol/<Name>.json').abi, null, 2) + '\n')"`.
- Routes (HashRouter): `/`, `/create_proposal`, `/holder_voting`, `/open_voting`, `/history`. `Faucet` renders outside the routes.

## Decimals cheatsheet (easy to get wrong)

- USDC: 6 decimals. Helper `usdc(n) = n * 10**6` in scripts/tests; `parseUSDC`/`formatUSDC` in `interactions.js`.
- JACD + NFT mint price: 18 decimals. `tokens()`/`ether()`/`votes()` are all aliases for `parseUnits(n, 'ether')`.
- `distributeTokens` bridges 6→18 by multiplying by `10**12`.
