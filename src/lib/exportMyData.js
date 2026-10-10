import { supabase } from './supabaseClient.js'

// "Download my data": everything Unipicks stores about you, as one JSON file
// (export_my_data in the database decides what is in it).
export function exportFileName(now = new Date()) {
  return `unipicks-my-data-${now.toISOString().slice(0, 10)}.json`
}

export async function downloadMyData() {
  const { data, error } = await supabase.rpc('export_my_data')
  if (error) throw new Error("We couldn't prepare your data. Please try again.")
  const name = exportFileName()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return name
}
