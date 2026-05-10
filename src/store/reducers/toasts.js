import { createSlice } from '@reduxjs/toolkit'

let nextId = 1

export const toasts = createSlice({
  name: 'toasts',
  initialState: {
    items: []
  },
  reducers: {
    addToast: {
      reducer: (state, action) => {
        state.items.push(action.payload)
      },
      prepare: ({ message, variant = 'success', delay = 5000 }) => ({
        payload: { id: nextId++, message, variant, delay }
      })
    },
    removeToast: (state, action) => {
      state.items = state.items.filter(t => t.id !== action.payload)
    }
  }
})

export const { addToast, removeToast } = toasts.actions

export default toasts.reducer
