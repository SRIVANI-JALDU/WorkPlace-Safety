'use client'

import { useState } from 'react'
import LiveMonitoring from '@/components/LiveMonitoring'
import AlertsDashboard from '@/components/AlertsDashboard'
import AnalyticsDashboard from '@/components/AnalyticsDashboard'
import SettingsPage from '@/components/SettingsPage'
import Sidebar from '@/components/Sidebar'

type Tab = 'monitoring' | 'alerts' | 'analytics' | 'settings'

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('monitoring')

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 overflow-auto relative">
        {/* Keep all components mounted but hide/show them to preserve state */}
        <div className={activeTab === 'monitoring' ? 'block' : 'hidden'}>
          <LiveMonitoring />
        </div>
        <div className={activeTab === 'alerts' ? 'block' : 'hidden'}>
          <AlertsDashboard />
        </div>
        <div className={activeTab === 'analytics' ? 'block' : 'hidden'}>
          <AnalyticsDashboard />
        </div>
        <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
          <SettingsPage />
        </div>
      </main>
    </div>
  )
}


