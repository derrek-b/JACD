// Daily maintenance script for the JACD demo on Sepolia.
//
// Refills manager + DAO state to target levels when below threshold,
// then manages the proposal pipeline: cleans up overaccumulated
// expired proposals, ensures a pass-locked holder proposal exists for
// visitors to vote on, and pushes active open proposals to threshold
// matching whichever direction visitors lead.
//
// Idempotent — safe to re-run; does nothing on quiet days.
//
// Run via: npx hardhat run --network sepolia scripts/daily_testnet.js
//
// Requires .env with PRIVATE_KEYS=deployerKey,managerKey
// (deployer must be the owner of USDCToken + 3 NFT contracts;
//  manager must be whitelisted on each NFT contract — both done by
//  scripts/deploy_testnet.js as part of bootstrap).

const hre = require('hardhat')
const config = require('../src/config.json')
require('dotenv').config()

// --- Refill targets -------------------------------------------------------
// Refill an asset only when below `threshold`, then top it up to `target`.
// Numbers sized for low-traffic portfolio demo (~0-5 visitors/day).

const TARGETS = {
  managerUSDC: 1000,           // mUSDC units (the human-scale number, not wei)
  managerNFTs: 10,             // per collection
  daoTreasury: 4000,           // mUSDC units
}

const THRESHOLDS = {
  managerUSDC: 500,
  managerNFTs: 5,
  daoTreasury: 2000,
}

// Proposal management — keep the pipeline alive without micromanaging it.
// Pass-locked: manager casts all NFT votes FOR a fresh proposal to guarantee
// it passes when finalized regardless of visitor input. Open-stage push: cast
// JACD tokens to bring an active open proposal up to ~990 votes in whichever
// direction visitors lead (or FOR by default if no votes).
const OPEN_PRELOAD_TARGET = hre.ethers.utils.parseEther('990')
const OPEN_PRELOAD_GATE   = hre.ethers.utils.parseEther('900')
const MAX_OF_TYPE = 2   // tolerate this many of each expired type; finalize oldest beyond

// Templates rotate by (proposalCount % length). Recipients are set to
// deployer at create time so payouts recycle back into the system.
const PROPOSAL_TEMPLATES = [
  { name: 'Local Food Bank Support',     description: 'Funding for community food bank operations.',           amount: 100 },
  { name: 'Library Tech Upgrade',        description: 'New computers and software for the public library.',    amount: 75  },
  { name: 'Youth Coding Scholarship',    description: 'Scholarships for kids attending coding camp.',          amount: 125 },
  { name: 'Animal Shelter Support',      description: 'Medical supplies and food for the local animal shelter.', amount: 50  },
  { name: 'Community Garden Initiative', description: 'Tools and seeds for the neighborhood garden project.',  amount: 150 },
  { name: 'School Supply Drive',         description: 'Backpacks and supplies for low-income students.',       amount: 100 },
  { name: 'Disaster Relief Fund',        description: 'Emergency response funding for local disasters.',       amount: 200 },
  { name: 'Veterans Outreach',           description: 'Support services for local veterans.',                  amount: 100 },
]

// Minimum ETH each wallet must hold before the script does anything.
// One full refill cycle costs each wallet ~0.005-0.01 ETH; this gives
// a cycle of headroom on top.
const MIN_ETH_BALANCE = hre.ethers.utils.parseEther('0.02')

// --- Helpers --------------------------------------------------------------

const usdcUnits = (n) => hre.ethers.utils.parseUnits(n.toString(), 6)
const formatUSDC = (wei) => +hre.ethers.utils.formatUnits(wei, 6)

async function refillManagerUSDC(usdcToken, manager, deployer) {
  const current = formatUSDC(await usdcToken.balanceOf(manager.address))
  if (current >= THRESHOLDS.managerUSDC) {
    console.log(`  manager mUSDC: ${current} held, no refill needed`)
    return
  }
  const need = TARGETS.managerUSDC - current
  const tx = await usdcToken.connect(deployer).mint(manager.address, usdcUnits(need))
  await tx.wait()
  console.log(`  manager mUSDC: minted ${need} → now at ${TARGETS.managerUSDC}`)
}

async function refillManagerNFT(nft, name, manager) {
  const current = (await nft.balanceOf(manager.address)).toNumber()
  if (current >= THRESHOLDS.managerNFTs) {
    console.log(`  manager ${name}: ${current} held, no refill needed`)
    return
  }
  const need = TARGETS.managerNFTs - current
  const cost = await nft.cost()
  const totalCost = cost.mul(need)
  const tx = await nft.connect(manager).mint(need, { value: totalCost })
  await tx.wait()
  console.log(`  manager ${name}: minted ${need} → now at ${TARGETS.managerNFTs}`)
}

