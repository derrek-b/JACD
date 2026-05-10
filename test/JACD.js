const { expect } = require('chai')
const { ethers } = require('hardhat')
const { time } = require('@nomicfoundation/hardhat-network-helpers')
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs')

const tokens = (amount) => {
  return ethers.utils.parseUnits(amount.toString(), 'ether')
}

const ether = tokens
const votes = tokens

const usdc = (amount) => {
  return amount * 10**6
}

describe('JACD', () => {
  const AMOUNTINUSDC = usdc(100)
  const AMOUNTINETH = tokens(100)

  let
    jacdDAO,
    jacdToken,
    usdcToken,
    deployer,
    holder,
    contributor,
    rando
  let transaction, result

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    deployer = accounts[0]
    holder = accounts[1]
    contributor = accounts[2]
    rando = accounts[3]

    const JACDToken = await ethers.getContractFactory('JACDToken')
    jacdToken = await JACDToken.deploy('JACD Coin', 'JACD')

    const USDCToken = await ethers.getContractFactory('USDCToken')
    usdcToken = await USDCToken.deploy('USD Coin', 'USDC', 0)

    transaction = await usdcToken.connect(deployer).mint(contributor.address, AMOUNTINUSDC)
    await transaction.wait()

    const Jetpacks = await ethers.getContractFactory('NFT')
    jetpacks = await Jetpacks.deploy(
      'Jetpacks',
      'JP',
      ether(.01),
      10,
      Date.now().toString().slice(0, 10),
      'x',
      10
    )

    const Hoverboards = await ethers.getContractFactory('NFT')
    hoverboards = await Hoverboards.deploy(
      'Hoverboards',
      'HB',
      ether(.01),
      10,
      Date.now().toString().slice(0, 10),
      'y',
      10
    )

    const AVAs = await ethers.getContractFactory('NFT')
    avas = await AVAs.deploy(
      'AVAs',
      'AVA',
      ether(.01),
      10,
      Date.now().toString().slice(0, 10),
      'z',
      10
    )

    const collections = [jetpacks.address, hoverboards.address, avas.address]

    const JACDDAO = await ethers.getContractFactory('JACD')
    jacdDAO = await JACDDAO.deploy(jacdToken.address, usdcToken.address, collections, 10, [5, 3, 1], 6, 3, tokens(12), 604800, 1209600)

    transaction = await jacdToken.connect(deployer).transferOwnership(jacdDAO.address)
    await transaction.wait()

    transaction = await usdcToken.connect(contributor).approve(jacdDAO.address, AMOUNTINUSDC)
    await transaction.wait()

    transaction = await jacdDAO.connect(contributor).receiveDeposit(AMOUNTINUSDC)
    await transaction.wait()
  })

  describe('Deployment', () => {
    it('initializes token contracts', async () => {
      expect(await jacdDAO.jacdToken()).to.equal(jacdToken.address)
      expect(await jacdDAO.usdcToken()).to.equal(usdcToken.address)
    })

    it('initializes NFT collection contracts', async () => {
      let collections = await jacdDAO.getCollections()

      expect(await jacdDAO.collectionsLength()).to.equal(3)
      expect(collections[0]).to.equal(jetpacks.address)
      expect(collections[1]).to.equal(hoverboards.address)
      expect(collections[2]).to.equal(avas.address)
    })

    it('exposes holders weights via getter', async () => {
      const weights = await jacdDAO.getHoldersWeights()

      expect(weights.length).to.equal(3)
      expect(weights[0]).to.equal(5)
      expect(weights[1]).to.equal(3)
      expect(weights[2]).to.equal(1)
    })

    it('rejects deployment when weights and collections lengths mismatch', async () => {
      const JACDDAO = await ethers.getContractFactory('JACD')

      await expect(JACDDAO.deploy(
        jacdToken.address,
        usdcToken.address,
        [jetpacks.address, hoverboards.address, avas.address],
        10,
        [5, 3],
        6,
        3,
        tokens(12),
        604800,
        1209600
      )).to.be.revertedWith('JACD: weights/collections length mismatch')
    })
  })

  describe('Receiving Deposits', () => {
    describe('Success', () => {
      it('accepts token deposits', async () => {
        expect(await usdcToken.balanceOf(contributor.address)).to.equal(0)
        expect(await usdcToken.balanceOf(jacdDAO.address)).to.equal(AMOUNTINUSDC)
        expect(await jacdDAO.usdcBalance()).to.equal(AMOUNTINUSDC)
      })

      it('distributes JACD tokens', async () => {
        expect(await jacdToken.balanceOf(contributor.address)).to.equal(AMOUNTINETH)
        expect(await jacdDAO.jacdSupply()).to.equal(AMOUNTINETH)
      })

      it('emits a Deposit event', async () => {
        await expect(transaction).to.emit(jacdDAO, 'Deposit').withArgs(
          contributor.address,
          AMOUNTINUSDC,
          (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
        )
      })
    })

    describe('Failure', () => {
      it('rejects deposits of 0', async () => {
        transaction = await usdcToken.connect(deployer).mint(contributor.address, AMOUNTINUSDC)
        await transaction.wait()

        transaction = await usdcToken.connect(contributor).approve(jacdDAO.address, AMOUNTINUSDC)
        await transaction.wait()

        await expect(jacdDAO.connect(contributor).receiveDeposit(0))
          .to.be.revertedWith('JACD: deposit amount of 0')
      })
    })
  })

  describe('Creating Proposals', () => {
    describe('Success', () => {
      beforeEach(async () => {
        transaction = await avas.connect(deployer).addToWhitelist(holder.address)
        await transaction.wait()

        transaction = await avas.connect(holder).mint(1, { value: ether(.01) })
        await transaction.wait()

        transaction = await jacdDAO.connect(holder).createProposal(rando.address, usdc(10), 'Prop 1', 'Description of Prop 1')
        await transaction.wait()
      })

      it('creates & stores a new proposal', async () => {
        expect(await jacdDAO.proposalCount()).to.equal(1)

        const proposal = await jacdDAO.proposals(1)
        expect(proposal.index).to.equal(1)
        expect(proposal.recipient).to.equal(rando.address)
        expect(proposal.amount).to.equal(usdc(10))
        expect(proposal.name).to.equal('Prop 1')
        expect(proposal.description).to.equal('Description of Prop 1')
        expect(proposal.votesFor).to.equal(0)
        expect(proposal.votesAgainst).to.equal(0)
        expect(proposal.stage).to.equal(0)
        expect(proposal.voteEnd).to.equal(
          (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
          .timestamp + 604800
        )
      })

      it('emits a Propose event', async () => {
        await expect(transaction).emit(jacdDAO, 'Propose').withArgs(
          1,
          rando.address,
          usdc(10),
          'Prop 1',
          'Description of Prop 1',
          holder.address,
          (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
        )
      })
    })

    describe('Failure', () => {
      beforeEach(async () => {
        transaction = await avas.connect(deployer).addToWhitelist(holder.address)
        await transaction.wait()

        transaction = await avas.connect(holder).mint(1, { value: ether(.01) })
        await transaction.wait()
      })

      it('rejects proposals from non-holders/non-contributors', async () => {
        await expect(jacdDAO.connect(rando).createProposal(
          deployer.address,
          usdc(10),
          'Prop 1',
          'Description of Prop 1'
        ))
          .to.be.revertedWith('JACD: not a holder or an contributor')
      })

      it('rejects proposals with amounts of 0', async () => {
        await expect(jacdDAO.connect(holder).createProposal(
          holder.address,
          0,
          'Prop 1',
          'Description of Prop 1'
        ))
          .to.be.revertedWith('JACD: proposal amount of 0')
      })

      it('rejects proposals with amounts of over % limit', async () => {
        await expect(jacdDAO.connect(holder).createProposal(
          holder.address,
          usdc(10.01),
          'Prop 1',
          'Description of Prop 1'
        ))
          .to.be.revertedWith('JACD: proposal exceeds limit')
      })

      it('rejects proposals with no name', async () => {
        await expect(jacdDAO.connect(holder).createProposal(
          holder.address,
          usdc(10),
          '',
          'Description of Prop 1'
        ))
          .to.be.revertedWith('JACD: no proposal name')
      })

      it('rejects proposals with no descritpion', async () => {
        await expect(jacdDAO.connect(holder).createProposal(
          holder.address,
          usdc(10),
          'Prop 1',
          ''
        ))
          .to.be.revertedWith('JACD: no proposal description')
      })

      it('rejects proposals with invalid recipient address', async () => {
        await expect(jacdDAO.connect(holder).createProposal(
          '0x0000000000000000000000000000000000000000',
          usdc(10),
          'Prop 1',
          'Description of Prop 1'
        ))
          .to.be.revertedWith('JACD: invalid proposal recipient address')
      })
    })
  })

  describe('Holder Voting', () => {
    beforeEach(async () => {
      transaction = await jetpacks.connect(deployer).addToWhitelist(holder.address)
      await transaction.wait()

      transaction = await jetpacks.connect(holder).mint(1, { value: ether(.01) })
      await transaction.wait()

      transaction = await hoverboards.connect(deployer).addToWhitelist(deployer.address)
      await transaction.wait()

      transaction = await hoverboards.connect(deployer).mint(2, { value: ether(.02) })
      await transaction.wait()

      transaction = await avas.connect(deployer).addToWhitelist(holder.address)
      await transaction.wait()

      transaction = await avas.connect(holder).mint(3, { value: ether(.03) })
      await transaction.wait()

      transaction = await jacdDAO.connect(deployer).createProposal(rando.address, usdc(10), 'Prop 1', 'Description of Prop 1')
      await transaction.wait()

    })

    describe('Success', () => {
      beforeEach(async () => {
        transaction = await jacdDAO.connect(holder).holdersVote(1, true)
        await transaction.wait()

        transaction = await jacdDAO.connect(deployer).holdersVote(1, false)
        await transaction.wait()
      })

      it('records holder votes', async () => {
        const proposal = await jacdDAO.proposals(1)
        expect(proposal.votesFor).to.equal(4)
        expect(proposal.votesAgainst).to.equal(2)

        expect(await jacdDAO.holderVoted(1, deployer.address)).to.equal(true)
        expect(await jacdDAO.holderVoted(1, holder.address)).to.equal(true)
      })

      it('emits a Vote event', async () => {
        await expect(transaction).to.emit(jacdDAO, 'Vote').withArgs(
          1,
          deployer.address,
          0,
          false,
          2,
          (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
        )
      })
    })

    describe('Failure', () => {
      it('rejects votes from non-holders', async () => {
        await expect(jacdDAO.connect(rando).holdersVote(1, false))
          .to.be.revertedWith('JACD: not a holder')
      })

      it('rejects voting on proposals not in holder stage', async () => {
        transaction = await jacdDAO.connect(holder).holdersVote(1, true)
        await transaction.wait()

        transaction = await jacdDAO.connect(deployer).holdersVote(1, false)
        await transaction.wait()

        transaction = await jacdDAO.connect(deployer).finalizeHoldersVote(1)
        await transaction.wait()

        await expect(jacdDAO.connect(holder).holdersVote(1, true))
          .to.be.revertedWith('JACD: not in "holder" voting stage')
      })

      it('rejects holders voting twice', async () => {
        transaction = await jacdDAO.connect(holder).holdersVote(1, true)
        await transaction.wait()

        await expect(jacdDAO.connect(holder).holdersVote(1, true))
        .to.be.revertedWith('JACD: holder already voted')
      })

      it('rejects voting after end time', async () => {
        await time.increase(604801)

        await expect(jacdDAO.connect(holder).holdersVote(1, true))
          .to.be.revertedWith('JACD: holder voting expired')
      })
    })
  })

  describe('Finalizing Holder Vote', () => {
    beforeEach(async () => {
      transaction = await jetpacks.connect(deployer).addToWhitelist(holder.address)
      await transaction.wait()

      transaction = await hoverboards.connect(deployer).addToWhitelist(deployer.address)
      await transaction.wait()

      transaction = await avas.connect(deployer).addToWhitelist(holder.address)
      await transaction.wait()

      transaction = await jetpacks.connect(holder).mint(1, { value: ether(.01) })
      await transaction.wait()

      transaction = await hoverboards.connect(deployer).mint(2, { value: ether(.02) })
      await transaction.wait()

      transaction = await avas.connect(holder).mint(3, { value: ether(.03) })
      await transaction.wait()
    })

    describe('Success', () => {
      describe('Passing Proposals', () => {
        beforeEach(async () => {
          transaction = await jacdDAO.connect(deployer).createProposal(rando.address, usdc(10), 'Prop 1', 'Description of Prop 1')
          await transaction.wait()
        })

        it('allows proposals with all votes submitted to be finalized', async () => {
          transaction = await jacdDAO.connect(holder).holdersVote(1, true)
          await transaction.wait()

          transaction = await jacdDAO.connect(deployer).holdersVote(1, false)
          await transaction.wait()

          transaction = await jacdDAO.connect(holder).finalizeHoldersVote(1)
          await transaction.wait()

          await expect(transaction).to.emit(jacdDAO, 'VotePass')
        })

        it('resets proposal for next voting stage', async () => {
          transaction = await jacdDAO.connect(holder).holdersVote(1, true)
          await transaction.wait()

          time.increase(604801)

          transaction = await jacdDAO.connect(holder).finalizeHoldersVote(1)
          await transaction.wait()

          let proposal = await jacdDAO.proposals(1)

          expect(proposal.stage).to.equal(1)
          expect(proposal.votesFor).to.equal(0)
          expect(proposal.votesAgainst).to.equal(0)
          expect(proposal.voteEnd).to.equal(
            (await ethers.provider.getBlock(await ethers.provider.getBlockNumber()))
            .timestamp + 1209599
          )
        })

        it('emits a VotePass event', async () => {
          transaction = await jacdDAO.connect(holder).holdersVote(1, true)
          await transaction.wait()

          time.increase(604801)

          transaction = await jacdDAO.connect(holder).finalizeHoldersVote(1)
          await transaction.wait()

          await expect(transaction).to.emit(jacdDAO, 'VotePass').withArgs(
            1,
            0,
            4,
            0
          )
        })
      })

      describe('Failing Proposals', () => {
        it('fails a proposal with less than 50% holder votes', async () => {
          transaction = await jacdDAO.connect(deployer).createProposal(rando.address, usdc(.1), 'Prop 1', 'Description of Prop 1')
          await transaction.wait()

          transaction = await jacdDAO.connect(deployer).holdersVote(1, true)
          await transaction.wait()

          time.increase(604801)

          transaction = await jacdDAO.connect(holder).finalizeHoldersVote(1)
          await transaction.wait()

          let proposal = await jacdDAO.proposals(1)
          expect(proposal.stage).to.equal(3)
        })

        it('fails a proposal with majority down votes', async () => {
          transaction = await jacdDAO.connect(deployer).createProposal(rando.address, usdc(.1), 'Prop 1', 'Description of Prop 1')
          await transaction.wait()

          transaction = await jacdDAO.connect(holder).holdersVote(1, false)
          await transaction.wait()

          time.increase(604801)

          transaction = await jacdDAO.connect(holder).finalizeHoldersVote(1)
          await transaction.wait()

          let proposal = await jacdDAO.proposals(1)
          expect(proposal.stage).to.equal(3)
        })
      })
    })

    describe('Failure', () => {
      beforeEach(async () => {
        transaction = await jacdDAO.connect(deployer).createProposal(rando.address, usdc(.1), 'Prop 1', 'Description of Prop 1')
        await transaction.wait()
      })

      it('prevents finalization before end time is reached', async () => {
        transaction = await jacdDAO.connect(holder).holdersVote(1, true)
        await transaction.wait()

        await expect(jacdDAO.connect(holder).finalizeHoldersVote(1))
          .to.be.revertedWith('JACD: vote has not ended')
      })

      it('rejects finalization from non-holders', async () => {
        await expect(jacdDAO.connect(rando).finalizeHoldersVote(1))
          .to.be.revertedWith('JACD: not a holder')
      })

      it('rejects finalization of proposals not in holders stage', async () => {
        transaction = await jacdDAO.connect(deployer).createProposal(rando.address, usdc(.1), 'Prop 1', 'Description of Prop 1')
        await transaction.wait()

        transaction = await jacdDAO.connect(holder).holdersVote(1, true)
        await transaction.wait()

        transaction = await jacdDAO.connect(deployer).holdersVote(1, false)
        await transaction.wait()

        transaction = await jacdDAO.connect(holder).finalizeHoldersVote(1)
        await transaction.wait()

        await expect(jacdDAO.connect(holder).finalizeHoldersVote(1))
          .to.be.revertedWith('JACD: not in "holder" voting stage')
      })
    })
  })

  describe('Open Voting', () => {
    beforeEach(async () => {
      transaction = await jetpacks.connect(deployer).addToWhitelist(holder.address)
      await transaction.wait()

      transaction = await hoverboards.connect(deployer).addToWhitelist(deployer.address)
      await transaction.wait()

      transaction = await avas.connect(deployer).addToWhitelist(holder.address)
      await transaction.wait()

      transaction = await jetpacks.connect(holder).mint(1, { value: ether(.01) })
      await transaction.wait()

      transaction = await hoverboards.connect(deployer).mint(2, { value: ether(.02) })
      await transaction.wait()

      transaction = await avas.connect(holder).mint(3, { value: ether(.03) })
      await transaction.wait()

      transaction = await jacdDAO.connect(deployer).createProposal(rando.address, usdc(10), 'Prop 1', 'Description of Prop 1')
      await transaction.wait()

      transaction = await jacdDAO.connect(holder).holdersVote(1, true)
      await transaction.wait()

      transaction = await jacdDAO.connect(deployer).holdersVote(1, false)
      await transaction.wait()

      transaction = await jacdDAO.connect(holder).finalizeHoldersVote(1)
      await transaction.wait()

      transaction = await usdcToken.connect(deployer).mint(contributor.address, usdc(1))
      await transaction.wait()

      transaction = await usdcToken.connect(contributor).approve(jacdDAO.address, usdc(1))
      await transaction.wait()

      transaction = await jacdDAO.connect(contributor).receiveDeposit(usdc(1))
      await transaction.wait()

      transaction = await jacdToken.connect(deployer).approve(jacdDAO.address, tokens(1))
      await transaction.wait()

      transaction = await jacdToken.connect(contributor).approve(jacdDAO.address, tokens(1))
      await transaction.wait()
    })

    describe('Success', () => {
      beforeEach(async () => {
        transaction = await jacdDAO.connect(holder).openVote(1, true, 0)
        await transaction.wait()

        transaction = await jacdDAO.connect(deployer).openVote(1, false, 0)
        await transaction.wait()

        transaction = await jacdDAO.connect(contributor).openVote(1, true, votes(1))
        await transaction.wait()
      })

      it('records the votes', async () => {
        let proposal = await jacdDAO.proposals(1)

        expect(proposal.votesFor).to.equal(votes(9))
        expect(proposal.votesAgainst).to.equal(votes(6))
      })

      it('updates a holders voting status', async () => {
        expect(await jacdDAO.holderOpenVoted(1, holder.address)).to.equal(true)
      })

      it('allows holder to submit second jacd tokens only vote', async () => {
        transaction = await usdcToken.connect(deployer).mint(holder.address, tokens(1))
        await transaction.wait()

        transaction = await usdcToken.connect(holder).approve(jacdDAO.address, tokens(1))
        await transaction.wait()

        transaction = await jacdDAO.connect(holder).receiveDeposit(tokens(1))
        await transaction.wait()

        transaction = await jacdToken.connect(holder).approve(jacdDAO.address, tokens(1))
        await transaction.wait()

        expect(await jacdDAO.holderOpenVoted(1, holder.address)).to.equal(true)

        transaction = await jacdDAO.connect(holder).openVote(1, true, votes(1))
        await transaction.wait()

        let proposal = await jacdDAO.proposals(1)

        expect(proposal.votesFor).to.equal(votes(10))
      })

      it('burns JACD tokens for votes', async () => {
        expect(await jacdToken.totalSupply()).to.equal(AMOUNTINETH)
        expect(await jacdToken.balanceOf(contributor.address)).to.equal(AMOUNTINETH)
      })

      it('emits a Vote event', async () => {
        await expect(transaction).to.emit(jacdDAO, 'Vote').withArgs(
          1,
          contributor.address,
          1,
          true,
          votes(1),
          (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp
        )
      })
    })

    describe('Failure', () => {
      it('rejects votes from non-holders/non-contributors', async () => {
        await expect(jacdDAO.connect(rando).openVote(1, true, 0))
          .to.be.rejectedWith('JACD: not a holder or an contributor')
      })

      it('rejects votes on proposals not in open stage', async () => {
        transaction = await jacdDAO.connect(deployer).createProposal(rando.address, usdc(1), 'Prop 2', 'Description of Prop 2')
        await transaction.wait()

        await expect(jacdDAO.connect(holder).openVote(2, true, 0))
          .to.be.revertedWith('JACD: not in "open" voting stage ')
      })

      it('prevents holders voting twice/votes with 0 JACD tokens', async () => {
        transaction = await jacdDAO.connect(holder).openVote(1, true, 0)
        await transaction.wait()

        await expect(jacdDAO.connect(holder).openVote(1, true, votes(1)))
          .to.be.rejectedWith('JACD: no votes/already voted')
      })

      it('rejects voting more than amount of JACD token balance', async () => {
        transaction = await jacdToken.connect(contributor).approve(jacdDAO.address, votes(1000))
        await transaction.wait()

        await expect(jacdDAO.connect(contributor).openVote(1, true, votes(101.01)))
          .to.be.revertedWith('JACD: insufficient JACD token votes')
      })

      it('rejects voting after time expired', async () => {
        time.increase(1209601)

        await expect(jacdDAO.connect(holder).openVote(1, true, 0))
          .to.be.revertedWith('JACD: voting time expired')
      })
    })
  })

  describe('Finalizing Proposal', () => {
    beforeEach(async () => {
      transaction = await jetpacks.connect(deployer).addToWhitelist(holder.address)
      await transaction.wait()

      transaction = await hoverboards.connect(deployer).addToWhitelist(holder.address)
      await transaction.wait()

      transaction = await avas.connect(deployer).addToWhitelist(deployer.address)
      await transaction.wait()

      transaction = await jetpacks.connect(holder).mint(1, { value: ether(.01) })
      await transaction.wait()

      transaction = await hoverboards.connect(holder).mint(2, { value: ether(.02) })
      await transaction.wait()

      transaction = await avas.connect(deployer).mint(3, { value: ether(.03) })
      await transaction.wait()

      transaction = await jacdDAO.connect(deployer).createProposal(rando.address, usdc(10), 'Prop 1', 'Description of Prop 1')
      await transaction.wait()

      transaction = await jacdDAO.connect(holder).holdersVote(1, true)
      await transaction.wait()

      transaction = await jacdDAO.connect(deployer).holdersVote(1, true)
      await transaction.wait()

      transaction = await jacdDAO.connect(holder).finalizeHoldersVote(1)
      await transaction.wait()

      transaction = await usdcToken.connect(deployer).mint(contributor.address, usdc(1))
      await transaction.wait()

      transaction = await usdcToken.connect(contributor).approve(jacdDAO.address, usdc(1))
      await transaction.wait()

      transaction = await jacdDAO.connect(contributor).receiveDeposit(usdc(1))
      await transaction.wait()

      transaction = await jacdToken.connect(contributor).approve(jacdDAO.address, tokens(1))
      await transaction.wait()
    })

    describe('Success', () => {
      describe('Passing Proposals', () => {
        beforeEach(async () => {
          transaction = await jacdDAO.connect(holder).openVote(1, true, 0)
          await transaction.wait()

          transaction = await jacdDAO.connect(deployer).openVote(1, false, 0)
          await transaction.wait()

          transaction = await jacdDAO.connect(contributor).openVote(1, true, tokens(1))
          await transaction.wait()

          time.increase(1209601)

          transaction = await jacdDAO.connect(holder).finalizeProposal(1)
          await transaction.wait()
        })

        it('transfers USDC tokens', async () => {
          expect(await usdcToken.balanceOf(rando.address)).to.equal(usdc(10))
          expect(await usdcToken.balanceOf(jacdDAO.address)).to.equal(usdc(91))
        })

        it('updates usdc balance', async () => {
          expect(await jacdDAO.usdcBalance()).to.equal(usdc(91))
        })

        it('updates proposal stage', async () => {
          let proposal = await jacdDAO.proposals(1)

          expect(await proposal.stage).to.equal(2)
        })

        it('emits a VotePass event', async () => {
          let proposal = await jacdDAO.proposals(1)

          await expect(transaction).to.emit(jacdDAO, 'VotePass').withArgs(
            1,
            1,
            proposal.votesFor,
            proposal.votesAgainst
          )
        })
      })

      describe('Failing Proposals', () => {
        it('fails a proposal with not enough votes', async () => {
          transaction = await jacdDAO.connect(holder).openVote(1, true, 0)
          await transaction.wait()

          time.increase(1209601)

          transaction = await jacdDAO.connect(holder).finalizeProposal(1)
          await transaction.wait()

          let proposal = await jacdDAO.proposals(1)

          expect(await proposal.stage).to.equal(3)
        })

        it('fails a proposal with a majority down votes', async () => {
          transaction = await jacdDAO.connect(holder).openVote(1, false, 0)
          await transaction.wait()

          transaction = await jacdDAO.connect(deployer).openVote(1, true, 0)
          await transaction.wait()

          transaction = await jacdDAO.connect(contributor).openVote(1, false, tokens(1))
          await transaction.wait()

          time.increase(1209601)

          transaction = await jacdDAO.connect(holder).finalizeProposal(1)
          await transaction.wait()

          let proposal = await jacdDAO.proposals(1)

          expect(await proposal.stage).to.equal(3)
        })
      })
    })

    describe('Failure', () => {
      beforeEach(async () => {
        transaction = await jacdDAO.connect(holder).openVote(1, true, 0)
        await transaction.wait()

        transaction = await jacdDAO.connect(deployer).openVote(1, false, 0)
        await transaction.wait()

        transaction = await jacdDAO.connect(contributor).openVote(1, true, tokens(1))
        await transaction.wait()
      })

      it('prevents finalization until voting time expires', async () => {
        await expect(jacdDAO.connect(holder).finalizeProposal(1))
          .to.be.revertedWith('JACD: vote has not ended')
      })

      it('rejects finalization from non-holders', async () => {
        await expect(jacdDAO.connect(rando).finalizeProposal(1))
          .to.be.revertedWith('JACD: not a holder')
      })

      it('prevents finalization for insufficient USDC balance', async () => {
        for(i = 2; i < 12; i++) {
          transaction = await jacdDAO.connect(deployer).createProposal(rando.address, usdc(10), 'Prop 1', 'Description of Prop 1')
          await transaction.wait()

          transaction = await jacdDAO.connect(holder).holdersVote(i, true)
          await transaction.wait()

          transaction = await jacdDAO.connect(deployer).holdersVote(i, true)
          await transaction.wait()

          transaction = await jacdDAO.connect(holder).finalizeHoldersVote(i)
          await transaction.wait()

          transaction = await jacdDAO.connect(holder).openVote(i, true, 0)
          await transaction.wait()

          transaction = await jacdDAO.connect(deployer).openVote(i, true, 0)
          await transaction.wait()
        }

        time.increase(1209601)

        for(i = 2; i < 12; i++) {
          transaction = await jacdDAO.connect(holder).finalizeProposal(i)
          await transaction.wait()
        }

        await expect(jacdDAO.connect(holder).finalizeProposal(1))
          .to.be.revertedWith('JACD: insufficient USDC balance')
      })
    })
  })

  describe('Faucet Request', () => {
    const totalNftBalance = async (addr) =>
      (await jetpacks.balanceOf(addr)).toNumber() +
      (await hoverboards.balanceOf(addr)).toNumber() +
      (await avas.balanceOf(addr)).toNumber()

    describe('Success', () => {
      beforeEach(async () => {
        transaction = await usdcToken.connect(deployer).mint(deployer.address, usdc(1000))
        await transaction.wait()

        transaction = await usdcToken.connect(deployer).approve(jacdDAO.address, usdc(1000))
        await transaction.wait()

        for (const nft of [jetpacks, hoverboards, avas]) {
          transaction = await nft.connect(deployer).addToWhitelist(deployer.address)
          await transaction.wait()

          transaction = await nft.connect(deployer).mint(1, { value: ether(.01) })
          await transaction.wait()

          transaction = await nft.connect(deployer).setApprovalForAll(jacdDAO.address, true)
          await transaction.wait()
        }

        transaction = await jacdDAO.connect(rando).faucetRequest(deployer.address)
        await transaction.wait()
      })

      it('tops up requester USDC to 100 and gives one NFT', async () => {
        expect(await usdcToken.balanceOf(rando.address)).to.equal(usdc(100))
        expect(await totalNftBalance(rando.address)).to.equal(1)
      })

      it('emits FaucetClaim with usdcAmount and tokenId when both are given', async () => {
        await expect(transaction)
          .to.emit(jacdDAO, 'FaucetClaim')
          .withArgs(rando.address, anyValue, 1, usdc(100))
      })

      it('transfers just enough USDC so requestor has 100', async () => {
        transaction = await usdcToken.connect(rando).approve(jacdDAO.address, usdc(50))
        await transaction.wait()

        transaction = await jacdDAO.connect(rando).receiveDeposit(usdc(50))
        await transaction.wait()

        transaction = await jacdDAO.connect(rando).faucetRequest(deployer.address)
        await transaction.wait()

        expect(await usdcToken.balanceOf(rando.address)).to.equal(usdc(100))
      })

      it('does not transfer an nft if requester already holds one of every collection', async () => {
        for (const nft of [jetpacks, hoverboards, avas]) {
          if ((await nft.balanceOf(rando.address)).toNumber() > 0) continue

          transaction = await nft.connect(deployer).addToWhitelist(rando.address)
          await transaction.wait()

          transaction = await nft.connect(rando).mint(1, { value: ether(.01) })
          await transaction.wait()
        }

        expect(await totalNftBalance(rando.address)).to.equal(3)

        transaction = await jacdDAO.connect(rando).faucetRequest(deployer.address)
        await transaction.wait()

        expect(await totalNftBalance(rando.address)).to.equal(3)
      })

      it('emits FaucetClaim with tokenId>0 and usdcAmount=0 when requester is at 100 USDC but missing the rolled NFT', async () => {
        for (const nft of [jetpacks, hoverboards, avas]) {
          const tokenIds = await nft.walletOfOwner(rando.address)
          if (tokenIds.length === 0) continue

          transaction = await nft.connect(rando).transferFrom(rando.address, deployer.address, tokenIds[0])
          await transaction.wait()
        }

        transaction = await jacdDAO.connect(rando).faucetRequest(deployer.address)

        await expect(transaction)
          .to.emit(jacdDAO, 'FaucetClaim')
          .withArgs(rando.address, anyValue, 1, 0)
      })

      it('emits FaucetClaim with tokenId=0 and usdcAmount=0 when requester is fully topped up', async () => {
        for (const nft of [jetpacks, hoverboards, avas]) {
          if ((await nft.balanceOf(rando.address)).toNumber() > 0) continue

          transaction = await nft.connect(deployer).addToWhitelist(rando.address)
          await transaction.wait()

          transaction = await nft.connect(rando).mint(1, { value: ether(.01) })
          await transaction.wait()
        }

        transaction = await jacdDAO.connect(rando).faucetRequest(deployer.address)

        await expect(transaction)
          .to.emit(jacdDAO, 'FaucetClaim')
          .withArgs(rando.address, anyValue, 0, 0)
      })
    })

    describe('Failure', () => {
      it('rejects requests with invalid sender address', async () => {
        await expect(jacdDAO.connect(rando).faucetRequest(
          '0x0000000000000000000000000000000000000000'
        ))
          .to.be.revertedWith('JACD: invalid faucet sender address')
      })

      it('rejects requests for insufficient USDC balance', async () => {
        await expect(jacdDAO.connect(rando).faucetRequest(
          deployer.address
        ))
          .to.be.revertedWith('JACD: not enough remaining USDC for faucet')
      })

      it('still tops up USDC even when source has no NFTs to give', async () => {
        transaction = await usdcToken.connect(deployer).mint(deployer.address, usdc(100))
        await transaction.wait()

        transaction = await usdcToken.connect(deployer).approve(jacdDAO.address, usdc(100))
        await transaction.wait()

        const nftsBefore = await totalNftBalance(rando.address)

        transaction = await jacdDAO.connect(rando).faucetRequest(deployer.address)
        await transaction.wait()

        expect(await usdcToken.balanceOf(rando.address)).to.equal(usdc(100))
        expect(await totalNftBalance(rando.address)).to.equal(nftsBefore)
      })

      it('emits FaucetClaim with tokenId=0 and usdcAmount=100 when source has no NFTs', async () => {
        transaction = await usdcToken.connect(deployer).mint(deployer.address, usdc(100))
        await transaction.wait()

        transaction = await usdcToken.connect(deployer).approve(jacdDAO.address, usdc(100))
        await transaction.wait()

        transaction = await jacdDAO.connect(rando).faucetRequest(deployer.address)

        await expect(transaction)
          .to.emit(jacdDAO, 'FaucetClaim')
          .withArgs(rando.address, anyValue, 0, usdc(100))
      })
    })
  })

  describe('Token Failure Paths', () => {
    it('reverts receiveDeposit when USDC transferFrom returns false', async () => {
      const MockBadERC20 = await ethers.getContractFactory('MockBadERC20')
      const badUsdc = await MockBadERC20.deploy()

      transaction = await badUsdc.setFailTransferFrom(true)
      await transaction.wait()

      const collections = [jetpacks.address, hoverboards.address, avas.address]
      const JACDDAO = await ethers.getContractFactory('JACD')
      const badDAO = await JACDDAO.deploy(
        jacdToken.address, badUsdc.address, collections,
        10, [5, 3, 1], 6, 3, tokens(12), 604800, 1209600
      )

      await expect(badDAO.connect(contributor).receiveDeposit(usdc(100)))
        .to.be.revertedWith('JACD: USDC transfer failed')
    })

    it('reverts receiveDeposit when JACD mint returns false', async () => {
      const MockBadJACDToken = await ethers.getContractFactory('MockBadJACDToken')
      const badJacd = await MockBadJACDToken.deploy('Bad JACD', 'BJACD')

      const collections = [jetpacks.address, hoverboards.address, avas.address]
      const JACDDAO = await ethers.getContractFactory('JACD')
      const badDAO = await JACDDAO.deploy(
        badJacd.address, usdcToken.address, collections,
        10, [5, 3, 1], 6, 3, tokens(12), 604800, 1209600
      )

      transaction = await badJacd.connect(deployer).transferOwnership(badDAO.address)
      await transaction.wait()

      transaction = await usdcToken.connect(deployer).mint(contributor.address, AMOUNTINUSDC)
      await transaction.wait()

      transaction = await usdcToken.connect(contributor).approve(badDAO.address, AMOUNTINUSDC)
      await transaction.wait()

      await expect(badDAO.connect(contributor).receiveDeposit(AMOUNTINUSDC))
        .to.be.revertedWith('JACD: distribution of JACD tokens failed')
    })

    it('reverts finalizeProposal when USDC transfer returns false', async () => {
      const MockBadERC20 = await ethers.getContractFactory('MockBadERC20')
      const badUsdc = await MockBadERC20.deploy()

      const FreshJACDToken = await ethers.getContractFactory('JACDToken')
      const freshJacd = await FreshJACDToken.deploy('JACD Coin', 'JACD')

      const collections = [jetpacks.address, hoverboards.address, avas.address]
      const JACDDAO = await ethers.getContractFactory('JACD')
      const badDAO = await JACDDAO.deploy(
        freshJacd.address, badUsdc.address, collections,
        10, [5, 3, 1], 6, 3, tokens(12), 604800, 1209600
      )

      transaction = await freshJacd.connect(deployer).transferOwnership(badDAO.address)
      await transaction.wait()

      transaction = await badUsdc.mint(contributor.address, usdc(100))
      await transaction.wait()

      transaction = await badUsdc.connect(contributor).approve(badDAO.address, usdc(100))
      await transaction.wait()

      transaction = await badDAO.connect(contributor).receiveDeposit(usdc(100))
      await transaction.wait()

      transaction = await jetpacks.connect(deployer).addToWhitelist(holder.address)
      await transaction.wait()

      transaction = await hoverboards.connect(deployer).addToWhitelist(holder.address)
      await transaction.wait()

      transaction = await avas.connect(deployer).addToWhitelist(deployer.address)
      await transaction.wait()

      transaction = await jetpacks.connect(holder).mint(1, { value: ether(.01) })
      await transaction.wait()

      transaction = await hoverboards.connect(holder).mint(2, { value: ether(.02) })
      await transaction.wait()

      transaction = await avas.connect(deployer).mint(3, { value: ether(.03) })
      await transaction.wait()

      transaction = await badDAO.connect(deployer).createProposal(rando.address, usdc(10), 'Prop 1', 'Description of Prop 1')
      await transaction.wait()

      transaction = await badDAO.connect(holder).holdersVote(1, true)
      await transaction.wait()

      transaction = await badDAO.connect(deployer).holdersVote(1, true)
      await transaction.wait()

      transaction = await badDAO.connect(holder).finalizeHoldersVote(1)
      await transaction.wait()

      transaction = await badDAO.connect(holder).openVote(1, true, 0)
      await transaction.wait()

      transaction = await badDAO.connect(deployer).openVote(1, true, 0)
      await transaction.wait()

      await time.increase(1209601)

      transaction = await badUsdc.setFailTransfer(true)
      await transaction.wait()

      await expect(badDAO.connect(holder).finalizeProposal(1)).to.be.reverted
    })
  })
})
