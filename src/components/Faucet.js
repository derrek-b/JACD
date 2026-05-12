/* #region Dependencies */

import { useDispatch, useSelector } from 'react-redux'
import { useState, useEffect } from 'react'

import Card from 'react-bootstrap/Card'
import Button from 'react-bootstrap/Button'
import Alert from 'react-bootstrap/Alert'

import config from '../config.json'

import { addToast } from '../store/reducers/toasts'

import {
  loadUserBalances,
  loadNFTBalances,
  faucetRequest,
  resultToToast
} from '../store/interactions'
/* #endregion */

const Faucet = () => {

  /* #region Component Variables */

  const dispatch = useDispatch()

  const [canClaim, setCanClaim] = useState(true)
  const [isClaiming, setIsClaiming] = useState(false)
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')

  const provider = useSelector((state) => state.provider.connection)
  const chainId = useSelector((state) => state.provider.chainId)
  const account = useSelector((state) => state.provider.account)
  const tokens = useSelector((state) => state.tokens.contracts)
  const symbols = useSelector((state) => state.tokens.symbols)
  const balances = useSelector((state) => state.tokens.balances)
  const dao = useSelector((state) => state.dao.contract)
  const nfts = useSelector((state) => state.nfts.collections)
  const nftBalances = useSelector((state) => state.nfts.nftBalances)
  const names = useSelector((state) => state.nfts.names)
  /* #endregion */

  /* #region Component Functions */

  const claimHandler = async () => {
    setIsClaiming(true)
    setShowAlert(false)

    const result = await faucetRequest(provider, chainId, dao)

    await loadUserBalances(tokens, account, dispatch)
    await loadNFTBalances(nfts, account, dispatch)

    if (!result.ok) {
      dispatch(addToast(resultToToast(result, '', 'Faucet claim failed')))
      setIsClaiming(false)
      return
    }

    const event = result.receipt?.events?.find(e => e.event === 'FaucetClaim')
    if (event) {
      const idx = event.args.collectionIdx.toNumber()
      const tokenId = event.args.tokenId.toNumber()
      const usdcAmt = event.args.usdcAmount.toNumber() / 10**6
      const singular = (names[idx] || 'NFT').replace(/s$/, '')

      let message
      if (tokenId > 0 && usdcAmt > 0) {
        message = `Claimed ${usdcAmt} mUSDC and 1 ${singular} (token #${tokenId}).`
      } else if (tokenId > 0) {
        message = `Already at 100 mUSDC.  Claimed 1 ${singular} (token #${tokenId}).`
      } else if (usdcAmt > 0) {
        message = `Claimed ${usdcAmt} mUSDC.  ${singular} already minted — re-claim for a chance at a different type.`
      } else {
        message = `Already at 100 mUSDC.  ${singular} already minted — re-claim for a chance at a different type.`
      }

      setAlertMessage(message)
      setShowAlert(true)
    }

    setIsClaiming(false)
  }

  /* #endregion */

  /* #region Hooks */

  useEffect(() => {
    if (!account) return
    const hasEnough = balances[1] >= 100 && nftBalances.length > 0 && nftBalances.every(b => +b > 0)
    setCanClaim(!hasEnough)
  }, [account, balances, nftBalances])

  useEffect(() => {
    if (!showAlert) return
    const id = setTimeout(() => setShowAlert(false), 10000)
    return () => clearTimeout(id)
  }, [showAlert])
  /* #endregion */

  return(
    <Card className='my-4 mx-auto' style={{ maxWidth: '600px' }}>
      <Card.Header as='h3'>Faucets</Card.Header>
      <Card.Body>
        {showAlert && (
          <Alert variant='success' onClose={() => setShowAlert(false)} dismissible>
            {alertMessage}
          </Alert>
        )}

        <p><strong>{`Claim mUSDC + a random NFT${names.length ? ` (${names.join(', ')})` : ''}.`}</strong></p>

        {!account ? (
          <Button disabled>Connect Wallet to Claim</Button>
        ) : isClaiming ? (
          <Button disabled>Claiming...</Button>
        ) : canClaim ? (
          <Button onClick={claimHandler}>Claim Assets</Button>
        ) : (
          <Button disabled>Assets Claimed</Button>
        )}

        <hr />

        <strong>Sepolia Testnet Ether Faucets</strong>
        <ul className='ms-3'>
          <li><a target="_blank" rel='noreferrer' href='https://cloud.google.com/application/web3/faucet/ethereum/sepolia'>Google</a> — 0.05 ETH, no requirements</li>
          <li><a target="_blank" rel='noreferrer' href='https://www.alchemy.com/faucets/ethereum-sepolia'>Alchemy</a> — 0.1 ETH, balance & activity requirements</li>
          <li><a target="_blank" rel='noreferrer' href='https://faucets.chain.link/sepolia'>Chainlink</a> — 0.5 ETH, 1 LINK on mainnet required</li>
        </ul>

        {account && (
          <>
            <hr />

            <strong>Token Addresses</strong>
            <ul className='ms-3'>
              <li><span className='underline'>{symbols[1]}: </span>{config[chainId].usdcToken.address}</li>
              <li><span className='underline'>{symbols[0]}: </span>{config[chainId].jacdToken.address}</li>
              <li><span className='underline'>Jetpacks: </span>{config[chainId].jetpacks.address}</li>
              <li><span className='underline'>Hoverboards: </span>{config[chainId].hoverboards.address}</li>
              <li><span className='underline'>AVAs: </span>{config[chainId].avas.address}</li>
            </ul>
            <small className='text-muted'>NFT imports also require the token ID — shown in the claim alert when you receive one, or visible on Etherscan from the claim transaction.</small>
          </>
        )}
      </Card.Body>
    </Card>
  )
}

export default Faucet