async function refillDAOTreasury(usdcToken, dao, deployer) {
  const current = formatUSDC(await dao.availableBalance())
  if (current >= THRESHOLDS.daoTreasury) {
    console.log(`  DAO available balance: ${current} mUSDC, no refill needed`)
    return
  }
  const need = TARGETS.daoTreasury - current
  const needWei = usdcUnits(need)

  let tx = await usdcToken.connect(deployer).mint(deployer.address, needWei)
  await tx.wait()
  tx = await usdcToken.connect(deployer).approve(dao.address, needWei)
  await tx.wait()
  tx = await dao.connect(deployer).receiveDeposit(needWei)
  await tx.wait()
  console.log(`  DAO available balance: deposited ${need} mUSDC → now at ${TARGETS.daoTreasury} (deployer also received ${need} JACD tokens)`)
}

async function withdrawNFTContractETH(nft, name, deployer) {
  const balance = await hre.ethers.provider.getBalance(nft.address)
  if (balance.eq(0)) {
    console.log(`  ${name} contract ETH: 0, nothing to withdraw`)
    return hre.ethers.BigNumber.from(0)
  }
  const formatted = hre.ethers.utils.formatEther(balance)
  const tx = await nft.connect(deployer).withdraw()
  await tx.wait()
  console.log(`  ${name} contract ETH: withdrew ${formatted} ETH → deployer`)
  return balance
}

async function returnETHToManager(deployer, manager, amount) {
  if (amount.eq(0)) {
    console.log(`  no ETH to return to manager this cycle`)
    return
  }
  const formatted = hre.ethers.utils.formatEther(amount)
  const tx = await deployer.sendTransaction({ to: manager.address, value: amount })
  await tx.wait()
  console.log(`  returned ${formatted} ETH from deployer → manager (recovers manager mint costs)`)
}

async function checkETHBalances(deployer, manager) {
  const deployerBal = await hre.ethers.provider.getBalance(deployer.address)
  const managerBal = await hre.ethers.provider.getBalance(manager.address)
  const min = hre.ethers.utils.formatEther(MIN_ETH_BALANCE)

  console.log(`  deployer ETH: ${hre.ethers.utils.formatEther(deployerBal)}`)
  console.log(`  manager  ETH: ${hre.ethers.utils.formatEther(managerBal)}`)

  const lowDeployer = deployerBal.lt(MIN_ETH_BALANCE)
  const lowManager  = managerBal.lt(MIN_ETH_BALANCE)

  if (lowDeployer || lowManager) {
    console.log(`\n⚠️  ETH balance below ${min} ETH — aborting before any state changes.`)
    if (lowDeployer) console.log(`   - deployer ${deployer.address} needs a top-up`)
    if (lowManager)  console.log(`   - manager  ${manager.address} needs a top-up`)
    console.log('   Sepolia ETH faucets:')
    console.log('     https://cloud.google.com/application/web3/faucet/ethereum/sepolia (0.05 ETH, no requirements)')
    console.log('     https://www.alchemy.com/faucets/ethereum-sepolia (0.1 ETH, balance & activity required)')
    console.log('     https://faucets.chain.link/sepolia (0.5 ETH, 1 LINK on mainnet required)')
    return false
  }
  return true
}

// --- Proposal management -------------------------------------------------

async function categorizeProposals(dao) {
  const count = (await dao.proposalCount()).toNumber()
  const minHolder = await dao.minHolderVotesToPass()
  const minOpen = await dao.minVotesToFinalize()
  const latestBlock = await hre.ethers.provider.getBlock('latest')
  const now = latestBlock.timestamp

  const cats = {
    active_holder_pass:  [],   // pass-locked, active timer — daily-created, visitors vote on
    active_holder_other: [],   // active holder proposals that aren't pass-locked (typically user-created)
    expired_holder_pass: [],   // pass-locked, timer expired — visitors can finalize → advances to Open
    expired_holder_fail: [],   // not pass-locked, timer expired — visitors can finalize → History as Failed
    active_open:         [],   // active open proposals — daily pushes to threshold based on visitor direction
    expired_open_pass:   [],   // pass-locked at expiration — visitors finalize → USDC payout, History as Finalized
    expired_open_fail:   [],   // not pass-locked at expiration — visitors finalize → History as Failed
  }

  for (let i = 1; i <= count; i++) {
    const p = await dao.proposals(i)

    if (p.stage === 0) {
      const total = p.votesFor.add(p.votesAgainst)
      const isPassLocked = total.gte(minHolder) && p.votesFor.gt(p.votesAgainst)
      const isExpired = p.voteEnd.toNumber() <= now

      if (isExpired) {
        if (isPassLocked) cats.expired_holder_pass.push(p)
        else cats.expired_holder_fail.push(p)
      } else {
        if (isPassLocked) cats.active_holder_pass.push(p)
        else cats.active_holder_other.push(p)
      }
    } else if (p.stage === 1) {
      const total = p.votesFor.add(p.votesAgainst)
      const isPassLocked = total.gte(minOpen) && p.votesFor.gt(p.votesAgainst)
      const isExpired = p.voteEnd.toNumber() <= now

      if (isExpired) {
        if (isPassLocked) cats.expired_open_pass.push(p)
        else cats.expired_open_fail.push(p)
      } else {
        cats.active_open.push(p)
      }
    }
    // stage 2 (Finalized) and stage 3 (Failed) already in History — ignored
  }

  return cats
}

