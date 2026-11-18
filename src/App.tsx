import { useState } from 'react'
import { Home } from './Home'
import { Editor } from './Editor'
import type { Doc } from './types'

export default function App() {
  const [doc, setDoc] = useState<Doc | null>(null)
  if (!doc) return <Home onOpen={setDoc} />
  return <Editor doc={doc} onClose={() => setDoc(null)} />
}
