'use client'

import { useState, useEffect, useRef } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useInference } from '@/hooks/useInference'
import { useEnhancedInference } from '@/hooks/useEnhancedInference'
import { api } from '@/lib/api'
import toast from 'react-hot-toast'

export default function LiveMonitoring() {
  const [showPPE, setShowPPE] = useState(true)
  const [showObjects, setShowObjects] = useState(true)
  const [showPosture, setShowPosture] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const [mode, setMode] = useState<'live' | 'upload' | 'image'>('live')
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null)
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [currentVideoFilename, setCurrentVideoFilename] = useState<string>('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const { sendFrame, isConnected } = useWebSocket()
  const { processFrame } = useInference()
  const { processFrameEnhanced, processVideoEnhanced } = useEnhancedInference()
  const [useEnhancedMode, setUseEnhancedMode] = useState(true) // Use enhanced by default
  const [frameResults, setFrameResults] = useState<Map<number, any>>(new Map()) // Store results per frame
  const [isProcessingFrames, setIsProcessingFrames] = useState(false)
  const [lastViolationCheck, setLastViolationCheck] = useState<string>('') // Track last violation state to avoid duplicate toasts

  // Effect to show violation notification when violations are detected
  useEffect(() => {
    if (results && results.safety_evaluation) {
      const hasViolations = !results.safety_evaluation.ppe_complete || 
                          (results.safety_evaluation.violations && results.safety_evaluation.violations.length > 0) ||
                          (results.safety_evaluation.missing_ppe && results.safety_evaluation.missing_ppe.length > 0) ||
                          results.safety_evaluation.risk_score > 0
      
      // Create a unique key for this violation state
      const violationKey = hasViolations 
        ? `violations_${results.safety_evaluation.missing_ppe?.join(',') || ''}_${results.safety_evaluation.risk_score || 0}`
        : 'no_violations'
      
      // Only show toast if violations are detected and we haven't shown this exact violation state before
      if (hasViolations && violationKey !== lastViolationCheck) {
        const missingItems = results.safety_evaluation.missing_ppe || []
        const violationCount = results.safety_evaluation.violations?.length || 0
        
        if (missingItems.length > 0) {
          toast.error(
            `⚠️ VIOLATIONS DETECTED: Missing PPE items - ${missingItems.join(', ')}`,
            {
              duration: 5000,
              style: {
                background: '#fee2e2',
                color: '#991b1b',
                border: '2px solid #dc2626',
                fontSize: '14px',
                fontWeight: 'bold',
              },
            }
          )
        } else if (violationCount > 0) {
          toast.error(
            `⚠️ VIOLATIONS DETECTED: ${violationCount} safety violation(s) found`,
            {
              duration: 5000,
              style: {
                background: '#fee2e2',
                color: '#991b1b',
                border: '2px solid #dc2626',
                fontSize: '14px',
                fontWeight: 'bold',
              },
            }
          )
        } else if (!results.safety_evaluation.ppe_complete) {
          toast.error(
            `⚠️ VIOLATIONS DETECTED: PPE is incomplete`,
            {
              duration: 5000,
              style: {
                background: '#fee2e2',
                color: '#991b1b',
                border: '2px solid #dc2626',
                fontSize: '14px',
                fontWeight: 'bold',
              },
            }
          )
        }
        
        setLastViolationCheck(violationKey)
      } else if (!hasViolations && lastViolationCheck !== 'no_violations') {
        // Reset when violations are cleared
        setLastViolationCheck('no_violations')
      }
    }
  }, [results, lastViolationCheck])

  // Effect to handle uploaded video
  useEffect(() => {
    if (mode === 'upload' && uploadedVideo && videoRef.current) {
      // Ensure video source is set
      if (videoRef.current.src !== uploadedVideo) {
        // Stop any existing stream
        if (videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream
          stream.getTracks().forEach(track => track.stop())
          videoRef.current.srcObject = null
        }
        
        videoRef.current.src = uploadedVideo
        videoRef.current.load()
      }
    }
  }, [uploadedVideo, mode])

  // Live camera stream
  useEffect(() => {
    if (mode !== 'live') return

    const initStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 } 
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setIsStreaming(true)
        }
      } catch (error) {
        console.error('Error accessing camera:', error)
        toast.error('Failed to access camera. You can upload a video instead.')
        setMode('upload')
      }
    }

    initStream()

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(track => track.stop())
      }
    }
  }, [mode])

  // Draw video/image to canvas and process frames
  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Handle image mode
    if (mode === 'image' && imageRef.current && uploadedImage) {
      const image = imageRef.current
      if (image.complete) {
        canvas.width = image.naturalWidth || 640
        canvas.height = image.naturalHeight || 480
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
        if (results) {
          drawDetections(ctx, results, false)
        }
      }
      return
    }

    // Handle video modes
    if (!videoRef.current) return

    const video = videoRef.current
    let frameCount = 0
    let lastResult: any = null
    let isProcessing = false // Lock to prevent concurrent processing
    let animationFrameId: number
    let lastProcessedFrame = -1

    const drawFrame = () => {
      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        const videoWidth = video.videoWidth || 640
        const videoHeight = video.videoHeight || 480
        
        // Set canvas size to match video
        if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
          canvas.width = videoWidth
          canvas.height = videoHeight
        }
        
        // Always draw video frame first
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // For upload mode, process frames in real-time
        if (mode === 'upload' && video.src && !video.paused) {
          const currentFrame = Math.floor(video.currentTime * 30) // Assuming 30fps
          
          // Get result for current frame if available
          const frameResult = frameResults.get(currentFrame)
          if (frameResult) {
            drawDetections(ctx, frameResult, false)
          } else if (results) {
            // Fallback to overall results
            drawDetections(ctx, results, false)
          }
          
          // Process new frames (every 10 frames for performance, ~0.33 seconds at 30fps)
          if (currentFrame !== lastProcessedFrame && currentFrame % 10 === 0 && !isProcessing && !isProcessingFrames) {
            isProcessing = true
            const imageData = canvas.toDataURL('image/jpeg', 0.8)
            const processFunction = useEnhancedMode ? processFrameEnhanced : processFrame
            const filename = currentVideoFilename || ''
            
            processFunction(imageData, filename, false).then((result) => {
              if (result) {
                // Store result for this frame
                setFrameResults(prev => new Map(prev).set(currentFrame, result))
                lastProcessedFrame = currentFrame
                // Redraw with new detections
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
                drawDetections(ctx, result, false)
              }
            }).catch((error) => {
              // Silently handle processing errors
            }).finally(() => {
              isProcessing = false
            })
          }
        } else if (mode === 'upload' && results) {
          // Draw stored results when video is paused
          drawDetections(ctx, results, false)
        } else if (lastResult) {
          // For live mode, draw previous detections
          drawDetections(ctx, lastResult, false)
        }

        // Process frame for live mode (every 90 frames for performance - ~3 seconds at 30fps)
        // Only process if not already processing
        if (mode === 'live' && isStreaming && frameCount % 90 === 0 && !isProcessing) {
          isProcessing = true
          const imageData = canvas.toDataURL('image/jpeg', 0.8)
          const processFunction = useEnhancedMode ? processFrameEnhanced : processFrame
          processFunction(imageData, '', false).then((result) => {
            if (result) {
              lastResult = result
              // Redraw with new detections
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              drawDetections(ctx, result, false)
            }
          }).catch((error) => {
            // Silently handle processing errors
            // Don't log to avoid console spam
          }).finally(() => {
            isProcessing = false
          })
        }
        
        frameCount++
      }
      animationFrameId = requestAnimationFrame(drawFrame)
    }

    drawFrame()
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isStreaming, mode, processFrame, results, frameResults, isProcessingFrames, currentVideoFilename, useEnhancedMode, processFrameEnhanced, uploadedImage])

  const drawDetections = (ctx: CanvasRenderingContext2D, result: any, clearFirst: boolean = true) => {
    if (!canvasRef.current) return
    
    // Check if we have a valid source (video or image)
    if (mode === 'image' && !imageRef.current) return
    if (mode !== 'image' && !videoRef.current) return
    
    const { detection, detections, safety_evaluation } = result

    // Clear and redraw video/image if needed
    if (clearFirst) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      // Draw video or image based on mode
      if (mode === 'image' && imageRef.current) {
        ctx.drawImage(imageRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)
      } else if (videoRef.current) {
        ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)
      }
    }

    // Support both detection.bounding_boxes and detections array
    const boxes = detection?.bounding_boxes || detections || []
    if (!boxes || boxes.length === 0) return

    boxes.forEach((box: any) => {
      // Skip if overlay is disabled
      if (box.class_name === 'worker' && !showObjects) return
      if (['helmet', 'vest', 'gloves', 'hard hat', 'safety helmet', 'construction helmet', 
           'safety vest', 'reflective vest', 'high visibility vest',
           'safety glasses', 'goggles', 'protective eyewear', 'safety goggles',
           'respirator', 'face mask', 'dust mask', 'safety mask'].includes(box.class_name) && !showPPE) return
      
      // Show machinery if showObjects is enabled
      const isMachinery = ['excavator', 'crane', 'forklift', 'bulldozer', 'loader', 'truck',
                           'machinery', 'equipment', 'compactor', 'roller', 'generator', 'compressor',
                           'chainsaw', 'grinder', 'welder', 'backhoe', 'skid steer', 'tower crane',
                           'mobile crane', 'dump truck', 'cement truck', 'construction machinery',
                           'heavy machinery'].some(m => box.class_name.toLowerCase().includes(m))
      if (isMachinery && !showObjects) return

      // Draw bounding box with thicker lines for visibility
      const color = getColorForClass(box.class_name)
      ctx.strokeStyle = color
      ctx.lineWidth = 4
      ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1)

      // Draw label background with better visibility
      ctx.fillStyle = color
      ctx.font = 'bold 16px Arial'
      const label = `${box.class_name}: ${(box.confidence * 100).toFixed(0)}%`
      const textWidth = ctx.measureText(label).width
      ctx.fillRect(box.x1, box.y1 - 28, textWidth + 12, 28)
      
      // Draw label text
      ctx.fillStyle = 'white'
      ctx.fillText(label, box.x1 + 6, box.y1 - 10)
    })

    // Show risk indicator overlay
    if (safety_evaluation && safety_evaluation.risk_score > 0.5) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
  }

  const getColorForClass = (className: string): string => {
    const classNameLower = className.toLowerCase()
    const colors: Record<string, string> = {
      // PPE items
      'hard hat': '#3b82f6',
      'helmet': '#3b82f6',
      'safety helmet': '#3b82f6',
      'construction helmet': '#3b82f6',
      'gloves': '#f59e0b',
      'safety gloves': '#f59e0b',
      'work gloves': '#f59e0b',
      'protective gloves': '#f59e0b',
      'vest': '#ef4444',
      'safety vest': '#ef4444',
      'reflective vest': '#ef4444',
      'high visibility vest': '#ef4444',
      'safety glasses': '#10b981',
      'goggles': '#10b981',
      'protective eyewear': '#10b981',
      'safety goggles': '#10b981',
      'respirator': '#8b5cf6',
      'face mask': '#8b5cf6',
      'dust mask': '#8b5cf6',
      'safety mask': '#8b5cf6',
      // Workers
      'worker': '#10b981',
      'person': '#10b981',
      'human': '#10b981',
      // Heavy Machinery
      'excavator': '#ec4899',
      'backhoe': '#ec4899',
      'bulldozer': '#ec4899',
      'loader': '#ec4899',
      'crane': '#ec4899',
      'tower crane': '#ec4899',
      'mobile crane': '#ec4899',
      'forklift': '#ec4899',
      'forklift truck': '#ec4899',
      'lift truck': '#ec4899',
      'dump truck': '#ec4899',
      'cement truck': '#ec4899',
      'concrete mixer': '#ec4899',
      'mixer truck': '#ec4899',
      'compactor': '#ec4899',
      'roller': '#ec4899',
      'road roller': '#ec4899',
      'generator': '#ec4899',
      'compressor': '#ec4899',
      'machinery': '#ec4899',
      'construction machinery': '#ec4899',
      'heavy machinery': '#ec4899',
      'construction equipment': '#ec4899',
      // Tools
      'tool': '#8b5cf6',
      'chainsaw': '#ec4899',
      'grinder': '#ec4899',
      'angle grinder': '#ec4899',
      'welding torch': '#ec4899',
      'welder': '#ec4899',
      'welding equipment': '#ec4899',
    }
    
    // Check for exact match first
    if (colors[classNameLower]) {
      return colors[classNameLower]
    }
    
    // Check for partial matches - machinery first
    if (classNameLower.includes('machinery') || classNameLower.includes('equipment') || 
        classNameLower.includes('excavator') || classNameLower.includes('crane') || 
        classNameLower.includes('forklift') || classNameLower.includes('bulldozer') ||
        classNameLower.includes('truck') || classNameLower.includes('loader') ||
        classNameLower.includes('compactor') || classNameLower.includes('roller') ||
        classNameLower.includes('generator') || classNameLower.includes('compressor')) {
      return '#ec4899' // Machinery color
    }
    
    // Check for other partial matches
    for (const [key, value] of Object.entries(colors)) {
      if (classNameLower.includes(key) || key.includes(classNameLower)) {
        return value
      }
    }
    
    return '#ffffff'
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    setMode('image')
    setResults(null)
    setProcessing(true)

    try {
      // Create image URL for preview
      const imageUrl = URL.createObjectURL(file)
      setUploadedImage(imageUrl)

      // Convert image to base64
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const base64Image = e.target?.result as string
          
          // Process image
          const processFunction = useEnhancedMode ? processFrameEnhanced : processFrame
          const result = await processFunction(base64Image, file.name, false)
          
          setResults(result)
          
          // Draw detections on canvas
          if (imageRef.current && canvasRef.current && result) {
            const ctx = canvasRef.current.getContext('2d')
            if (ctx) {
              const drawWhenReady = () => {
                if (imageRef.current && imageRef.current.complete) {
                  // Set canvas size to match image
                  canvasRef.current!.width = imageRef.current.naturalWidth || 640
                  canvasRef.current!.height = imageRef.current.naturalHeight || 480
                  // Draw image
                  ctx.drawImage(imageRef.current, 0, 0, canvasRef.current!.width, canvasRef.current!.height)
                  // Draw detections
                  drawDetections(ctx, result, false)
                } else {
                  setTimeout(drawWhenReady, 100)
                }
              }
              drawWhenReady()
            }
          }
          
          toast.success('Image processed successfully!')
        } catch (error: any) {
          console.error('Image processing error:', error)
          toast.error(error.response?.data?.detail || 'Failed to process image')
        } finally {
          setProcessing(false)
        }
      }
      reader.readAsDataURL(file)
    } catch (error: any) {
      console.error('Image upload error:', error)
      toast.error('Failed to upload image')
      setProcessing(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('video/')) {
      toast.error('Please upload a video file')
      return
    }

    setMode('upload')
    setResults(null)
    setFrameResults(new Map()) // Clear previous frame results

    // Create video URL for preview FIRST - show video immediately
      const videoUrl = URL.createObjectURL(file)
      setUploadedVideo(videoUrl)
      setCurrentVideoFilename(file.name) // Store filename for test detection

    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      if (videoRef.current) {
        // Stop any existing stream
        if (videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream
          stream.getTracks().forEach(track => track.stop())
        videoRef.current.srcObject = null
        }
        
        // Set video source
        videoRef.current.src = videoUrl
        videoRef.current.load()
        
        // Ensure video plays after loading
        const playVideo = () => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            videoRef.current.play().catch(err => {
              console.error('Error playing video:', err)
            })
          } else {
            // Retry if not ready
            setTimeout(playVideo, 100)
          }
        }
        
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            // Update canvas size
            if (canvasRef.current) {
              canvasRef.current.width = videoRef.current.videoWidth || 640
              canvasRef.current.height = videoRef.current.videoHeight || 480
            }
            playVideo()
          }
        }
        
        videoRef.current.oncanplay = () => {
          if (videoRef.current && videoRef.current.paused) {
            videoRef.current.play().catch(err => {
              console.error('Error playing video on canplay:', err)
            })
          }
        }
      }
    }, 0)

    // Now start processing in the background
    setProcessing(true)
    
    try {
      // Upload and process video (use enhanced if enabled)
      let response
      if (useEnhancedMode) {
        const enhancedData = await processVideoEnhanced(file)
        response = { data: enhancedData }
      } else {
        const formData = new FormData()
        formData.append('file', file)
        response = await api.post('/infer/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        })
      }

      setResults(response.data)
      setFrameResults(new Map()) // Clear previous frame results
      
      // Draw detections on canvas after processing
      if (canvasRef.current && videoRef.current && response.data) {
        const ctx = canvasRef.current.getContext('2d')
        if (ctx) {
          // Wait for video to be ready
          const drawWhenReady = () => {
            if (videoRef.current && videoRef.current.readyState >= 2) {
              // Set canvas size to match video
              canvasRef.current!.width = videoRef.current.videoWidth || 640
              canvasRef.current!.height = videoRef.current.videoHeight || 480
              // Draw video frame
              ctx.drawImage(videoRef.current, 0, 0, canvasRef.current!.width, canvasRef.current!.height)
              // Draw detections
              drawDetections(ctx, response.data, false)
            } else {
              // Retry after a short delay
              setTimeout(drawWhenReady, 100)
            }
          }
          drawWhenReady()
        }
      }
      
      toast.success('Video processed successfully! Annotations will appear as video plays.')
    } catch (error: any) {
      console.error('Upload error:', error)
      toast.error(error.response?.data?.detail || 'Failed to process video')
    } finally {
      setProcessing(false)
    }
  }

  const processCurrentFrame = async () => {
    if (!canvasRef.current || !videoRef.current) return

    setProcessing(true)
    try {
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.9)
      
      // Check if this is a test video based on filename
      const filename = currentVideoFilename || ''
      const isTestVideo = filename.includes('test_videos') || 
                        filename.includes('safe_worker') ||
                        filename.includes('worker_no') ||
                        filename.includes('hazard') ||
                        filename.includes('multiple') ||
                        filename.includes('moving') ||
                        filename.includes('tool') ||
                        filename.includes('worker_with')
      
      const processFunction = useEnhancedMode ? processFrameEnhanced : processFrame
      const result = await processFunction(imageData, filename, isTestVideo)
      if (result) {
        setResults(result)
        const ctx = canvasRef.current.getContext('2d')
        if (ctx && videoRef.current) {
          // Redraw video first
          ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)
          drawDetections(ctx, result, false)
        }
        toast.success('Frame processed!')
      }
    } catch (error: any) {
      toast.error('Failed to process frame')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Live Monitoring</h1>
        <p className="text-gray-600">Real-time workplace safety detection</p>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
            <span className="text-sm text-gray-600">
              {isConnected ? 'WebSocket Connected' : 'Using HTTP API'}
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useEnhancedMode}
                onChange={(e) => setUseEnhancedMode(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Enhanced Mode (Posture + Fatigue)</span>
            </label>
            <button
              onClick={() => setMode('live')}
              className={`px-4 py-2 rounded-lg ${
                mode === 'live'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Live Camera
            </button>
            <button
              onClick={() => {
                setMode('upload')
                fileInputRef.current?.click()
              }}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            >
              Upload Video
            </button>
            <button
              onClick={() => {
                setMode('image')
                imageInputRef.current?.click()
              }}
              className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
            >
              Upload Image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            {mode === 'upload' && videoRef.current?.src && (
              <button
                onClick={processCurrentFrame}
                disabled={processing}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Process Frame'}
              </button>
            )}
            {mode === 'image' && uploadedImage && (
              <button
                onClick={() => {
                  if (imageRef.current && canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d')
                    if (ctx && results) {
                      canvasRef.current.width = imageRef.current.naturalWidth || 640
                      canvasRef.current.height = imageRef.current.naturalHeight || 480
                      ctx.drawImage(imageRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)
                      drawDetections(ctx, results, false)
                    }
                  }
                }}
                disabled={processing || !results}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Redraw Annotations
              </button>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showPPE}
                onChange={(e) => setShowPPE(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">PPE</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showObjects}
                onChange={(e) => setShowObjects(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Objects</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showPosture}
                onChange={(e) => setShowPosture(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Posture</span>
            </label>
          </div>
        </div>

        <div className="relative bg-black rounded-lg overflow-hidden mb-4 flex items-center justify-center" style={{ minHeight: '800px' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            controls={mode === 'upload'}
            loop={mode === 'upload'}
            className="w-full h-auto block"
            style={{ 
              display: (mode === 'upload' && uploadedVideo) || (mode === 'live' && isStreaming) ? 'block' : 'none',
              width: '100%',
              height: 'auto',
              minHeight: '800px',
              maxHeight: '900px',
              objectFit: 'contain',
              zIndex: 1,
              backgroundColor: '#000'
            }}
            onLoadedMetadata={(e) => {
              // Update canvas size when video metadata loads
              if (canvasRef.current && videoRef.current) {
                canvasRef.current.width = videoRef.current.videoWidth || 640
                canvasRef.current.height = videoRef.current.videoHeight || 480
              }
              // Ensure video plays when metadata is loaded
              if (mode === 'upload' && videoRef.current) {
                videoRef.current.play().catch(err => {
                  console.error('Error auto-playing video:', err)
                })
              }
            }}
            onCanPlay={() => {
              // Ensure video plays when it can play
              if (mode === 'upload' && videoRef.current && videoRef.current.paused) {
                videoRef.current.play().catch(err => {
                  console.error('Error playing video:', err)
                })
              }
            }}
            onError={(e) => {
              console.error('Video error:', e)
              toast.error('Error loading video. Please try another file.')
            }}
          />
          <img
            ref={imageRef}
            src={uploadedImage || ''}
            alt="Uploaded image"
            className="w-full h-auto block"
            style={{ 
              display: mode === 'image' && uploadedImage ? 'block' : 'none',
              width: '100%',
              height: 'auto',
              minHeight: '800px',
              maxHeight: '900px',
              objectFit: 'contain',
              zIndex: 1
            }}
            onLoad={() => {
              // Draw image and detections when image loads
              if (imageRef.current && canvasRef.current && results) {
                const ctx = canvasRef.current.getContext('2d')
                if (ctx) {
                  canvasRef.current.width = imageRef.current.naturalWidth || 640
                  canvasRef.current.height = imageRef.current.naturalHeight || 480
                  ctx.drawImage(imageRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height)
                  drawDetections(ctx, results, false)
                }
              }
            }}
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ 
              display: 'block',
              width: '100%',
              height: 'auto',
              minHeight: '800px',
              maxHeight: '900px',
              objectFit: 'contain',
              zIndex: 2
            }}
          />
          
          {!isStreaming && mode === 'live' && !videoRef.current?.src && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 rounded-lg z-10" style={{ minHeight: '800px' }}>
              <div className="text-center">
                <p className="text-white text-lg mb-2">Initializing camera...</p>
                <p className="text-white text-sm">Or click "Upload Video" to process a video file</p>
              </div>
            </div>
          )}

          {mode === 'upload' && !uploadedVideo && !videoRef.current?.src && !processing && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 rounded-lg z-10" style={{ minHeight: '800px' }}>
              <div className="text-center">
                <p className="text-white text-lg mb-2">No video loaded</p>
                <p className="text-white text-sm">Click "Upload Video" to select a video file</p>
              </div>
            </div>
          )}
          
          {mode === 'image' && !uploadedImage && !processing && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 rounded-lg z-10" style={{ minHeight: '800px' }}>
              <div className="text-center">
                <p className="text-white text-lg mb-2">No image loaded</p>
                <p className="text-white text-sm">Click "Upload Image" to select an image file</p>
              </div>
            </div>
          )}
          
          {mode === 'upload' && uploadedVideo && videoRef.current && videoRef.current.readyState === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 rounded-lg z-5" style={{ minHeight: '800px' }}>
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                <p className="text-white text-lg">Loading video...</p>
              </div>
            </div>
          )}

          {processing && (
            <div className="absolute top-4 right-4 bg-black bg-opacity-80 text-white px-4 py-2 rounded-lg z-20 flex items-center space-x-2 shadow-lg">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <p className="text-white text-sm font-medium">
                {mode === 'image' ? 'Processing image...' : mode === 'upload' ? 'Processing video...' : 'Processing...'}
              </p>
            </div>
          )}
        </div>

        {results && (
          <div className="mt-4 space-y-4">
            {/* Violations Panel - Show when any PPE is missing or violations exist */}
            {/* Check multiple conditions: backend violations, missing_ppe array, or individual PPE status */}
            {(() => {
              const hasViolations = results.safety_evaluation?.violations && results.safety_evaluation.violations.length > 0
              const hasMissingPPE = results.safety_evaluation?.missing_ppe && results.safety_evaluation.missing_ppe.length > 0
              const ppeIncomplete = !results.safety_evaluation?.ppe_complete
              const hasRisk = results.safety_evaluation?.risk_score > 0
              
              // Also check individual PPE status - if any is missing, it's a violation
              const ppeStatus = results.safety_evaluation?.ppe_status
              const hasMissingFromStatus = ppeStatus && (
                !ppeStatus.helmet || !ppeStatus.vest || !ppeStatus.gloves || !ppeStatus.mask
              )
              
              return hasViolations || hasMissingPPE || ppeIncomplete || hasRisk || hasMissingFromStatus
            })() && (
              <div className="p-5 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-md">
                <h3 className="text-xl font-bold text-red-800 mb-3 flex items-center">
                  <span className="mr-2 text-2xl">⚠️</span>
                  VIOLATIONS DETECTED
                </h3>
                <p className="text-red-700 font-semibold mb-3 text-base">
                  Safety violations have been detected. Please review the details below.
                </p>
                
                {/* Show violations list if available */}
                {results.safety_evaluation?.violations && results.safety_evaluation.violations.length > 0 && (
                  <div className="mb-3">
                    <p className="font-semibold text-sm text-red-800 mb-2">Violation Details:</p>
                    <ul className="space-y-1">
                      {results.safety_evaluation.violations.map((violation: string, idx: number) => (
                        <li key={idx} className="text-red-700 text-sm flex items-start">
                          <span className="mr-2">•</span>
                          <span>{violation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Show missing PPE items - check both missing_ppe array and individual status */}
                {(() => {
                  const missingFromArray = results.safety_evaluation?.missing_ppe || []
                  const ppeStatus = results.safety_evaluation?.ppe_status
                  const missingFromStatus: string[] = []
                  
                  if (ppeStatus) {
                    if (!ppeStatus.helmet) missingFromStatus.push('Helmet')
                    if (!ppeStatus.vest) missingFromStatus.push('Vest')
                    if (!ppeStatus.gloves) missingFromStatus.push('Gloves')
                    if (!ppeStatus.mask) missingFromStatus.push('Mask')
                  }
                  
                  // Combine both sources, remove duplicates
                  const allMissing = Array.from(new Set([...missingFromArray, ...missingFromStatus]))
                  
                  if (allMissing.length > 0) {
                    return (
                      <div className="mt-3 p-3 bg-red-100 rounded border border-red-300">
                        <p className="font-bold text-sm text-red-800 mb-2">Missing PPE Items:</p>
                        <p className="text-red-700 text-base font-bold">{allMissing.join(', ')}</p>
                        <p className="text-red-600 text-xs mt-2 italic">
                          Any missing PPE item constitutes a safety violation.
                        </p>
                      </div>
                    )
                  }
                  return null
                })()}
                
                {/* Show if PPE is incomplete but no specific violations listed - also check individual status */}
                {(() => {
                  const ppeStatus = results.safety_evaluation?.ppe_status
                  const hasMissingFromStatus = ppeStatus && (
                    !ppeStatus.helmet || !ppeStatus.vest || !ppeStatus.gloves || !ppeStatus.mask
                  )
                  
                  const noViolations = !results.safety_evaluation?.violations || results.safety_evaluation.violations.length === 0
                  const noMissingArray = !results.safety_evaluation?.missing_ppe || results.safety_evaluation.missing_ppe.length === 0
                  
                  if ((!results.safety_evaluation?.ppe_complete || hasMissingFromStatus) && noViolations && noMissingArray) {
                    return (
                      <div className="mt-3 p-3 bg-red-100 rounded border border-red-300">
                        <p className="text-red-700 font-semibold">
                          ⚠️ PPE is incomplete - This is a SAFETY VIOLATION
                        </p>
                        <p className="text-red-600 text-xs mt-1">
                          One or more required PPE items (Helmet, Vest, Gloves, Mask) are missing.
                        </p>
                      </div>
                    )
                  }
                  return null
                })()}
              </div>
            )}
            
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">Detection Results</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-700 mb-2">Safety Evaluation</h4>
                  <div className="space-y-1 text-sm">
                  <p>PPE Status: <span className={results.safety_evaluation?.ppe_complete ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                    {results.safety_evaluation?.ppe_complete ? '✅ COMPLETE' : '⚠️ VIOLATION - INCOMPLETE'}
                  </span></p>
                  {!results.safety_evaluation?.ppe_complete && (
                    <p className="text-xs text-red-600 font-semibold mt-1">
                      ⚠️ Missing PPE detected - This is a SAFETY VIOLATION
                    </p>
                  )}
                  
                  {results.safety_evaluation?.ppe_status && (
                    <div className="mt-2 space-y-1">
                      <p className="font-semibold text-xs text-gray-600">PPE Status:</p>
                      <p>Helmet: <span className={results.safety_evaluation.ppe_status.helmet ? 'text-green-600' : 'text-red-600 font-bold'}>
                        {results.safety_evaluation.ppe_status.helmet ? '✓' : '✗ Missing'}
                      </span></p>
                      <p>Vest: <span className={results.safety_evaluation.ppe_status.vest ? 'text-green-600' : 'text-red-600 font-bold'}>
                        {results.safety_evaluation.ppe_status.vest ? '✓' : '✗ Missing'}
                      </span></p>
                      <p>Gloves: <span className={results.safety_evaluation.ppe_status.gloves ? 'text-green-600' : 'text-red-600 font-bold'}>
                        {results.safety_evaluation.ppe_status.gloves ? '✓' : '✗ Missing'}
                      </span></p>
                      <p>Mask: <span className={results.safety_evaluation.ppe_status.mask ? 'text-green-600' : 'text-red-600 font-bold'}>
                        {results.safety_evaluation.ppe_status.mask ? '✓' : '✗ Missing'}
                      </span></p>
                    </div>
                  )}
                  
                  {results.safety_evaluation?.missing_ppe && results.safety_evaluation.missing_ppe.length > 0 && (
                    <div className="mt-2 p-2 bg-red-50 rounded">
                      <p className="font-semibold text-xs text-red-700 mb-1">Missing PPE:</p>
                      <p className="text-red-600 text-xs">{results.safety_evaluation.missing_ppe.join(', ')}</p>
                    </div>
                  )}
                  
                  <p className="mt-2">Hazard Status: <span className={
                    !results.safety_evaluation?.ppe_complete || 
                    results.safety_evaluation?.hazard_proximity || 
                    (results.safety_evaluation?.violations && results.safety_evaluation.violations.length > 0) ||
                    results.safety_evaluation?.risk_score > 0
                      ? 'text-red-600 font-bold' : 'text-green-600'
                  }>
                    {!results.safety_evaluation?.ppe_complete || 
                     results.safety_evaluation?.hazard_proximity || 
                     (results.safety_evaluation?.violations && results.safety_evaluation.violations.length > 0) ||
                     results.safety_evaluation?.risk_score > 0
                      ? '⚠️ HAZARD DETECTED' : '✅ NO HAZARD'}
                  </span></p>
                  <p>Unsafe Posture: <span className={results.safety_evaluation?.unsafe_posture ? 'text-red-600' : 'text-green-600'}>
                    {results.safety_evaluation?.unsafe_posture ? 'Yes' : 'No'}
                  </span></p>
                  {useEnhancedMode && (
                    <p>Fatigue Detected: <span className={results.safety_evaluation?.fatigue_detected ? 'text-red-600' : 'text-green-600'}>
                      {results.safety_evaluation?.fatigue_detected ? 'Yes' : 'No'}
                    </span></p>
                  )}
                  <p className="mt-2 font-semibold">Risk Score: <span className={`font-bold text-lg ${results.safety_evaluation?.risk_score > 0.5 ? 'text-red-600' : results.safety_evaluation?.risk_score > 0.3 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {(results.safety_evaluation?.risk_score * 100).toFixed(0)}%
                  </span></p>
                </div>
              </div>
              
              {useEnhancedMode && results.posture && results.posture.length > 0 && (
                <div className="bg-white p-4 rounded-lg border-l-4 border-yellow-400">
                  <h4 className="font-semibold text-gray-700 mb-3 flex items-center">
                    <span className="mr-2">🧍</span>Posture Analysis
                  </h4>
                  {results.posture.map((p: any, idx: number) => (
                    <div key={idx} className={`space-y-1 text-sm mb-3 p-2 rounded ${
                      p.posture?.is_unsafe ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
                    }`}>
                      <p className="font-semibold">Worker {idx + 1}: <span className={p.posture?.is_unsafe ? 'text-red-600' : 'text-green-600'}>
                        {p.posture?.is_unsafe ? '⚠️ UNSAFE POSTURE' : '✅ SAFE POSTURE'}
                      </span></p>
                      <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 mt-1">
                        <p>Lean Angle: <span className="font-medium">{p.posture?.lean_angle?.toFixed(1) ?? 'N/A'}°</span></p>
                        <p>Spine Angle: <span className="font-medium">{p.posture?.spine_angle?.toFixed(1) ?? 'N/A'}°</span></p>
                        <p>Confidence: <span className="font-medium">{((p.posture?.confidence ?? 0) * 100).toFixed(0)}%</span></p>
                      </div>
                      {p.posture?.reasons && p.posture.reasons.length > 0 && (
                        <ul className="text-xs text-red-600 list-disc list-inside mt-1">
                          {p.posture.reasons.map((r: string, i: number) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {useEnhancedMode && results.fatigue && results.fatigue.length > 0 && (
                <div className="bg-white p-4 rounded-lg border-l-4 border-purple-400">
                  <h4 className="font-semibold text-gray-700 mb-3 flex items-center">
                    <span className="mr-2">😴</span>Fatigue Detection
                  </h4>
                  {results.fatigue.map((f: any, idx: number) => (
                    <div key={idx} className={`space-y-1 text-sm mb-3 p-2 rounded ${
                      f.fatigue?.is_fatigued ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
                    }`}>
                      <p className="font-semibold">Worker {idx + 1}: <span className={f.fatigue?.is_fatigued ? 'text-red-600' : 'text-green-600'}>
                        {f.fatigue?.is_fatigued ? '😴 FATIGUE DETECTED' : '✅ ALERT & AWAKE'}
                      </span></p>
                      <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 mt-1">
                        <p>Eye Aspect Ratio: <span className={`font-medium ${
                          (f.fatigue?.ear ?? 0.3) < 0.22 ? 'text-red-600' : 'text-gray-800'
                        }`}>{f.fatigue?.ear?.toFixed(3) ?? 'N/A'}</span></p>
                        <p>Head Roll: <span className="font-medium">{f.fatigue?.head_roll?.toFixed(1) ?? 'N/A'}°</span></p>
                        <p>Eyes Detected: <span className="font-medium">{f.fatigue?.num_eyes ?? 'N/A'}</span></p>
                        <p>Confidence: <span className="font-medium">{((f.fatigue?.confidence ?? 0.5) * 100).toFixed(0)}%</span></p>
                      </div>
                      {f.fatigue?.reason && (
                        <p className="text-xs text-gray-500 italic mt-1">{f.fatigue.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {useEnhancedMode && results.hazard_info && (
                <div className={`bg-white p-4 rounded-lg border-l-4 ${
                  results.hazard_info.proximity_detected ? 'border-red-500' : 'border-green-400'
                }`}>
                  <h4 className="font-semibold text-gray-700 mb-3 flex items-center">
                    <span className="mr-2">⚠️</span>Hazard Zone Analysis
                  </h4>
                  <div className="space-y-1 text-sm">
                    <p>Status: <span className={results.hazard_info.proximity_detected ? 'text-red-600 font-bold' : 'text-green-600 font-semibold'}>
                      {results.hazard_info.proximity_detected ? '🚨 DANGER ZONE BREACH' : '✅ SAFE DISTANCES'}
                    </span></p>
                    <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 mt-1">
                      <p>Workers Tracked: <span className="font-medium">{results.hazard_info.worker_count ?? 0}</span></p>
                      <p>Machinery Detected: <span className="font-medium">{results.hazard_info.machinery_count ?? 0}</span></p>
                      {results.hazard_info.closest_distance_px !== null && results.hazard_info.closest_distance_px !== undefined && (
                        <p>Closest Distance: <span className={`font-medium ${
                          results.hazard_info.closest_distance_px < 80 ? 'text-red-600' : 'text-gray-800'
                        }`}>{results.hazard_info.closest_distance_px.toFixed(0)}px</span></p>
                      )}
                    </div>
                    {results.hazard_info.danger_pairs && results.hazard_info.danger_pairs.length > 0 && (
                      <div className="mt-2 p-2 bg-red-50 rounded border border-red-200">
                        <p className="text-xs font-semibold text-red-700 mb-1">Danger Pairs:</p>
                        {results.hazard_info.danger_pairs.map((pair: any, i: number) => (
                          <p key={i} className="text-xs text-red-600">
                            🔴 Worker {pair.risk_level} near {pair.machine} ({pair.distance_px.toFixed(0)}px)
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-semibold text-gray-700 mb-2">Detections</h4>
                <p className="text-sm text-gray-600">
                  Found {results.detection?.bounding_boxes?.length || results.detections?.length || 0} objects
                </p>
                {results.detection?.bounding_boxes && (
                  <div className="mt-2 space-y-1 text-sm">
                    {results.detection.bounding_boxes.map((box: any, idx: number) => (
                      <p key={idx} className="text-gray-700">
                        {box.class_name}: {(box.confidence * 100).toFixed(0)}%
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-white p-4 rounded-lg">
                <h4 className="font-semibold text-gray-700 mb-2">Violations</h4>
                {results.safety_evaluation?.violations && results.safety_evaluation.violations.length > 0 ? (
                  <ul className="text-sm text-red-600 space-y-1">
                    {results.safety_evaluation.violations.map((violation: string, idx: number) => (
                      <li key={idx}>• {violation}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-green-600">No violations detected</p>
                )}
              </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
