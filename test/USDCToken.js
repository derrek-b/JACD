const { expect } = require('chai')

function parseUSDC(amountEth) {
    return amountEth * 10**6
}

describe('Token', () => {
  const NAME = "USD Coin"
  const SYMBOL = "USDC"
  const DECIMALS = 6

  let totalSupply, totalSupplyWei, amount, token, owner, recipient

  beforeEach(async () => {
    totalSupply = 1000000
    amount = parseUSDC(1)

    const accounts = await ethers.getSigners()
    deployer = accounts[0]
    delegate = accounts[1]
    recipient = accounts[2].address

    const Token = await ethers.getContractFactory('USDCToken')
    token = await Token.deploy(NAME, SYMBOL, totalSupply)
  })

  describe('Deployment', () => {
    const name = "Town Token"
    const symbol = "TOWN"
    const decimals = 6

    it('sets the correct contract owner', async () => {
      expect(await token.owner()).to.be.equal(deployer.address)
    })

    it('has the correct name', async () => {
      expect(await token.name()).to.be.equal(NAME)
    })

    it('has the correct symbol', async () => {
      expect(await token.symbol()).to.be.equal(SYMBOL)
    })

    it('has 18 decimals', async () => {
      expect(await token.decimals()).to.be.equal(6)
    })

    it('has the correct total supply', async () => {
      expect(await token.totalSupply()).to.be.equal(parseUSDC(totalSupply))
    })

    it('assigns total supply to deployer & correctly tracks the balance', async () => {
      expect(await token.balanceOf(deployer.address)).to.be.equal(parseUSDC(totalSupply))
    })
  })

  describe('Functionality', () => {
    let transaction
    let result
    let event
    let args

    describe('Transfers', () => {
      describe('Successful Transfers', () => {
        beforeEach(async () => {
          transaction = await token.connect(deployer).transfer(recipient, amount)
        })

        it('transfers tokens', async () => {
          expect(await token.balanceOf(deployer.address)).to.be.equal(parseUSDC(totalSupply) - amount)
          expect(await token.balanceOf(recipient)).to.be.equal(amount)
        })

        it('emits a "Transfer" event', async () => {
          result = await transaction.wait()

          expect(result).to.emit(token, 'Transfer').withArgs(
            deployer.address,
            recipient.address,
            amount
          )
        })
      })

      describe('Transfer Failures', () => {
        it('rejects insufficient balances', async () => {
          await expect(token.transfer(recipient, parseUSDC(totalSupply) + amount)).to.be.rejectedWith('Insufficient balance')
        })

          it('rejects invalid "to" addresses', async () => {
          await expect(token.connect(owner).transfer('0x0000000000000000000000000000000000000000', amount)).to.be.rejected
        })
      })
    })

    describe('Approval of Allowances for Delegated Transfers', () => {
      describe('Successful Approvals', () => {
        beforeEach(async () => {
          transaction = await token.connect(deployer).approve(delegate.address, amount)
        })

        it('creates allowances via approval function', async () => {
          expect(await token.allowance(deployer.address, delegate.address)).to.be.equal(amount)
        })

        it('sets all allowances to zero', async () => {
          expect(await token.allowance(delegate.address, recipient)).to.be.equal(0)
        })

        it('emits an "Approval" event', async () => {
          result = await transaction.wait()

          expect(result).to.emit(token, 'Approval').withArgs(
            deployer.address,
            delegate.address,
            amount
          )
        })
      })

      describe('Approval Failures', () => {
        it('rejects invalid "spender" addresses', async () => {
          await expect(token.approve('0x0000000000000000000000000000000000000000', amount)).to.be.rejected
        })
      })
    })

    describe('Delegated Transfers', () => {
      describe('Successful Delegated Transfers', () => {
        beforeEach(async () => {
          await token.connect(deployer).approve(delegate.address, amount)

          transaction = await token.connect(delegate).transferFrom(deployer.address, recipient, amount)
        })

        it('allows "spender" to transfer "owner\'s" tokens', async () => {
          expect(await token.balanceOf(deployer.address)).to.be.equal(parseUSDC(totalSupply) - amount)
          expect(await token.balanceOf(recipient)).to.be.equal(amount)
        })

        it('adjusts allowance after transfer', async () => {
          expect(await token.allowance(deployer.address, delegate.address)).to.be.equal(0)
        })

        it('emits a "Transfer" event', async () => {
          result = await transaction.wait()

          expect(result).to.emit(token, 'Transfer').withArgs(
            deployer.address,
            recipient,
            amount
          )
        })
      })

      describe('Delegated Transfer Failures', () => {
        it('rejects insufficient allowances', async () => {
          await expect(token.connect(delegate).transferFrom(deployer.address, recipient, amount)).to.be.rejectedWith('Insufficient allowance')
        })

        it('rejects invalid "to" addresses', async () => {
          await expect(token.transferFrom(deployer.address, '0x0000000000000000000000000000000000000000', 0)).to.be.rejected
        })

        it('rejects invalid "from" addresses', async () => {
          await expect(token.transferFrom('0x0000000000000000000000000000000000000000', recipient, 0)).to.be.rejected
        })
      })
    })

    describe('Minting', () => {
      describe('Successful Minting', () => {
        let totalSupplyBefore, minterBalanceBefore, transaction

        beforeEach(async () => {
          totalSupplyBefore = await token.totalSupply();
          recipientBalanceBefore = await token.balanceOf(recipient)
          transaction = await token.connect(deployer).mint(recipient, amount)
        })

        it('increases total supply', async () => {
          expect(await token.totalSupply()).to.be.equal(parseUSDC(totalSupply) + amount)
        })

        it('increases "recipient\'s" balance', async () => {
          expect(await token.balanceOf(recipient)).to.be.equal(recipientBalanceBefore.add(amount))
        })

        it('emits a "Mint" event', async () => {
          result = await transaction.wait()
          event = result.events[0]
          expect(event.event).to.be.equal('Mint')

          args = event.args
          expect(args.recipient).to.be.equal(recipient)
          expect(args.amount).to.be.equal(amount)
        })
      })

      describe('Minting Failures', () => {
        it('rejects unauthorized minter addresses', async () => {
          await expect(token.connect(delegate).mint(recipient, amount)).to.be.reverted
        })

        it('rejects invalid recipient addresses', async () => {
          await expect(token.connect(deployer).mint('0x0000000000000000000000000000000000000000', amount)).to.be.reverted
        })
      })
    })
  })
})
