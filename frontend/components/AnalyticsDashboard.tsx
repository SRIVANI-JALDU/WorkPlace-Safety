'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

export default function AnalyticsDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [trendData, setTrendData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
    fetchTrendData()
    const interval = setInterval(() => {
      fetchStats()
      fetchTrendData()
    }, 5000) // Refresh every 5 seconds for real-time updates
    return () => clearInterval(interval)
  }, [])

  const fetchStats = async () => {
    try {
      const response = await api.get('/alerts/stats')
      console.log('Stats response:', response.data)
      setStats(response.data)
    } catch (error: any) {
      toast.error('Failed to fetch statistics')
      console.error('Error fetching stats:', error)
      console.error('Error response:', error.response?.data)
    } finally {
      setLoading(false)
    }
  }

  const fetchTrendData = async () => {
    try {
      const response = await api.get('/alerts', { params: { limit: 100 } })
      const alerts = response.data.alerts || []
      
      // Group by hour
      const hourlyData: Record<string, any> = {}
      alerts.forEach((alert: any) => {
        const hour = new Date(alert.timestamp).toISOString().slice(0, 13) + ':00'
        if (!hourlyData[hour]) {
          hourlyData[hour] = { hour, ppe: 0, posture: 0, hazard: 0 }
        }
        if (alert.event_type === 'PPE') hourlyData[hour].ppe++
        if (alert.event_type === 'Posture') hourlyData[hour].posture++
        if (alert.event_type === 'Hazard') hourlyData[hour].hazard++
      })
      
      setTrendData(Object.values(hourlyData).slice(-24).reverse())
    } catch (error) {
      console.error(error)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Analytics Dashboard</h1>
        <p className="text-gray-600">Safety compliance trends and insights</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Total Alerts</h3>
          <p className="text-3xl font-bold text-primary-600">{stats?.total_alerts || 0}</p>
        </div>
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Average Risk Score</h3>
          <p className="text-3xl font-bold text-yellow-600">
            {stats ? (stats.average_risk_score * 100).toFixed(1) : 0}%
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Compliance Rate</h3>
          <p className="text-3xl font-bold text-green-600">
            {stats ? (100 - (stats.average_risk_score * 100)).toFixed(1) : 100}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Violations by Type</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={[
              { name: 'PPE', value: stats?.by_type?.ppe_violations || 0 },
              { name: 'Posture', value: stats?.by_type?.posture_violations || 0 },
              { name: 'Hazard', value: stats?.by_type?.hazard_proximity || 0 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Trend Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="ppe" stroke="#ef4444" name="PPE Violations" />
              <Line type="monotone" dataKey="posture" stroke="#f59e0b" name="Posture Violations" />
              <Line type="monotone" dataKey="hazard" stroke="#8b5cf6" name="Hazard Proximity" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">Violation Distribution</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-600">PPE Violations</span>
              <span className="text-sm font-semibold">{stats?.by_type?.ppe_violations || 0}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-red-600 h-2 rounded-full"
                style={{
                  width: `${stats ? (stats.by_type?.ppe_violations / stats.total_alerts) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-600">Posture Violations</span>
              <span className="text-sm font-semibold">{stats?.by_type?.posture_violations || 0}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-yellow-600 h-2 rounded-full"
                style={{
                  width: `${stats ? (stats.by_type?.posture_violations / stats.total_alerts) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-600">Hazard Proximity</span>
              <span className="text-sm font-semibold">{stats?.by_type?.hazard_proximity || 0}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-orange-600 h-2 rounded-full"
                style={{
                  width: `${stats ? (stats.by_type?.hazard_proximity / stats.total_alerts) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


