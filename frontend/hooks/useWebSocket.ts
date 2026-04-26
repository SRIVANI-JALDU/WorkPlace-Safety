import { useEffect, useRef, useState } from 'react'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const shouldReconnectRef = useRef(true)
  const isConnectingRef = useRef(false)
  const mountedRef = useRef(true)

  const connect = () => {
    // Prevent multiple simultaneous connection attempts
    if (!shouldReconnectRef.current || isConnectingRef.current || !mountedRef.current) {
      return
    }

    // Don't reconnect if already connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return
    }

    // Clean up existing connection if any
    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch (e) {
        // Ignore errors during cleanup
      }
      wsRef.current = null
    }

    isConnectingRef.current = true

    try {
      const ws = new WebSocket(`${WS_URL}/ws/live`)
      
      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close()
          return
        }
        isConnectingRef.current = false
        setIsConnected(true)
        // Clear any pending reconnection
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
      }

      ws.onclose = (event) => {
        isConnectingRef.current = false
        if (!mountedRef.current) return
        
        setIsConnected(false)
        
        // Only reconnect if it wasn't a normal closure and we should reconnect
        if (shouldReconnectRef.current && event.code !== 1000) {
          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && shouldReconnectRef.current) {
              connect()
            }
          }, 3000)
        }
      }

      ws.onerror = (error) => {
        isConnectingRef.current = false
        if (!mountedRef.current) return
        // Silently handle errors - WebSocket is optional
        setIsConnected(false)
      }

      wsRef.current = ws
    } catch (error) {
      isConnectingRef.current = false
      if (!mountedRef.current) return
      // Silently handle connection failures
      setIsConnected(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    
    // Only connect if WebSocket is supported and we're not in a test environment
    if (typeof WebSocket !== 'undefined' && typeof window !== 'undefined') {
      // Small delay to avoid React StrictMode double-mount issues
      const connectTimeout = setTimeout(() => {
        if (mountedRef.current) {
          connect()
        }
      }, 100)

      return () => {
        mountedRef.current = false
        shouldReconnectRef.current = false
        
        clearTimeout(connectTimeout)
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
        
        if (wsRef.current) {
          try {
            wsRef.current.close(1000, 'Component unmounting')
          } catch (e) {
            // Ignore errors during cleanup
          }
          wsRef.current = null
        }
        
        isConnectingRef.current = false
      }
    }

    return () => {
      mountedRef.current = false
      shouldReconnectRef.current = false
    }
  }, [])

  const sendFrame = (frameData: string) => {
    if (wsRef.current && isConnected && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        // Convert base64 to binary
        const binary = atob(frameData.split(',')[1])
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        wsRef.current.send(bytes.buffer)
      } catch (error) {
        console.warn('Error sending frame via WebSocket:', error)
      }
    }
  }

  return { isConnected, sendFrame }
}

