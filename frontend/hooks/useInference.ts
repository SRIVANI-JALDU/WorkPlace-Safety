import { api } from '@/lib/api'

export function useInference() {
  const processFrame = async (frameData: string, filename?: string, isTestVideo?: boolean) => {
    try {
      const response = await api.post('/infer/frame', {
        frame_data: frameData,
        filename: filename || '',
        is_test_video: isTestVideo || false,
      })
      return response.data
    } catch (error) {
      console.error('Inference error:', error)
      throw error
    }
  }

  const processSequence = async (frames: string[]) => {
    try {
      const response = await api.post('/infer/sequence', {
        frames,
      })
      return response.data
    } catch (error) {
      console.error('Sequence inference error:', error)
      throw error
    }
  }

  return { processFrame, processSequence }
}

