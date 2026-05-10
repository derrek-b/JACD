const hre = require('hardhat')
const config = require('../src/config.json')
require('dotenv').config()

const tokens = (amount) => {
  return ethers.utils.parseUnits(amount.toString(), 'ether')
}

const ether = tokens

const usdc = (amount) => {
  return amount * 10**6
}

const privateKeys = process.env.PRIVATE_KEYS.split(',')

async function main() {
  let transaction

  console.log('fetching network info...')

  const provider = await hre.ethers.getDefaultProvider(`https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`)
  const { chainId } = await hre.ethers.provider.getNetwork()

  console.log('fetching wallet info...')

  const deployerPrivateKey = privateKeys[0]
  const deployer = new hre.ethers.Wallet(deployerPrivateKey, provider)

  const managerPrivateKey = privateKeys[1]
  const manager = new hre.ethers.Wallet(managerPrivateKey, provider)

  console.log('fetching contracts...')

  const usdcToken = await hre.ethers.getContractAt('USDCToken', config[chainId].usdcToken.address)
  const jetpacks = await hre.ethers.getContractAt('NFT', config[chainId].jetpacks.address)
  const hoverboards = await hre.ethers.getContractAt('NFT', config[chainId].hoverboards.address)
  const avas = await hre.ethers.getContractAt('NFT', config[chainId].avas.address)
  const dao = await hre.ethers.getContractAt('JACD', config[chainId].jacdDAO.address)

  console.log('minting assets...')

  console.log('   USDC...')

  transaction = await usdcToken.connect(deployer).mint(manager.address, usdc(5000))
  await transaction.wait()

  console.log('   Jetpacks...')

  transaction = await jetpacks.connect(deployer).addToWhitelist(manager.address)
  await transaction.wait()

  transaction = await jetpacks.connect(manager).mint(50, { value: ether(.0001).mul(50) })
  await transaction.wait()

  console.log('   Hoverboards...')

  transaction = await hoverboards.connect(deployer).addToWhitelist(manager.address)
  await transaction.wait()

  transaction = await hoverboards.connect(manager).mint(50, { value: ether(.0001).mul(50) })
  await transaction.wait()

  console.log('   AVAs...')

  transaction = await avas.connect(deployer).addToWhitelist(manager.address)
  await transaction.wait()

  transaction = await avas.connect(manager).mint(50, { value: ether(.0001).mul(50) })
  await transaction.wait()

  console.log('approve DAO to transfer assets...')

  transaction = await usdcToken.connect(manager).approve(dao.address, usdc(5000))
  await transaction.wait()

  transaction = await jetpacks.connect(manager).setApprovalForAll(dao.address, true)
  await transaction.wait()

  transaction = await hoverboards.connect(manager).setApprovalForAll(dao.address, true)
  await transaction.wait()

  transaction = await avas.connect(manager).setApprovalForAll(dao.address, true)
  await transaction.wait()

  console.log('deposit USDC...')

  transaction = await usdcToken.connect(deployer).mint(deployer.address, usdc(2000))
  await transaction.wait()

  transaction = await usdcToken.connect(deployer).approve(dao.address, usdc(2000))
  await transaction.wait()

  transaction = await dao.connect(deployer).receiveDeposit(usdc(2000))
  await transaction.wait()

  console.log('finished!')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
