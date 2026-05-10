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
  const JACDToken = await hre.ethers.getContractFactory('JACDToken')
  const jacdToken = await JACDToken.deploy('JACD Coin', 'JACD')

  console.log(`JACD Coin deployed to ${jacdToken.address}`)

  const USDCToken = await hre.ethers.getContractFactory('USDCToken')
  const usdcToken = await USDCToken.deploy('Mock USD Coin', 'mUSDC', 0)

  console.log(`USDC Coin deployed to ${usdcToken.address}`)

  const Jetpacks = await ethers.getContractFactory('NFT')
  const jetpacks = await Jetpacks.deploy(
    'Jetpacks',
    'JP',
    ether(.0001),
    10000,
    Date.now().toString().slice(0, 10),
    'x',
    10000
  )

  console.log(`Jetpacks deployed to ${jetpacks.address}`)

  const Hoverboards = await ethers.getContractFactory('NFT')
  const hoverboards = await Hoverboards.deploy(
    'Hoverboards',
    'HB',
    ether(.0001),
    10000,
    Date.now().toString().slice(0, 10),
    'y',
    10000
  )

  console.log(`Hoverboards deployed to ${hoverboards.address}`)

  const AVAs = await ethers.getContractFactory('NFT')
  const avas = await AVAs.deploy(
    'AVAs',
    'AVA',
    ether(.0001),
    10000,
    Date.now().toString().slice(0, 10),
    'z',
    10000
  )

  console.log(`AVAs deployed to ${avas.address}`)

  const collections = [jetpacks.address, hoverboards.address, avas.address]

  const JACD = await hre.ethers.getContractFactory('JACD')
  const jacd = await JACD.deploy(jacdToken.address, usdcToken.address, collections, 10, [5, 3, 1], 30000, 100, votes(1000), 604800, 604800)

  console.log(`JACD deployed to ${jacd.address}`)

  const accounts = await hre.ethers.getSigners()
  const signer = accounts[0]

  let transaction = await jacdToken.connect(signer).transferOwnership(jacd.address)
  await transaction.wait()

  console.log(`JACDToken ownership transferred to ${await jacdToken.owner()}`)

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
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
