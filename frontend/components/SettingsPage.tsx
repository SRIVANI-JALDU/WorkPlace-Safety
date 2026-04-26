'use client'

import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    detectionThreshold: 0.5,
    frameBufferSize: 16,
    cameraSource: 0,
    frameWidth: 640,
    frameHeight: 640,
  })

  useEffect(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem('safetySettings')
    if (saved) {
      setSettings(JSON.parse(saved))
    }
  }, [])

  const handleSave = () => {
    localStorage.setItem('safetySettings', JSON.stringify(settings))
    toast.success('Settings saved successfully!')
  }

  const handleReset = () => {
    setSettings({
      detectionThreshold: 0.5,
      frameBufferSize: 16,
      cameraSource: 0,
      frameWidth: 640,
      frameHeight: 640,
    })
    toast.info('Settings reset to defaults')
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">System Settings</h1>
        <p className="text-gray-600">Configure detection parameters and system preferences</p>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Detection Threshold (τ)
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={settings.detectionThreshold}
              onChange={(e) => setSettings({ ...settings, detectionThreshold: parseFloat(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-500">
              Confidence threshold for object detection (0.0 - 1.0)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Frame Buffer Size (N)
            </label>
            <input
              type="number"
              min="1"
              max="32"
              value={settings.frameBufferSize}
              onChange={(e) => setSettings({ ...settings, frameBufferSize: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-500">
              Number of frames for temporal analysis (ConvLSTM)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Camera Source
            </label>
            <input
              type="number"
              min="0"
              value={settings.cameraSource}
              onChange={(e) => setSettings({ ...settings, cameraSource: parseInt(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-500">
              Camera device index (0 for default camera)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Frame Width
              </label>
              <input
                type="number"
                min="320"
                max="1920"
                step="64"
                value={settings.frameWidth}
                onChange={(e) => setSettings({ ...settings, frameWidth: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Frame Height
              </label>
              <input
                type="number"
                min="320"
                max="1920"
                step="64"
                value={settings.frameHeight}
                onChange={(e) => setSettings({ ...settings, frameHeight: parseInt(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex space-x-4 pt-4">
            <button
              onClick={handleSave}
              className="flex-1 bg-primary-600 text-white py-2 px-4 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
            >
              Save Settings
            </button>
            <button
              onClick={handleReset}
              className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


