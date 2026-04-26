import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { api } from '@/lib/api'

interface AuthState {
  token: string | null
  isAuthenticated: boolean
  user: { username: string; role: string } | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      isAuthenticated: false,
      user: null,

      login: async (username: string, password: string) => {
        try {
          // Use URLSearchParams for form-urlencoded data
          const params = new URLSearchParams()
          params.append('username', username)
          params.append('password', password)

          const response = await api.post('/auth/login', params, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          })

          const { access_token } = response.data
          
          // Get user info
          const userResponse = await api.get('/auth/me', {
            headers: {
              Authorization: `Bearer ${access_token}`,
            },
          })

          set({
            token: access_token,
            isAuthenticated: true,
            user: userResponse.data,
          })

          // Set default auth header
          api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
        } catch (error: any) {
          throw new Error(error.response?.data?.detail || 'Login failed')
        }
      },

      logout: () => {
        set({
          token: null,
          isAuthenticated: false,
          user: null,
        })
        delete api.defaults.headers.common['Authorization']
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)

