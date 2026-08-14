import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { useApp } from './services/store'
import { getSupabase, onAuthStateChange, supabaseAvailable } from './database/supabase'
import './index.css'

let syncTimer: number | undefined

function startSyncLoop() {
  if (!supabaseAvailable) return
  if (syncTimer) window.clearInterval(syncTimer)
  syncTimer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return
    useApp.getState().hydrate()
  }, 15000)
}

function stopSyncLoop() {
  if (syncTimer) {
    window.clearInterval(syncTimer)
    syncTimer = undefined
  }
}

useApp.getState().hydrate()
// Demo data will no longer auto-seed on load

if (supabaseAvailable) {
  const syncOnSession = async () => {
    const supabase = getSupabase()
    if (!supabase) return
    const { data } = await supabase.auth.getUser()
    if (data?.user) {
      startSyncLoop()
      useApp.getState().hydrate()
    } else {
      stopSyncLoop()
    }
  }

  onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      startSyncLoop()
      useApp.getState().hydrate()
    }
    if (event === 'SIGNED_OUT') {
      stopSyncLoop()
      useApp.getState().hydrate()
    }
  })

  void syncOnSession()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)