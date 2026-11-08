import { useEffect, useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import { api } from '../api'
import type { Hello } from '../api'

export default function HelloPage() {
  const [hello, setHello] = useState<Hello | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getHello()
      .then(setHello)
      .catch((e: Error) => setError(`Could not load: ${e.message}`))
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-gray-50 gap-6">
      <div className="flex flex-col items-center gap-4 bg-white border border-gray-200 rounded-lg shadow-sm px-10 py-8">
        {error ? (
          <p className="text-red-600 text-sm m-0">{error}</p>
        ) : hello ? (
          <>
            <h1 className="text-2xl font-bold m-0">{hello.message}</h1>
            <p className="text-sm text-gray-500 m-0">Visits: {hello.visits}</p>
          </>
        ) : (
          <p className="text-sm text-gray-500 m-0">Loading…</p>
        )}
        <button
          onClick={() => signOut(auth)}
          className="px-6 py-3 text-base cursor-pointer rounded-md border border-gray-300 hover:bg-gray-50 active:bg-gray-100"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
