const hre = require('hardhat')
const config = require('../src/config.json')

const tokens = (amount) => {
  return ethers.utils.parseUnits(amount.toString(), 'ether')
}

const ether = tokens
const votes = tokens

const usdc = (amount) => {
  return amount * 10**6
}

async function main() {
  let transaction

  const accounts = await hre.ethers.getSigners()
  const deployer = accounts[0]
  const holder1 = accounts[1]
  const holder2 = accounts[2]
  const contributor1 = accounts[3]

  const { chainId } = await hre.ethers.provider.getNetwork()

  console.log('minting and distributing USDC...')

  const usdcToken = await hre.ethers.getContractAt('JACDToken', config[chainId].usdcToken.address)

  transaction = await usdcToken.connect(deployer).mint(deployer.address, usdc(1000))
  await transaction.wait()

  transaction = await usdcToken.connect(deployer).mint(contributor1.address, usdc(1000))
  await transaction.wait()

  console.log('minting jetpacks...')

  const jetpacks = await hre.ethers.getContractAt('NFT', config[chainId].jetpacks.address)

  transaction = await jetpacks.connect(deployer).addToWhitelist(deployer.address)
  await transaction.wait()

  transaction = await jetpacks.connect(deployer).mint(1, { value: ether(.001) })
  await transaction.wait()

  console.log('minting hoverboards...')

  const hoverboards = await hre.ethers.getContractAt('NFT', config[chainId].hoverboards.address)

  transaction = await hoverboards.connect(deployer).addToWhitelist(deployer.address)
  await transaction.wait()

  transaction = await hoverboards.connect(deployer).mint(1, { value: ether(.001) })
  await transaction.wait()

  console.log('minting avas...')

  const avas = await hre.ethers.getContractAt('NFT', config[chainId].avas.address)

  transaction = await avas.connect(deployer).addToWhitelist(deployer.address)
  await transaction.wait()

  transaction = await avas.connect(deployer).mint(1, { value: ether(.001) })
  await transaction.wait()

  console.log('deposit usdc...')

  const dao = await hre.ethers.getContractAt('JACD', config[chainId].jacdDAO.address)

  transaction = await usdcToken.connect(deployer).approve(dao.address, usdc(500))
  await transaction.wait()
  transaction = await usdcToken.connect(contributor1).approve(dao.address, usdc(1000))
  await transaction.wait()

  transaction = await dao.connect(deployer).receiveDeposit(usdc(500))
  await transaction.wait()
  transaction = await dao.connect(contributor1).receiveDeposit(usdc(900))
  await transaction.wait()

  console.log('approving DAO for faucet draws...')

  transaction = await usdcToken.connect(deployer).approve(dao.address, usdc(500))
  await transaction.wait()

  transaction = await jetpacks.connect(deployer).setApprovalForAll(dao.address, true)
  await transaction.wait()
  transaction = await hoverboards.connect(deployer).setApprovalForAll(dao.address, true)
  await transaction.wait()
  transaction = await avas.connect(deployer).setApprovalForAll(dao.address, true)
  await transaction.wait()

  console.log('creating proposals...')

  transaction = await dao.connect(deployer).createProposal(deployer.address, usdc(100), 'Proposal 1', 'Description of Proposal 1')
  await transaction.wait()
  transaction = await dao.connect(deployer).createProposal(deployer.address, usdc(100), 'Proposal 2', 'Description of Proposal 2')
  await transaction.wait()
  transaction = await dao.connect(contributor1).createProposal(deployer.address, usdc(100), 'Proposal 3', 'Description of Proposal 3')
  await transaction.wait()

  console.log('holder voting...')

  transaction = await dao.connect(deployer).holdersVote(1, true)
  await transaction.wait()

  transaction = await dao.connect(deployer).holdersVote(2, true)
  await transaction.wait()

  transaction = await dao.connect(deployer).holdersVote(3, false)
  await transaction.wait()

  console.log('passing holder vote stage...')

  transaction = await dao.connect(deployer).finalizeHoldersVote(1)
  await transaction.wait()

  console.log('open voting...')

  const jacdToken = await hre.ethers.getContractAt('JACDToken', config[chainId].jacdToken.address)

  transaction = await jacdToken.connect(contributor1).approve(dao.address, tokens(250))
  await transaction.wait()

  transaction = await dao.connect(contributor1).openVote(1, true, votes(250))
  await transaction.wait()

  console.log('finished!')
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
