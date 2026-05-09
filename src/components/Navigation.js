/* #region Dependencies */

import { useSelector, useDispatch } from 'react-redux'
import { useEffect } from 'react'

import Navbar from 'react-bootstrap/Navbar'
import Button from 'react-bootstrap/Button'

import {
  loadAccount,
  loadUserBalances,
  loadNFTBalances,
  loadHolderVoteStatus,
  loadHolderOpenVoteStatus
} from '../store/interactions'
/* #endregion */

const Navigation = () => {

  /* #region Component Variables */

  const dispatch = useDispatch()

  const account = useSelector((state) => state.provider.account)
  const tokens = useSelector((state) => state.tokens.contracts)
  const nfts = useSelector((state) => state.nfts.collections)
  const dao = useSelector((state) => state.dao.contract)
  const holderProposals = useSelector((state) => state.dao.holderProposals)
  const openProposals = useSelector((state) => state.dao.openProposals)

  const connect = () => loadAccount(dispatch)
  /* #endregion */

  /* #region Hooks */

  useEffect(() => {
    if (!account) return
    loadUserBalances(tokens, account, dispatch)
    loadNFTBalances(nfts, account, dispatch)
    loadHolderVoteStatus(dao, holderProposals, account, dispatch)
    loadHolderOpenVoteStatus(dao, openProposals, account, dispatch)
    // Deliberately depend only on `account`. The other reads (tokens, nfts,
    // dao, proposals) are ambient state already loaded by App.js; re-firing
    // this whole reload chain whenever a proposal mutates would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account])
/* #endregion */

  return(
    <Navbar className='my-3'>
      <Navbar.Brand className='align-center' href='#'>JADU Avas Charitable DAO</Navbar.Brand>
      <Navbar.Collapse className='justify-content-end'>
        <div className='d-flex justify-content-end'>
          {account ? (
            <Navbar.Text>{account.slice(0, 5)}...{account.slice(-4)}</Navbar.Text>
          ) : (
            <Button onClick={connect}>Connect Wallet</Button>
          )}
        </div>
      </Navbar.Collapse>
    </Navbar>
  )
}

export default Navigation
