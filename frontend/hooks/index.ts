import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { EventWithPaymentStatus, Session } from '../../common/types'
import { getEvents, getSession, getSetupIntent, RequestError } from '../api'

const handleRequestError =
  (setLocation: (loc: string) => void) => (error: RequestError) => {
    switch (error.status) {
      case 401:
        localStorage.removeItem('bbat_token')
        setLocation('/landing')
        break
      default:
        console.error('Request failed', error)
    }
  }

export const useEvents = () => {
  const [events, setEvents] = useState<EventWithPaymentStatus[] | null>(null)
  const setLocation = useLocation()[1]

  useEffect(() => {
    getEvents().then(setEvents).catch(handleRequestError(setLocation))
  }, [])

  return events
}

export const loadTokenAndSession = (): {
  session: Session | null
  loading: boolean
} => {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [routerLocation, setLocation] = useLocation()

  useEffect(() => {
    if (!localStorage.getItem('bbat_token')) {
      const token = location.search.split('token=')[1]?.split('&')[0] ?? null
      if (token === null) {
        setLoading(false)
        if (routerLocation !== '/landing') {
          console.log(routerLocation)
          setLocation('/landing')
        }
      }

      localStorage.setItem('bbat_token', token)
      location.search = ''
    }

    getSession()
      .then(session => {
        setSession(session)
        setLoading(false)
      })
      .catch(error => {
        setLoading(false)
        handleRequestError(setLocation)(error)
      })
  }, [])

  return { session, loading }
}

export const useSetupIntent = () => {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const setLocation = useLocation()[1]

  useEffect(() => {
    getSetupIntent()
      .then(({ secret }) => setClientSecret(secret))
      .catch(handleRequestError(setLocation))
  }, [])

  return clientSecret
}
