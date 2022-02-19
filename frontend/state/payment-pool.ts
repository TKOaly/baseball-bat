import { createContext } from 'react'

export type PaymentPoolItem = {
  eventId: number
  eventName: string
  items: {
    eventItemId: number
    itemName: string
    amount: number
  }[]
}

type PaymentPoolState = {
  items: PaymentPoolItem[]
  totalSum: number
  dispatch: React.Dispatch<PaymentPoolAction>
}

export const PaymentPool = createContext<PaymentPoolState>({
  items: [],
  totalSum: 0,
  dispatch: () => {},
})

type PaymentPoolAction =
  | {
      type: 'ADD_ITEM'
      payload: PaymentPoolItem
    }
  | {
      type: 'REMOVE_ITEM'
      payload: PaymentPoolItem
    }

export const paymentPoolReducer = (
  state: Pick<PaymentPoolState, 'items' | 'totalSum'>,
  action: PaymentPoolAction
) => {
  switch (action.type) {
    case 'ADD_ITEM':
      return {
        items: [...state.items, action.payload],
        totalSum:
          state.totalSum +
          action.payload.items.reduce((acc, item) => acc + item.amount, 0),
      }
    case 'REMOVE_ITEM':
      return {
        items: state.items.filter(
          item => item.eventId !== action.payload.eventId
        ),
        totalSum:
          state.totalSum -
          action.payload.items.reduce((acc, item) => acc + item.amount, 0),
      }
    default:
      return state
  }
}
