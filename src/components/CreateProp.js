/* #region Dependencies */

import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import InputGroup from 'react-bootstrap/InputGroup'
import Spinner from 'react-bootstrap/Spinner'

import { addToast } from '../store/reducers/toasts'

import {
  createProposal,
  loadDAOBalances,
  loadHolderProposals,
  loadHolderVoteStatus,
  loadProposals,
  resultToToast
} from '../store/interactions'
/* #endregion */

const Info = () => {

  /* #region Component Variables */
  const dispatch = useDispatch()

  const [isDAOMember, setIsDAOMember] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isWaiting, setIsWaiting] = useState(false)

  const provider = useSelector((state) => state.provider.connection)
  const account = useSelector((state) => state.provider.account)
  const tokens = useSelector((state) => state.tokens.contracts)
  const symbols = useSelector((state) => state.tokens.symbols)
  const balances = useSelector((state) => state.tokens.balances)
  const dao = useSelector((state) => state.dao.contract)
  const availableBalance = useSelector((state) => state.dao.availableBalance)
  const maxPropAmtPercent = useSelector((state) => state.dao.maxProposalAmountPercent)
  const nftBalances = useSelector((state) => state.nfts.nftBalances)
  /* #endregion */

  /* #region Component Functions */

  const submitHandler = async (e) => {
    e.preventDefault()

    const maxAmount = maxPropAmtPercent * availableBalance / 100
    if (+amount > maxAmount) {
      dispatch(addToast({
        message: `Proposal amount of ${amount} ${symbols[1]} exceeds the limit of ${maxAmount} ${symbols[1]}.`,
        variant: 'danger'
      }))
      return
    }

    setIsWaiting(true)

    const result = await createProposal(provider, dao, recipient, amount, name, description, dispatch)

    const proposals = await loadProposals(dao, dispatch)
    const holderProposals = await loadHolderProposals(proposals, dispatch)
    await loadHolderVoteStatus(dao, holderProposals, account, dispatch)
    await loadDAOBalances(tokens, dao, dispatch)

    if (result.ok) {
      setRecipient('')
      setAmount('')
      setName('')
      setDescription('')
    }
    setIsWaiting(false)

    dispatch(addToast(resultToToast(result, 'Proposal submitted successfully.', 'Proposal submission failed')))
  }
  /* #endregion */

  /* #region Hooks */

  useEffect(() => {
    if (!account) return

    const hasTokens = balances[0] > 0
    const hasNFT = nftBalances.some(b => b > 0)
    setIsDAOMember(hasTokens || hasNFT)
  }, [account, balances, nftBalances])
  /* #endregion */

  return(
    <Card className='my-4 mx-auto' style={{maxWidth: '500px', minHeight: '300px'}}>
        <Card.Header as='h3' >New Proposals</Card.Header>
        {account ? (
          isDAOMember ? (
            <Card.Body>
              <Form onSubmit={submitHandler}>
                <Form.Group className='mb-3'>
                  <Form.Label>Recipient</Form.Label>
                  <Form.Control
                    type='text'
                    required
                    onChange={(e) => setRecipient(e.target.value)}
                    value={recipient}
                    placeholder='Enter wallet address'
                  />
                </Form.Group>
                <Form.Group className='mb-3'>
                  <Form.Label>Amount</Form.Label>
                  <Form.Text> (Max amount per proposal: {maxPropAmtPercent * availableBalance / 100} {symbols[1]})</Form.Text>
                  <InputGroup>
                    <Form.Control
                      type='number'
                      step='any'
                      min='1'
                      required
                      onChange={(e) => setAmount(e.target.value)}
                      value={amount}
                      placeholder='Enter amount'
                    />
                    <InputGroup.Text>{symbols[1]}</InputGroup.Text>
                  </InputGroup>
                </Form.Group>
                <Form.Group className='mb-3'>
                  <Form.Label>Name</Form.Label>
                  <Form.Control
                    type='text'
                    required
                    onChange={(e) => setName(e.target.value)}
                    value={name}
                    placeholder='Enter proposal name'
                  />
                </Form.Group>
                <Form.Group className='mb-3'>
                  <Form.Label>Description</Form.Label>
                  <Form.Control
                    type='textarea'
                    required
                    onChange={(e) => setDescription(e.target.value)}
                    value={description}
                    placeholder='Enter proposal description'
                  />
                </Form.Group>

                {isWaiting ? (
                  <Spinner animation='border' className='d-block mx-auto' />
                ) : (
                  <Button className='mb-3' style={{width: '100%'}} type='submit'>Submit</Button>
                )}
              </Form>
            </Card.Body>
          ) : (
            <Card.Body style={{color: 'red'}}>Purchase a NFT or donate to DAO to submit new proposals</Card.Body>
          )
        ) : (
          <Card.Body>Please connect your wallet</Card.Body>
        )}
    </Card>
  )
}

export default Info
