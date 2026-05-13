// Standalone Etherscan verification for the Sepolia deployment.
//
// Reads contract addresses from src/config.json[11155111] and submits
// each to Etherscan via the hardhat-etherscan plugin. Idempotent —
// "Already Verified" errors are swallowed so the script is safe to
// re-run after fixing transient network issues.
//
// Run: npx hardhat run --network sepolia scripts/verify_testnet.js
//
// Requires ETHERSCAN_API_KEY in .env. See hardhat.config.js `etherscan`
// block. Constructor arguments for the three NFT collections are
// recovered from on-chain public getters (their `allowMintingOn`
// timestamp is the only deploy-time-dynamic value); JACDToken,
// USDCToken, and JACD use the same constants as deploy_testnet.js.

const hre = require('hardhat')
const path = require('path')
const fs = require('fs')

const votes = (n) => hre.ethers.utils.parseUnits(n.toString(), 'ether')

async function nftConstructorArgs(address) {
  const nft = await hre.ethers.getContractAt('NFT', address)
  return [
    await nft.name(),
    await nft.symbol(),
    await nft.cost(),
    await nft.maxSupply(),
    await nft.allowMintingOn(),
    await nft.baseURI(),
    await nft.maxMint(),
  ]
}

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork()
  if (chainId !== 11155111) {
    console.log(`Skipping — verify is Sepolia-only (chainId 11155111), got ${chainId}.`)
    return
  }
  if (!process.env.ETHERSCAN_API_KEY) {
    console.error('ETHERSCAN_API_KEY not set in .env — aborting.')
    process.exit(1)
  }

  const configPath = path.join(__dirname, '..', 'src', 'config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const addrs = config[chainId]
  if (!addrs) {
    console.error(`No addresses for chainId ${chainId} in src/config.json — deploy first.`)
    process.exit(1)
  }

  const jetpacksArgs = await nftConstructorArgs(addrs.jetpacks.address)
  const hoverboardsArgs = await nftConstructorArgs(addrs.hoverboards.address)
  const avasArgs = await nftConstructorArgs(addrs.avas.address)

  const toVerify = [
    {
      name: 'JACDToken',
      address: addrs.jacdToken.address,
      constructorArguments: ['JACD Coin', 'JACD'],
    },
    {
      name: 'USDCToken',
      address: addrs.usdcToken.address,
      constructorArguments: ['Mock USD Coin', 'mUSDC', 0],
    },
    {
      name: 'Jetpacks',
      address: addrs.jetpacks.address,
      constructorArguments: jetpacksArgs,
      contract: 'contracts/NFT.sol:NFT',
    },
    {
      name: 'Hoverboards',
      address: addrs.hoverboards.address,
      constructorArguments: hoverboardsArgs,
      contract: 'contracts/NFT.sol:NFT',
    },
    {
      name: 'AVAs',
      address: addrs.avas.address,
      constructorArguments: avasArgs,
      contract: 'contracts/NFT.sol:NFT',
    },
    {
      name: 'JACD',
      address: addrs.jacdDAO.address,
      constructorArguments: [
        addrs.jacdToken.address,
        addrs.usdcToken.address,
        [addrs.jetpacks.address, addrs.hoverboards.address, addrs.avas.address],
        10,
        [5, 3, 1],
        30000,
        10,
        votes(1000),
        86400,
        86400,
      ],
    },
  ]

  console.log(`Verifying ${toVerify.length} contracts on Sepolia Etherscan...\n`)

  for (const entry of toVerify) {
    const { name, address } = entry
    try {
      await hre.run('verify:verify', entry)
      console.log(`  ${name} (${address}) verified`)
    } catch (e) {
      // 'Already Verified' is the common case on re-runs; surface the first line and continue.
      console.log(`  ${name} (${address}) skipped: ${e.message.split('\n')[0]}`)
    }
  }

  console.log('\nDone. Check sepolia.etherscan.io for green "Contract Source Code Verified" badges.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
