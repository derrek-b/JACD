import { createSlice } from "@reduxjs/toolkit";

export const dao = createSlice({
  name: 'dao',
  initialState: {
    contract: null,
    usdcBalance: 0,
    jacdSupply: 0,
    maxProposalAmountPercent: 0,
    holdersWeights: [],
    holderVotes: 0,
    minHolderVotesToPass: 0,
    minVotesToFinalize: 0,
    proposals: [],
    holderProposals: [],
    holderVoteStatus: [],
    openProposals: [],
    holderOpenVoteStatus: [],
    closedProposals: [],
  },
  reducers: {
    setContract: (state, action) => {
      state.contract = action.payload
    },
    setUSDCBalance: (state, action) => {
      state.usdcBalance = action.payload
    },
    setJACDSupply: (state, action) => {
      state.jacdSupply = action.payload
    },
    setMaxProposalAmountPercent: (state, action) => {
      state.maxProposalAmountPercent = action.payload
    },
    setHoldersWeights: (state, action) => {
      state.holdersWeights = action.payload
    },
    setHolderVotes: (state, action) => {
      state.holderVotes = action.payload
    },
    setMinHolderVotesToPass: (state, action) => {
      state.minHolderVotesToPass = action.payload
    },
    setMinVotesToFinalize: (state, action) => {
      state.minVotesToFinalize = action.payload
    },
    setProposals: (state, action) => {
      state.proposals = action.payload
    },
    setHolderProposals: (state, action) => {
      state.holderProposals = action.payload
    },
    setHolderVoteStatus: (state, action) => {
      state.holderVoteStatus = action.payload
    },
    setOpenProposals: (state, action) => {
      state.openProposals = action.payload
    },
    setHolderOpenVoteStatus: (state, action) => {
      state.holderOpenVoteStatus = action.payload
    },
    setClosedProposals: (state, action) => {
      state.closedProposals = action.payload
    }
  }
})

export const {
  setContract,
  setUSDCBalance,
  setJACDSupply,
  setMaxProposalAmountPercent,
  setHoldersWeights,
  setHolderVotes,
  setMinHolderVotesToPass,
  setMinVotesToFinalize,
  setProposals,
  setHolderProposals,
  setHolderVoteStatus,
  setOpenProposals,
  setHolderOpenVoteStatus,
  setClosedProposals
} = dao.actions

export default dao.reducer
