// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat")
const fs = require('fs')
const path = require('path')

const tokens = (amount) => {
  return ethers.utils.parseUnits(amount.toString(), 'ether')
}

const ether = tokens
const votes = tokens

async function main() {
  const jacdTokenArgs = ['JACD Coin', 'JACD']
  const JACDToken = await hre.ethers.getContractFactory('JACDToken')
  const jacdToken = await JACDToken.deploy(...jacdTokenArgs)

  console.log(`JACD Coin deployed to ${jacdToken.address}`)

  const usdcTokenArgs = ['Mock USD Coin', 'mUSDC', 0]
  const USDCToken = await hre.ethers.getContractFactory('USDCToken')
  const usdcToken = await USDCToken.deploy(...usdcTokenArgs)

  console.log(`USDC Coin deployed to ${usdcToken.address}`)

  const jetpacksArgs = ['Jetpacks', 'JP', ether(.0001), 10000, Date.now().toString().slice(0, 10), 'x', 10000]
  const Jetpacks = await ethers.getContractFactory('NFT')
  const jetpacks = await Jetpacks.deploy(...jetpacksArgs)

  console.log(`Jetpacks deployed to ${jetpacks.address}`)

  const hoverboardsArgs = ['Hoverboards', 'HB', ether(.0001), 10000, Date.now().toString().slice(0, 10), 'y', 10000]
  const Hoverboards = await ethers.getContractFactory('NFT')
  const hoverboards = await Hoverboards.deploy(...hoverboardsArgs)

  console.log(`Hoverboards deployed to ${hoverboards.address}`)

  const avasArgs = ['AVAs', 'AVA', ether(.0001), 10000, Date.now().toString().slice(0, 10), 'z', 10000]
  const AVAs = await ethers.getContractFactory('NFT')
  const avas = await AVAs.deploy(...avasArgs)

  console.log(`AVAs deployed to ${avas.address}`)

  const collections = [jetpacks.address, hoverboards.address, avas.address]
  const jacdArgs = [jacdToken.address, usdcToken.address, collections, 10, [5, 3, 1], 30000, 10, votes(1000), 86400, 86400]
  const JACD = await hre.ethers.getContractFactory('JACD')
  const jacd = await JACD.deploy(...jacdArgs)

  console.log(`JACD deployed to ${jacd.address}`)

  const accounts = await hre.ethers.getSigners()
  const signer = accounts[0]
  const manager = accounts[1]

  let transaction = await jacdToken.connect(signer).transferOwnership(jacd.address)
  await transaction.wait()

  console.log(`JACDToken ownership transferred to ${await jacdToken.owner()}`)

  console.log('Bootstrapping faucet permissions...')

  for (const nft of [jetpacks, hoverboards, avas]) {
    transaction = await nft.connect(signer).addToWhitelist(manager.address)
    await transaction.wait()

    transaction = await nft.connect(manager).setApprovalForAll(jacd.address, true)
    await transaction.wait()
  }

  transaction = await usdcToken.connect(manager).approve(jacd.address, hre.ethers.constants.MaxUint256)
  await transaction.wait()

  console.log('Manager whitelisted on all NFT contracts, setApprovalForAll granted, mUSDC max-approved to DAO')

  const { chainId } = await hre.ethers.provider.getNetwork()
  const configPath = path.join(__dirname, '..', 'src', 'config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

  config[chainId] = {
    ...config[chainId],
    jacdToken:   { address: jacdToken.address },
    jacdDAO:     { address: jacd.address },
    usdcToken:   { address: usdcToken.address },
    jetpacks:    { address: jetpacks.address },
    hoverboards: { address: hoverboards.address },
    avas:        { address: avas.address },
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  console.log(`config.json updated for chainId ${chainId}`)

  // Etherscan verification — Sepolia only, and only if ETHERSCAN_API_KEY is set.
  // Runs after config.json write so addresses are saved even if verify fails.
  if (chainId === 11155111 && process.env.ETHERSCAN_API_KEY) {
    console.log('\nWaiting 30s for Etherscan indexer to catch up before verifying...')
    await new Promise((r) => setTimeout(r, 30000))

    const toVerify = [
      { name: 'JACDToken',   address: jacdToken.address,   constructorArguments: jacdTokenArgs },
      { name: 'USDCToken',   address: usdcToken.address,   constructorArguments: usdcTokenArgs },
      { name: 'Jetpacks',    address: jetpacks.address,    constructorArguments: jetpacksArgs },
      { name: 'Hoverboards', address: hoverboards.address, constructorArguments: hoverboardsArgs },
      { name: 'AVAs',        address: avas.address,        constructorArguments: avasArgs },
      { name: 'JACD',        address: jacd.address,        constructorArguments: jacdArgs },
    ]

    for (const { name, address, constructorArguments } of toVerify) {
      try {
        await hre.run('verify:verify', { address, constructorArguments })
        console.log(`  ${name} verified`)
      } catch (e) {
        // "Already Verified" is the common case on re-runs; surface message and continue.
        console.log(`  ${name} verify skipped: ${e.message.split('\n')[0]}`)
      }
    }
  } else if (chainId === 11155111) {
    console.log('\nETHERSCAN_API_KEY not set — skipping verification. Set it in .env to auto-verify.')
  }

  console.log('\nNext step: run scripts/daily_testnet.js to seed manager mUSDC, NFTs, and DAO treasury.')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
