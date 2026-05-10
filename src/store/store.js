import { configureStore } from '@reduxjs/toolkit'
import provider from './reducers/provider'
import tokens from './reducers/tokens'
import dao from './reducers/dao'
import nfts from './reducers/nfts'
import toasts from './reducers/toasts'

export default configureStore({
  reducer: {
    provider,
    tokens,
    dao,
    nfts,
    toasts
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false
    })
})
