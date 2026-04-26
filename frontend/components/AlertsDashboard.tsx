'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

interface Alert {
  id: string
  timestamp: string
  event_type: string
  risk_score: number
  description: string
  bounding_boxes: any[]
}

export default function AlertsDashboard() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 2000) // Refresh every 2 seconds for real-time updates
    return () => clearInterval(interval)
  }, [filter])

  const fetchAlerts = async () => {
    try {
      setLoading(true)
      const response = await api.get('/alerts', {
        params: {
          limit: 100,
          event_type: filter !== 'all' ? filter : undefined,
        },
      })
      console.log('Alerts response:', response.data)
      console.log('Alerts count:', response.data.alerts?.length || 0)
      setAlerts(response.data.alerts || [])
      if (response.data.alerts && response.data.alerts.length === 0) {
        console.warn('No alerts returned from API')
      }
    } catch (error: any) {
      toast.error('Failed to fetch alerts')
      console.error('Error fetching alerts:', error)
      console.error('Error response:', error.response?.data)
    } finally {
      setLoading(false)
    }
  }

  const getEventTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      PPE: 'bg-red-100 text-red-800',
      Posture: 'bg-yellow-100 text-yellow-800',
      Hazard: 'bg-orange-100 text-orange-800',
      Fatigue: 'bg-purple-100 text-purple-800',
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  const getRiskColor = (score: number) => {
    if (score >= 0.7) return 'text-red-600 font-bold'
    if (score >= 0.4) return 'text-yellow-600 font-semibold'
    return 'text-green-600'
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Alerts & Events</h1>
        <p className="text-gray-600">Recent safety violations and incidents</p>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg ${filter === 'all' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('PPE')}
              className={`px-4 py-2 rounded-lg ${filter === 'PPE' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
            >
              PPE
            </button>
            <button
              onClick={() => setFilter('Posture')}
              className={`px-4 py-2 rounded-lg ${filter === 'Posture' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
            >
              Posture
            </button>
            <button
              onClick={() => setFilter('Hazard')}
              className={`px-4 py-2 rounded-lg ${filter === 'Hazard' ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
            >
              Hazard
            </button>
            <button
              onClick={() => setFilter('Fatigue')}
              className={`px-4 py-2 rounded-lg ${filter === 'Fatigue' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'
                }`}
            >
              Fatigue
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No alerts found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Timestamp</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Type</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Description</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Risk Score</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {format(new Date(alert.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getEventTypeColor(alert.event_type)}`}>
                        {alert.event_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">{alert.description || 'No description'}</td>
                    <td className="py-3 px-4">
                      <span className={getRiskColor(alert.risk_score)}>
                        {(alert.risk_score * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}