async function cleanupExpiredOverages(dao, manager, cats) {
  const buckets = [
    { name: 'expired_holder_pass', list: cats.expired_holder_pass, finalizer: 'finalizeHoldersVote' },
    { name: 'expired_holder_fail', list: cats.expired_holder_fail, finalizer: 'finalizeHoldersVote' },
    { name: 'expired_open_pass',   list: cats.expired_open_pass,   finalizer: 'finalizeProposal'   },
    { name: 'expired_open_fail',   list: cats.expired_open_fail,   finalizer: 'finalizeProposal'   },
  ]

  for (const b of buckets) {
    if (b.list.length <= MAX_OF_TYPE) continue
    const sorted = [...b.list].sort((a, b) => a.index.toNumber() - b.index.toNumber())
    const oldest = sorted[0]
    console.log(`  ${b.name}: count=${b.list.length} > ${MAX_OF_TYPE}, finalizing oldest (proposal #${oldest.index.toString()})`)
    const tx = await dao.connect(manager)[b.finalizer](oldest.index)
    await tx.wait()
  }
}

async function createPassLockedHolder(dao, deployer, manager) {
  const proposalCount = (await dao.proposalCount()).toNumber()
  const template = PROPOSAL_TEMPLATES[proposalCount % PROPOSAL_TEMPLATES.length]

  // Clamp the proposal amount to the contract's enforced max
  // (availableBalance × maxProposalAmountPercent / 100). Prevents
  // CreateProposal reverts when treasury is temporarily low.
  const available = await dao.availableBalance()
  const maxPct = await dao.maxProposalAmountPercent()
  const contractMax = available.mul(maxPct).div(100)
  const intended = usdcUnits(template.amount)
  const amount = intended.lt(contractMax) ? intended : contractMax

  if (amount.eq(0)) {
    console.log(`  available balance × ${maxPct}% = 0, skipping proposal creation`)
    return
  }

  const amountLabel = formatUSDC(amount)
  const clampedNote = amount.lt(intended) ? ` (clamped from ${template.amount})` : ''
  console.log(`  creating pass-locked holder: "${template.name}" for ${amountLabel} mUSDC${clampedNote} → deployer`)

  let tx = await dao.connect(deployer).createProposal(
    deployer.address,
    amount,
    template.name,
    template.description
  )
  const receipt = await tx.wait()

  const proposeEvent = receipt.events?.find(e => e.event === 'Propose')
  const newIndex = proposeEvent.args.index

  tx = await dao.connect(manager).holdersVote(newIndex, true)
  await tx.wait()

  console.log(`  proposal #${newIndex.toString()} created and pre-loaded with manager NFT votes FOR`)
}

async function ensureDeployerJACD(usdcToken, jacdToken, dao, deployer, neededAmount) {
  const balance = await jacdToken.balanceOf(deployer.address)
  if (balance.gte(neededAmount)) return

  const deficit = neededAmount.sub(balance)
  // JACD is 18 decimals, USDC is 6 decimals; receiveDeposit multiplies USDC amount by 10^12 to mint JACD.
  // So to get N JACD wei, deposit N / 10^12 USDC wei.
  const deficitUSDC = deficit.div(hre.ethers.BigNumber.from(10).pow(12)).add(hre.ethers.BigNumber.from(1))

  console.log(`  deployer JACD ${hre.ethers.utils.formatEther(balance)} < needed ${hre.ethers.utils.formatEther(neededAmount)}, depositing ${formatUSDC(deficitUSDC)} mUSDC to mint more`)

  let tx = await usdcToken.connect(deployer).mint(deployer.address, deficitUSDC)
  await tx.wait()
  tx = await usdcToken.connect(deployer).approve(dao.address, deficitUSDC)
  await tx.wait()
  tx = await dao.connect(deployer).receiveDeposit(deficitUSDC)
  await tx.wait()
}

