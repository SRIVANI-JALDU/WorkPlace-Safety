import { api } from '@/lib/api'

export function useEnhancedInference() {
  const processFrameEnhanced = async (frameData: string, filename?: string, isTestVideo?: boolean) => {
    try {
      const response = await api.post('/infer/frame/enhanced', {
        frame_data: frameData,
        filename: filename || '',
        is_test_video: isTestVideo || false,
      })
      return response.data
    } catch (error) {
      console.error('Enhanced inference error:', error)
      throw error
    }
  }

  const processVideoEnhanced = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await api.post('/infer/upload/enhanced', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    } catch (error) {
      console.error('Enhanced video upload error:', error)
      throw error
    }
  }

  return { processFrameEnhanced, processVideoEnhanced }
}

