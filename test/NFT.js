const { expect } = require('chai')
const { ethers } = require('hardhat')

const tokens = (n) => ethers.utils.parseUnits(n.toString(), 'ether')
const ether = tokens

describe('NFT', () => {
  const NAME = 'Test NFT'
  const SYMBOL = 'TST'
  const COST = ether(0.1)
  const MAX_SUPPLY = 25
  const BASE_URI = 'ipfs://test/'
  const MAX_MINT = 5

  let nft, deployer, minter, rando, transaction, allowMintingOn

  beforeEach(async () => {
    [deployer, minter, rando] = await ethers.getSigners()

    const latestBlock = await ethers.provider.getBlock('latest')
    allowMintingOn = latestBlock.timestamp

    const NFT = await ethers.getContractFactory('NFT')
    nft = await NFT.deploy(NAME, SYMBOL, COST, MAX_SUPPLY, allowMintingOn, BASE_URI, MAX_MINT)

    transaction = await nft.connect(deployer).addToWhitelist(minter.address)
    await transaction.wait()
  })

  describe('Deployment', () => {
    it('sets the name and symbol', async () => {
      expect(await nft.name()).to.equal(NAME)
      expect(await nft.symbol()).to.equal(SYMBOL)
    })

    it('sets cost, maxSupply, maxMint and baseURI', async () => {
      expect(await nft.cost()).to.equal(COST)
      expect(await nft.maxSupply()).to.equal(MAX_SUPPLY)
      expect(await nft.maxMint()).to.equal(MAX_MINT)
      expect(await nft.baseURI()).to.equal(BASE_URI)
    })

    it('sets the deployer as owner', async () => {
      expect(await nft.owner()).to.equal(deployer.address)
    })

    it('starts unpaused', async () => {
      expect(await nft.isPaused()).to.equal(false)
    })
  })

  describe('Minting', () => {
    describe('Success', () => {
      beforeEach(async () => {
        transaction = await nft.connect(minter).mint(2, { value: COST.mul(2) })
        await transaction.wait()
      })

      it('mints requested NFTs to the caller', async () => {
        expect(await nft.balanceOf(minter.address)).to.equal(2)
        expect(await nft.totalSupply()).to.equal(2)
      })

      it('collects the cost in ether', async () => {
        expect(await ethers.provider.getBalance(nft.address)).to.equal(COST.mul(2))
      })

      it('emits a Mint event', async () => {
        await expect(transaction).to.emit(nft, 'Mint').withArgs(2, minter.address)
      })
    })

    describe('Failure', () => {
      it('reverts when paused', async () => {
        transaction = await nft.connect(deployer).pauseMint(true)
        await transaction.wait()

        await expect(nft.connect(minter).mint(1, { value: COST }))
          .to.be.revertedWith('Minting is paused')
      })

      it('reverts before allowMintingOn', async () => {
        const latestBlock = await ethers.provider.getBlock('latest')
        const futureMintingOn = latestBlock.timestamp + 60 * 60 * 24

        const NFT = await ethers.getContractFactory('NFT')
        const futureNft = await NFT.deploy(NAME, SYMBOL, COST, MAX_SUPPLY, futureMintingOn, BASE_URI, MAX_MINT)

        transaction = await futureNft.connect(deployer).addToWhitelist(minter.address)
        await transaction.wait()

        await expect(futureNft.connect(minter).mint(1, { value: COST }))
          .to.be.revertedWith('Minting not yet allowed')
      })

      it('reverts when caller is not whitelisted', async () => {
        await expect(nft.connect(rando).mint(1, { value: COST }))
          .to.be.revertedWith('Address not whitelisted')
      })

      it('reverts on mint amount of 0', async () => {
        await expect(nft.connect(minter).mint(0, { value: 0 }))
          .to.be.revertedWith('Must mint at least 1 NFT')
      })

      it('reverts when amount exceeds maxMint', async () => {
        const tooMany = MAX_MINT + 1
        await expect(nft.connect(minter).mint(tooMany, { value: COST.mul(tooMany) }))
          .to.be.revertedWith('Cannot mint that many NFTs')
      })

      it('reverts when insufficient ether is sent', async () => {
        await expect(nft.connect(minter).mint(1, { value: 0 }))
          .to.be.revertedWith('Insufficient ether sent')
      })

      it('reverts when total supply would be exceeded', async () => {
        const NFT = await ethers.getContractFactory('NFT')
        const smallNft = await NFT.deploy(NAME, SYMBOL, COST, 2, allowMintingOn, BASE_URI, MAX_MINT)

        transaction = await smallNft.connect(deployer).addToWhitelist(minter.address)
        await transaction.wait()

        transaction = await smallNft.connect(minter).mint(2, { value: COST.mul(2) })
        await transaction.wait()

        await expect(smallNft.connect(minter).mint(1, { value: COST }))
          .to.be.revertedWith('Cannot mint more NFTs than total available')
      })
    })
  })

  describe('Token URI', () => {
    beforeEach(async () => {
      transaction = await nft.connect(minter).mint(1, { value: COST })
      await transaction.wait()
    })

    it('returns the formatted URI for an existing token', async () => {
      expect(await nft.tokenURI(1)).to.equal(`${BASE_URI}1.json`)
    })

    it('reverts on non-existent token', async () => {
      await expect(nft.tokenURI(999)).to.be.revertedWith('Token does not exist')
    })
  })

  describe('Withdraw', () => {
    beforeEach(async () => {
      transaction = await nft.connect(minter).mint(1, { value: COST })
      await transaction.wait()
    })

    describe('Success', () => {
      it('transfers contract balance to the owner', async () => {
        const balanceBefore = await ethers.provider.getBalance(deployer.address)

        transaction = await nft.connect(deployer).withdraw()
        const receipt = await transaction.wait()
        const gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice)

        expect(await ethers.provider.getBalance(nft.address)).to.equal(0)
        expect(await ethers.provider.getBalance(deployer.address))
          .to.equal(balanceBefore.add(COST).sub(gasCost))
      })

      it('emits a Withdraw event', async () => {
        transaction = await nft.connect(deployer).withdraw()
        await expect(transaction).to.emit(nft, 'Withdraw').withArgs(COST, deployer.address)
      })
    })

    describe('Failure', () => {
      it('reverts when called by non-owner', async () => {
        await expect(nft.connect(rando).withdraw()).to.be.reverted
      })

      it('reverts when ether send to owner fails', async () => {
        const MockBadOwner = await ethers.getContractFactory('MockBadOwner')
        const badOwner = await MockBadOwner.deploy()

        transaction = await nft.connect(deployer).transferOwnership(badOwner.address)
        await transaction.wait()

        await expect(badOwner.callWithdraw(nft.address)).to.be.reverted
      })
    })
  })

  describe('addToWhitelist', () => {
    it('reverts when called by non-owner', async () => {
      await expect(nft.connect(rando).addToWhitelist(rando.address)).to.be.reverted
    })
  })

  describe('setCost', () => {
    describe('Success', () => {
      it('updates the cost', async () => {
        transaction = await nft.connect(deployer).setCost(ether(0.5))
        await transaction.wait()

        expect(await nft.cost()).to.equal(ether(0.5))
      })
    })

    describe('Failure', () => {
      it('reverts when called by non-owner', async () => {
        await expect(nft.connect(rando).setCost(ether(0.5))).to.be.reverted
      })

      it('reverts when new cost is 0', async () => {
        await expect(nft.connect(deployer).setCost(0))
          .to.be.revertedWith('New cost must be above 0')
      })
    })
  })

  describe('pauseMint', () => {
    describe('Success', () => {
      it('toggles isPaused', async () => {
        transaction = await nft.connect(deployer).pauseMint(true)
        await transaction.wait()

        expect(await nft.isPaused()).to.equal(true)
      })
    })

    describe('Failure', () => {
      it('reverts when called by non-owner', async () => {
        await expect(nft.connect(rando).pauseMint(true)).to.be.reverted
      })
    })
  })
})