async function pushOpenStageProposals(dao, jacdToken, usdcToken, deployer, activeOpen) {
  for (const p of activeOpen) {
    const total = p.votesFor.add(p.votesAgainst)
    if (total.gte(OPEN_PRELOAD_GATE)) {
      console.log(`  open proposal #${p.index.toString()}: total ${hre.ethers.utils.formatEther(total)} >= 900 gate, skipping`)
      continue
    }

    // Determine direction — match visitor lead, default FOR if tied or zero
    let voteFor
    if (p.votesFor.gt(p.votesAgainst)) voteFor = true
    else if (p.votesAgainst.gt(p.votesFor)) voteFor = false
    else voteFor = true

    const currentDirVotes = voteFor ? p.votesFor : p.votesAgainst
    const tokensToVote = OPEN_PRELOAD_TARGET.sub(currentDirVotes)
    if (tokensToVote.lte(0)) continue

    await ensureDeployerJACD(usdcToken, jacdToken, dao, deployer, tokensToVote)

    let tx = await jacdToken.connect(deployer).approve(dao.address, tokensToVote)
    await tx.wait()
    tx = await dao.connect(deployer).openVote(p.index, voteFor, tokensToVote)
    await tx.wait()

    console.log(`  open proposal #${p.index.toString()}: cast ${hre.ethers.utils.formatEther(tokensToVote)} JACD ${voteFor ? 'FOR' : 'AGAINST'}`)
  }
}

async function manageProposals(dao, jacdToken, usdcToken, deployer, manager) {
  const cats = await categorizeProposals(dao)

  console.log(`  pipeline state:`)
  console.log(`    active_holder_pass:  ${cats.active_holder_pass.length}`)
  console.log(`    active_holder_other: ${cats.active_holder_other.length}`)
  console.log(`    expired_holder_pass: ${cats.expired_holder_pass.length}`)
  console.log(`    expired_holder_fail: ${cats.expired_holder_fail.length}`)
  console.log(`    active_open:         ${cats.active_open.length}`)
  console.log(`    expired_open_pass:   ${cats.expired_open_pass.length}`)
  console.log(`    expired_open_fail:   ${cats.expired_open_fail.length}`)

  await cleanupExpiredOverages(dao, manager, cats)

  const passLockedCount = cats.active_holder_pass.length + cats.expired_holder_pass.length
  if (passLockedCount === 0) {
    await createPassLockedHolder(dao, deployer, manager)
  } else {
    console.log(`  pass-locked holder count=${passLockedCount}, no new one needed`)
  }

  if (cats.active_open.length > 0) {
    await pushOpenStageProposals(dao, jacdToken, usdcToken, deployer, cats.active_open)
  }
}

// --- Main -----------------------------------------------------------------

async function main() {
  console.log('JACD daily maintenance — starting...')

  const accounts = await hre.ethers.getSigners()
  const deployer = accounts[0]
  const manager = accounts[1]

  const { chainId } = await hre.ethers.provider.getNetwork()
  console.log(`  network chainId: ${chainId}`)
  console.log(`  deployer: ${deployer.address}`)
  console.log(`  manager:  ${manager.address}`)

  console.log('\nETH balance check:')
  if (!(await checkETHBalances(deployer, manager))) return

  const usdcToken = await hre.ethers.getContractAt('USDCToken', config[chainId].usdcToken.address)
  const jacdToken = await hre.ethers.getContractAt('JACDToken', config[chainId].jacdToken.address)
  const jetpacks = await hre.ethers.getContractAt('NFT', config[chainId].jetpacks.address)
  const hoverboards = await hre.ethers.getContractAt('NFT', config[chainId].hoverboards.address)
  const avas = await hre.ethers.getContractAt('NFT', config[chainId].avas.address)
  const dao = await hre.ethers.getContractAt('JACD', config[chainId].jacdDAO.address)

  console.log('\nRefill: manager mUSDC')
  await refillManagerUSDC(usdcToken, manager, deployer)

  console.log('\nRefill: manager NFTs')
  await refillManagerNFT(jetpacks, 'Jetpacks', manager)
  await refillManagerNFT(hoverboards, 'Hoverboards', manager)
  await refillManagerNFT(avas, 'AVAs', manager)

  console.log('\nRefill: DAO treasury')
  await refillDAOTreasury(usdcToken, dao, deployer)

  console.log('\nWithdraw: NFT contract ETH (recovers manager mint costs)')
  let totalWithdrawn = hre.ethers.BigNumber.from(0)
  totalWithdrawn = totalWithdrawn.add(await withdrawNFTContractETH(jetpacks, 'Jetpacks', deployer))
  totalWithdrawn = totalWithdrawn.add(await withdrawNFTContractETH(hoverboards, 'Hoverboards', deployer))
  totalWithdrawn = totalWithdrawn.add(await withdrawNFTContractETH(avas, 'AVAs', deployer))

  console.log('\nReturn: withdrawn ETH back to manager')
  await returnETHToManager(deployer, manager, totalWithdrawn)

  console.log('\nProposal management:')
  await manageProposals(dao, jacdToken, usdcToken, deployer, manager)

  console.log('\nDone.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
