/* #region Dependencies */

import { useDispatch, useSelector } from 'react-redux'
import { useState, useEffect } from 'react'

import Button from 'react-bootstrap/Button'

import demo from '../demo_vid.mp4'

import {
  loadUserBalances,
  loadNFTBalances,
  faucetRequest
} from '../store/interactions'
/* #endregion */

const Faucet = () => {

  /* #region Component Variables */

  const dispatch = useDispatch()

  const [canClaim, setCanClaim] = useState(true)
  const [isClaiming, setIsClaiming] = useState(false)

  const provider = useSelector((state) => state.provider.connection)
  const chainId = useSelector((state) => state.provider.chainId)
  const account = useSelector((state) => state.provider.account)
  const tokens = useSelector((state) => state.tokens.contracts)
  const symbols = useSelector((state) => state.tokens.symbols)
  const balances = useSelector((state) => state.tokens.balances)
  const dao = useSelector((state) => state.dao.contract)
  const nfts = useSelector((state) => state.nfts.collections)
  const nftBalances = useSelector((state) => state.nfts.nftBalances)
  /* #endregion */

  /* #region Component Functions */

  const claimHandler = async () => {
    setIsClaiming(true)

    await faucetRequest(provider, chainId, dao)

    await loadUserBalances(tokens, account, dispatch)
    await loadNFTBalances(nfts, account, dispatch)

    setIsClaiming(false)
  }

  /* #endregion */

  /* #region Hooks */

  useEffect(() => {
    if (!account) return
    const hasEnough = balances[1] >= 100 && nftBalances[1] > 0
    setCanClaim(!hasEnough)
  }, [account, balances, nftBalances])
  /* #endregion */

  return(
    <>
      {account && (
        <>
          <hr />

          <div className='my-2' style={{ width: '700px', float: 'left' }}>
            <p className='d-inline-block mx-3' ><strong>{`Claim ${symbols[1]} & NFT assets for app testing`}</strong></p>

            {isClaiming ? (
              <Button disabled>Claiming...</Button>
            ) : (
              canClaim ? (
                <Button onClick={claimHandler}>Claim Assets</Button>
              ) : (
                <Button disabled>Assets Claimed</Button>
              )
            )}

            <br />
            <br />

            <strong className='mx-3' >Sepolia Testnet Ether Faucets</strong>
            <ul className='ms-3'>
              <li><a target="_blank" rel='noreferrer' href='https://sepoliafaucet.com'>Alchemy</a></li>
              <li><a target="_blank" rel='noreferrer' href='https://faucet.quicknode.com/ethereum/sepolia'>QuickNode</a></li>
              <li><a target="_blank" rel='noreferrer' href='https://www.infura.io/faucet/sepolia'>Infura</a></li>
            </ul>

            <br />

            <strong className='mx-3'>Token Addresses</strong>
            <ul className='ms-3'>
              <li><span className='underline'>mUSDC: </span>0xA0B5DACf8a20F7Fd8B561b585148123c8705b4f1</li>
              <li><span className='underline'>JACD: </span>0xa787F9Ef5e6E80b93F92E68c3007Fa8b6cE1Aa22</li>
            </ul>
          </div>
        </>
      )}

      <div className='mb-3' style={{ float: 'right' }}>
        <h3 className='text-center'><strong>Demo Video</strong></h3>
        <video controls height={281} width={500} style={{ border: '1px solid black' }}>
          <source src={demo} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
    </>
  )
}

export default Faucet
