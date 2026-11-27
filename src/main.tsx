import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { AuthProvider } from '@/components/AuthProvider'
import OfflineQueryProvider from '@/components/OfflineQueryProvider'
import UpdatePrompt from '@/components/UpdatePrompt'
import { CACHE_MAX_AGE } from '@/lib/cache-persister'
import { initOnlineState } from '@/lib/offline'
import { initInstallPrompt } from '@/lib/install'
import { registerShoppingMutationDefaults } from '@/lib/shopping-mutations'

initOnlineState()
initInstallPrompt()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      // Data saved for offline use is restored into the cache, so it must be kept
      // in memory at least as long as it may be saved.
      gcTime: CACHE_MAX_AGE,
    },
  },
})

// Edits that were waiting when the app was closed can only be sent again if the
// function that sends them is known before the saved cache is restored.
registerShoppingMutationDefaults(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OfflineQueryProvider client={queryClient}>
          <App />
          <UpdatePrompt />
        </OfflineQueryProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
