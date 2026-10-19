import { useState } from 'react'
import ContentEditor from '../components/website/ContentEditor'
import ContentList from '../components/website/ContentList'

// Style Content: the article list, and the article editor (a new article, or one opened by id).
export default function WebsiteContent() {
  const [editing, setEditing] = useState(null) // null = list, { id } = editor (id null = new article)
  const [listKey, setListKey] = useState(0) // bumped after a save / delete so the list reloads
  if (!editing) return <ContentList onOpen={(id) => setEditing({ id })} onNew={() => setEditing({ id: null })} reloadKey={listKey} />
  return <ContentEditor key={editing.id ?? 'new'} id={editing.id} onBack={() => setEditing(null)} onSaved={() => setListKey((k) => k + 1)} />
}
