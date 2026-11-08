import { FieldValue, getFirestore } from 'firebase-admin/firestore'

export async function recordVisit(): Promise<number> {
  const db = getFirestore()
  const ref = db.collection('meta').doc('hello')
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) {
      tx.set(ref, { visits: 1, updatedAt: FieldValue.serverTimestamp() })
      return 1
    }
    const visits = (snap.data()?.visits as number) + 1
    tx.set(ref, { visits, updatedAt: FieldValue.serverTimestamp() })
    return visits
  })
}
