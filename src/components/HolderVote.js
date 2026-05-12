/* #region Dependencies */

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import Card from 'react-bootstrap/Card'
import Table from 'react-bootstrap/Table'
import Countdown from 'react-countdown'
import Button from 'react-bootstrap/Button'
import Modal from 'react-bootstrap/Modal'
import Spinner from 'react-bootstrap/Spinner'

import { addToast } from '../store/reducers/toasts'

import {
  loadDAOBalances,
  loadProposals,
  loadHolderProposals,
  submitHoldersVote,
  finalizeHoldersVote,
  loadOpenProposals,
  loadClosedProposals,
  loadHolderVoteStatus,
  loadHolderOpenVoteStatus,
  resultToToast
} from '../store/interactions'
/* #endregion */

const HolderVote = () => {
  /* #region Component Variables */

  const dispatch = useDispatch()

  const [userHolderVotes, setUserHolderVotes] = useState(0)
  const [votingClosed, setVotingClosed] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [selectedProposal, setSelectedProposal] = useState(null)
  const [isVoting, setIsVoting] = useState(false)

  const provider = useSelector((state) => state.provider.connection)
  const account = useSelector((state) => state.provider.account)
  const tokens = useSelector((state) => state.tokens.contracts)
  const symbols = useSelector((state) => state.tokens.symbols)
  const nftBalances = useSelector((state) => state.nfts.nftBalances)
  const dao = useSelector((state) => state.dao.contract)
  const holderVotes = useSelector((state) => state.dao.holderVotes)
  const minHolderVotesToPass = useSelector((state) => state.dao.minHolderVotesToPass)
  const holderProposals = useSelector((state) => state.dao.holderProposals)
  const holderVoteStatus = useSelector((state) => state.dao.holderVoteStatus)
/* #endregion */

  /* #region Component Functions */

  const formatUSDC = (n) => {
    return n / 10**6
  }

  const buildVotingClosed = () => {
    const votingClosed = []

    for(let i = 0; i < holderProposals.length; i++) {
      if(Date.now() < (holderProposals[i].voteEnd * 1000)) {
        votingClosed.push(false)
      } else {
        votingClosed.push(true)
      }
    }

    setVotingClosed(votingClosed)
  }

  const showVoteModal = (e) => {
    setShowModal(true)
    const proposal = e.target.value.split(',')
    setSelectedProposal(proposal)
  }

  const dismissModal = () => {
    setShowModal(false)
    setSelectedProposal(null)
  }

  const voteHandler = async (e) => {
    setIsVoting(true)

    let voteFor

    if(e.target.value === 'true') {
      voteFor = true
    } else {
      voteFor = false
    }

    const result = await submitHoldersVote(provider, dao, selectedProposal[0], voteFor)

    const proposals = await loadProposals(dao, dispatch)
    const holderProposals = await loadHolderProposals(proposals, dispatch)
    await loadHolderVoteStatus(dao, holderProposals, account, dispatch)

    dismissModal()
    setIsVoting(false)

    dispatch(addToast(resultToToast(result, 'Vote submitted successfully.', 'Vote submission failed')))
  }

  const finalizeHandler = async (e) => {
    const result = await finalizeHoldersVote(provider, dao, e.target.value)

    const proposals = await loadProposals(dao, dispatch)
    const holderProposals = await loadHolderProposals(proposals, dispatch)
    await loadHolderVoteStatus(dao, holderProposals, account, dispatch)
    const openProposals = await loadOpenProposals(proposals, dispatch)
    await loadHolderOpenVoteStatus(dao, openProposals, account, dispatch)
    await loadClosedProposals(proposals, dispatch)
    await loadDAOBalances(tokens, dao, dispatch)

    dispatch(addToast(resultToToast(result, 'Holder stage finalized.', 'Finalization failed')))
  }
  /* #endregion */

  /* #region Hooks */

  useEffect(() => {
    if (!account) return
    setUserHolderVotes(nftBalances.reduce((sum, b) => sum + +b, 0))
  }, [account, nftBalances])
  /* #endregion */

  return(
    <>
      <Card className='my-4'>
        <Card.Header as='h3' >Holding Voting Proposals</Card.Header>
        {account ? (
          <Card.Body>
              <Table striped bordered hover >
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Recipient</th>
                    <th>Amount</th>
                    <th>Votes For</th>
                    <th>Votes Against</th>
                    <th>Actions</th>
                    <th>Time Remaining</th>
                  </tr>
                </thead>
                {holderProposals.length === 0 ? (
                  <tbody>
                  <tr>
                    <td colSpan='8' style={{textAlign: 'center'}}>No proposals currently in holder voting phase</td>
                  </tr>
                  </tbody>
                ) : (
                  <tbody>
                    {holderProposals.map((proposal, index) => (
                      <tr key={index}>
                        <td>{proposal.index.toString()}</td>
                        <td>{proposal.name}</td>
                        <td>{`${proposal.recipient.slice(0, 6)}...${proposal.recipient.slice(-4)}`}</td>
                        <td>{formatUSDC(proposal.amount)} {symbols[1]}</td>
                        <td>{proposal.votesFor.toString()}</td>
                        <td>{proposal.votesAgainst.toString()}</td>
                        <td>
                          {userHolderVotes > 0 && (
                            (+(proposal.votesFor.toString()) + +(proposal.votesAgainst.toString())) === +holderVotes || votingClosed[index] ? (
                              <Button value={proposal.index} onClick={finalizeHandler}>Finalize</Button>
                            ) : (
                              <div>
                                {holderVoteStatus[index] ? (
                                  <p>You have voted</p>
                                ) : (
                                  <>
                                    <Button value={proposal} onClick={showVoteModal}>View/Vote</Button>
                                  </>
                                  )
                                }
                              </div>
                          ))}
                        </td>
                        <td><Countdown date={(proposal.voteEnd * 1000) + 1000} onComplete={buildVotingClosed} /></td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </Table>
              {userHolderVotes === 0 && <p style={{color: 'red'}}>Purchase a NFT to participate in holder voting.</p>}
          </Card.Body>
        ) : (
          <Card.Body>Please connect wallet</Card.Body>
        )}
        <Card.Footer>
          <Card.Subtitle>Holder Voting Specifications</Card.Subtitle>
          <Card.Text>
            Votes per NFT held: 1
            <br />
            Total holder votes: {holderVotes}
            <br />
            Minimum holder votes submitted to pass proposal: {minHolderVotesToPass}
          </Card.Text>
        </Card.Footer>
      </Card>

      {selectedProposal && (
        <Modal show={showModal} onHide={dismissModal} centered backdrop='static'>
          <Modal.Header closeButton>
            <Modal.Title>{selectedProposal[3]}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p><strong>Recepient: </strong>{selectedProposal[1].slice(0, 6)}...{selectedProposal[1].slice(-4)}</p>
            <p><strong>Amount: </strong>{formatUSDC(selectedProposal[2])} {symbols[1]}</p>
            <p><strong>Description: </strong>{selectedProposal[4]}</p>
            <p><strong>Holder Votes To Submit: </strong>{userHolderVotes}</p>
          </Modal.Body>
          <Modal.Footer>
            {isVoting ? (
              <Spinner animation='border' className='d-block mx-auto' />
            ) : (
              <div  className='d-block mx-auto'>
                <Button onClick={voteHandler} value={true}>Vote For</Button>
                <Button className='mx-2' onClick={voteHandler} value={false}>Vote Against</Button>
                <Button onClick={dismissModal}>Cancel</Button>
              </div>
            )}
          </Modal.Footer>
        </Modal>
      )}
    </>
  )
}

export default HolderVote
