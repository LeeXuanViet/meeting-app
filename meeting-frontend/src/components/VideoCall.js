import { useEffect, useRef, useState, useMemo, memo } from "react"

export default function VideoCall({ participants, socketRef, roomId, user, onToggleMedia }) {
  const [localStream, setLocalStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState(new Map()) // userId -> MediaStream
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  // const [activeSpeakers, setActiveSpeakers] = useState(new Set())

  const localVideoRef = useRef(null)
  const peerConnectionsRef = useRef(new Map()) // userId -> RTCPeerConnection
  const screenStreamRef = useRef(null)
  const [showPeoplePanel, setShowPeoplePanel] = useState(false)
  const [startTime] = useState(Date.now())
  const [elapsed, setElapsed] = useState("00:00")
  const audioContextRef = useRef(null)
  const micSourceRef = useRef(null)
  const micGainRef = useRef(null)
  const micProcessedStreamRef = useRef(null) // MediaStream containing processed mic audio
  const [micGain, setMicGain] = useState(1.0)

  // Khởi tạo local media stream
  useEffect(() => {
    initializeLocalMedia()
    const timer = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime) / 1000)
      const mm = String(Math.floor(secs / 60)).padStart(2, "0")
      const ss = String(secs % 60).padStart(2, "0")
      setElapsed(`${mm}:${ss}`)
    }, 1000)
    return () => {
      // Cleanup
      try { localStream?.getTracks().forEach((t) => t.stop()) } catch {}
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      // Close and clear all peer connections to avoid reusing closed PCs on remount
      try {
        peerConnectionsRef.current.forEach((pc) => {
          try { pc.close() } catch {}
        })
        peerConnectionsRef.current.clear()
      } catch {}
      clearInterval(timer)
    }
  }, [startTime]) // eslint-disable-line react-hooks/exhaustive-deps

  // Xử lý WebRTC events khi có participants mới
  useEffect(() => {
    if (!socketRef.current) return

    const socket = socketRef.current

    // Media toggle events
    const handleMediaToggle = (data) => {
      console.log("Media toggle:", data)
      // Update remote user media state in UI
      // This will be handled by the parent component
    }

    // WebRTC Offer received
    const handleOffer = async (data) => {
      const { fromUserId, offer } = data
      console.log(`[VideoCall] Received offer from: ${fromUserId}`)

      // CRITICAL FIX #1: Ensure localStream is ready before processing offer
      if (!localStream) {
        console.warn(`[VideoCall] Local stream not ready when receiving offer from ${fromUserId}, initializing now...`)
        try {
          await initializeLocalMedia()
          // Wait a bit for stream to be set
          await new Promise(resolve => setTimeout(resolve, 100))
        } catch (err) {
          console.error(`[VideoCall] Failed to initialize local media when receiving offer:`, err)
          // Continue anyway, might still work if stream becomes available
        }
      }

      const pc = await getOrCreatePeerConnection(fromUserId)
      
      // CRITICAL: Ensure local tracks are added before creating answer
      // If localStream wasn't ready when PC was created, add tracks now
      const senders = pc.getSenders()
      const hasVideoTrack = senders.some(s => s.track && s.track.kind === "video")
      const hasAudioTrack = senders.some(s => s.track && s.track.kind === "audio")
      
      console.log(`[VideoCall] Before creating answer for ${fromUserId}: hasVideo=${hasVideoTrack}, hasAudio=${hasAudioTrack}, hasLocalStream=${!!localStream}, senders=${senders.length}`)
      
      if (localStream && (!hasVideoTrack || !hasAudioTrack)) {
        console.log(`[VideoCall] Adding missing tracks to PC for ${fromUserId} before creating answer`)
        // Add video tracks if missing
        if (!hasVideoTrack) {
          const videoTracks = localStream.getVideoTracks()
          console.log(`[VideoCall] Adding ${videoTracks.length} video track(s) to PC for ${fromUserId}`)
          videoTracks.forEach((track) => {
            if (pc.signalingState !== "closed") {
              try {
                const sender = pc.addTrack(track, localStream)
                console.log(`[VideoCall] Added video track to PC for ${fromUserId} before answer, trackId: ${track.id}`)
                const params = sender.getParameters()
                params.degradationPreference = "maintain-framerate"
                if (!params.encodings || params.encodings.length === 0) {
                  params.encodings = [{ maxBitrate: 600000 }]
                }
                sender.setParameters(params)
              } catch (err) {
                console.error(`[VideoCall] Error adding video track before answer:`, err)
              }
            }
          })
        }
        
        // Add audio tracks if missing
        if (!hasAudioTrack) {
          const audioTracks = micProcessedStreamRef.current?.getAudioTracks?.()
          const processedMicTrack = audioTracks && audioTracks[0] ? audioTracks[0] : localStream.getAudioTracks()[0]
          if (processedMicTrack && pc.signalingState !== "closed") {
            try {
              pc.addTrack(processedMicTrack, micProcessedStreamRef.current || localStream)
              console.log(`[VideoCall] Added audio track to PC for ${fromUserId} before answer, trackId: ${processedMicTrack.id}`)
            } catch (err) {
              console.error(`[VideoCall] Error adding audio track before answer:`, err)
            }
          } else {
            console.warn(`[VideoCall] No audio track available to add for ${fromUserId}`)
          }
        }
      } else if (!localStream) {
        console.error(`[VideoCall] CRITICAL: Cannot create answer for ${fromUserId} - localStream is still null!`)
      }
      
      try {
        const offerDesc = new RTCSessionDescription(offer)
        
        // Check if offer contains media (tracks)
        const hasAudio = offer.sdp?.includes('m=audio') || false
        const hasVideo = offer.sdp?.includes('m=video') || false
        console.log(`[VideoCall] Offer from ${fromUserId} contains:`, {
          hasAudio,
          hasVideo,
          sdpPreview: offer.sdp?.substring(0, 200)
        })

        const isStabilized = pc.signalingState === "stable"
        if (!isStabilized) {
          // Glare: rollback local description before applying remote offer
          try {
            await pc.setLocalDescription({ type: "rollback" })
          } catch {}
        }

        await pc.setRemoteDescription(offerDesc)
        console.log(`[VideoCall] Remote description set for ${fromUserId}`)
        
        // Verify tracks are still there before creating answer
        const finalSenders = pc.getSenders()
        const finalHasVideo = finalSenders.some(s => s.track && s.track.kind === "video")
        const finalHasAudio = finalSenders.some(s => s.track && s.track.kind === "audio")
        console.log(`[VideoCall] Before createAnswer for ${fromUserId}: hasVideo=${finalHasVideo}, hasAudio=${finalHasAudio}, senders=${finalSenders.length}`)

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        // Check if answer contains media
        const answerHasAudio = answer.sdp?.includes('m=audio') || false
        const answerHasVideo = answer.sdp?.includes('m=video') || false
        console.log(`[VideoCall] Answer created for ${fromUserId}:`, {
          hasAudio: answerHasAudio,
          hasVideo: answerHasVideo,
          sdpPreview: answer.sdp?.substring(0, 200)
        })

        socket.emit("webrtc-answer", {
          roomId,
          targetUserId: fromUserId,
          answer: pc.localDescription,
        })
        console.log(`[VideoCall] Answer sent to ${fromUserId}`)
        
        // Check connection state after sending answer
        setTimeout(() => {
          console.log(`[VideoCall] Connection state after sending answer for ${fromUserId}:`, {
            connectionState: pc.connectionState,
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState,
            signalingState: pc.signalingState,
            senders: pc.getSenders().length,
            receivers: pc.getReceivers().length
          })
        }, 1000)
      } catch (err) {
        console.error(`[VideoCall] Error handling offer from ${fromUserId}:`, err)
      }
    }

    // WebRTC Answer received
    const handleAnswer = async (data) => {
      const { fromUserId, answer } = data
      console.log(`[VideoCall] Received answer from: ${fromUserId}`)

      const pc = peerConnectionsRef.current.get(fromUserId)
      if (pc) {
        try {
          const answerDesc = new RTCSessionDescription(answer)
          
          // Check if answer contains media (tracks)
          const hasAudio = answer.sdp?.includes('m=audio') || false
          const hasVideo = answer.sdp?.includes('m=video') || false
          console.log(`[VideoCall] Answer from ${fromUserId} contains:`, {
            hasAudio,
            hasVideo,
            sdpPreview: answer.sdp?.substring(0, 200)
          })
          
          await pc.setRemoteDescription(answerDesc)
          console.log(`[VideoCall] Remote description set for ${fromUserId}`)
          
          // Check connection state and receivers after setting answer
          setTimeout(() => {
            const receivers = pc.getReceivers()
            console.log(`[VideoCall] Connection state after answer for ${fromUserId}:`, {
              connectionState: pc.connectionState,
              iceConnectionState: pc.iceConnectionState,
              iceGatheringState: pc.iceGatheringState,
              signalingState: pc.signalingState,
              receiversCount: receivers.length,
              receivers: receivers.map(r => ({
                kind: r.track?.kind,
                trackId: r.track?.id,
                trackReadyState: r.track?.readyState,
                trackMuted: r.track?.muted,
                trackEnabled: r.track?.enabled
              }))
            })
            
            // If we have receivers but no ontrack event fired, something is wrong
            if (receivers.length > 0) {
              console.log(`[VideoCall] WARNING: Have ${receivers.length} receiver(s) but ontrack may not have fired yet`)
            }
          }, 1000)
        } catch (err) {
          console.error(`[VideoCall] Error setting remote answer for ${fromUserId}:`, err)
        }
      } else {
        console.error(`[VideoCall] No peer connection found for ${fromUserId} when receiving answer`)
      }
    }

    // ICE Candidate received
    const handleIceCandidate = async (data) => {
      const { fromUserId, candidate } = data
      console.log("Received ICE candidate from:", fromUserId)

      const pc = peerConnectionsRef.current.get(fromUserId)
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
    }

    // End call event
    const handleEndCall = (data) => {
      const { userId } = data
      console.log("End call from:", userId)
      removePeerConnection(userId)
    }

    socket.on("media-toggle", handleMediaToggle)
    socket.on("webrtc-offer", handleOffer)
    socket.on("webrtc-answer", handleAnswer)
    socket.on("webrtc-ice-candidate", handleIceCandidate)
    socket.on("webrtc-end-call", handleEndCall)

    return () => {
      socket.off("media-toggle", handleMediaToggle)
      socket.off("webrtc-offer", handleOffer)
      socket.off("webrtc-answer", handleAnswer)
      socket.off("webrtc-ice-candidate", handleIceCandidate)
      socket.off("webrtc-end-call", handleEndCall)
    }
  }, [socketRef, roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize local video/audio
  const initializeLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 15, max: 24 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        try { localVideoRef.current.srcObject.getVideoTracks()[0].contentHint = "motion" } catch {}
      }

      // Build mic processing pipeline (Web Audio) to boost mic volume if needed
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
        micSourceRef.current = audioContextRef.current.createMediaStreamSource(stream)
        micGainRef.current = audioContextRef.current.createGain()
        micGainRef.current.gain.value = micGain
        const dest = audioContextRef.current.createMediaStreamDestination()
        micSourceRef.current.connect(micGainRef.current).connect(dest)
        micProcessedStreamRef.current = dest.stream
      } catch (e) {
        console.warn("WebAudio not available:", e)
      }
      console.log("Local media initialized")
    } catch (error) {
      console.error("Error accessing media devices:", error)
      alert("Không thể truy cập camera/microphone")
    }
  }

  // Create or get peer connection
  const getOrCreatePeerConnection = async (userId) => {
    const existing = peerConnectionsRef.current.get(userId)
    if (existing) {
      if (existing.signalingState !== "closed") return existing
      // remove closed instance
      peerConnectionsRef.current.delete(userId)
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    })

    // Add local tracks + tune encodings to reduce flicker
    if (localStream) {
      console.log(`Adding local tracks to peer connection for ${userId}`)
      // Prefer processed mic track if available
      const audioTracks = micProcessedStreamRef.current?.getAudioTracks?.()
      const processedMicTrack = audioTracks && audioTracks[0] ? audioTracks[0] : localStream.getAudioTracks()[0]

      const videoTracks = localStream.getVideoTracks()
      console.log(`Adding ${videoTracks.length} video track(s) to peer connection for ${userId}`)
      videoTracks.forEach((track) => {
        if (pc.signalingState === "closed") return
        let sender
        try { 
          sender = pc.addTrack(track, localStream)
          console.log(`Video track added to peer connection for ${userId}`)
        } catch (err) { 
          console.error(`Error adding video track for ${userId}:`, err)
          return 
        }
        try {
          const params = sender.getParameters()
          params.degradationPreference = "maintain-framerate"
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{ maxBitrate: 600000 }]
          }
          sender.setParameters(params)
        } catch (err) {
          console.warn(`Error setting video track parameters for ${userId}:`, err)
        }
      })
      if (processedMicTrack) {
        try {
          if (pc.signalingState !== "closed") {
            pc.addTrack(processedMicTrack, micProcessedStreamRef.current || localStream)
            console.log(`Audio track added to peer connection for ${userId}`)
          }
        } catch (err) {
          console.error(`Error adding audio track for ${userId}:`, err)
        }
      } else {
        console.warn(`No audio track available for ${userId}`)
      }
    } else {
      console.warn(`Cannot add tracks to peer connection for ${userId}: localStream not ready`)
    }

    // Avoid relying on onnegotiationneeded to prevent renegotiation loops causing flicker

    // Handle remote stream
    pc.ontrack = (event) => {
      const track = event.track
      const [remoteStream] = event.streams
      
      console.log(`[VideoCall] ========== ONTRACK EVENT RECEIVED ==========`)
      console.log(`[VideoCall] ontrack event from ${userId}:`, {
        kind: track.kind,
        id: track.id,
        readyState: track.readyState,
        muted: track.muted,
        enabled: track.enabled,
        hasStream: !!remoteStream,
        streamId: remoteStream?.id,
        eventStreams: event.streams.length,
        receiver: event.receiver?.track?.kind
      })
      console.log(`[VideoCall] =============================================`)
      
      // CRITICAL FIX: Get or create stream, and merge tracks properly
      // Only create new stream reference when tracks actually change to prevent flickering
      setRemoteStreams((prev) => {
        let existingStream = prev.get(userId)
        let needsUpdate = false
        
        if (!existingStream) {
          // No existing stream, create new one (only first time)
          if (!remoteStream) {
            console.log(`[VideoCall] Creating new stream for ${userId} with track ${track.id}`)
            existingStream = new MediaStream([track])
          } else {
            console.log(`[VideoCall] Using remoteStream from event for ${userId}`)
            existingStream = remoteStream
          }
          needsUpdate = true
        } else {
          // CRITICAL: existingStream is the same object as in the map
          // We modify it in place, so video element will automatically update
          // Existing stream found - check if this track is new or different
          const existingTracksOfKind = existingStream.getTracks().filter(t => t.kind === track.kind)
          const isNewTrack = !existingTracksOfKind.some(t => t.id === track.id)
          
          if (isNewTrack) {
            // This is a new track, need to merge it
            console.log(`[VideoCall] New ${track.kind} track ${track.id} received for ${userId}, merging into existing stream`)
            
            // If we already have a track of this kind, replace it
            if (existingTracksOfKind.length > 0) {
              existingTracksOfKind.forEach(t => existingStream.removeTrack(t))
              console.log(`[VideoCall] Removed ${existingTracksOfKind.length} old ${track.kind} track(s) from stream for ${userId}`)
            }
            
            // Add new track to existing stream
            existingStream.addTrack(track)
            console.log(`[VideoCall] Added ${track.kind} track ${track.id} to existing stream for ${userId}`)
            needsUpdate = true
          } else {
            // Track already exists, no need to update
            console.log(`[VideoCall] Track ${track.id} (${track.kind}) already exists in stream for ${userId}, skipping update`)
            return prev // Return previous state to prevent unnecessary re-render
          }
        }
        
        if (!needsUpdate) {
          return prev
        }
        
        // Log final stream state
        const finalVideoTracks = existingStream.getVideoTracks()
        const finalAudioTracks = existingStream.getAudioTracks()
        console.log(`[VideoCall] Final stream for ${userId}:`, {
          streamId: existingStream.id,
          active: existingStream.active,
          videoTracks: finalVideoTracks.length,
          audioTracks: finalAudioTracks.length,
          videoTrackStates: finalVideoTracks.map(t => ({ id: t.id, readyState: t.readyState, muted: t.muted, enabled: t.enabled })),
          audioTrackStates: finalAudioTracks.map(t => ({ id: t.id, readyState: t.readyState, muted: t.muted, enabled: t.enabled }))
        })
        
        // CRITICAL FIX: Don't create new stream reference - just modify existing one
        // Creating new MediaStream causes video element to re-attach, causing flickering
        // Video element will automatically update when tracks are added to the stream
        // because it references the stream object directly
        const existingStreamInMap = prev.get(userId)
        
        if (!existingStreamInMap) {
          // First time, need to set the stream - this requires state update
          const copy = new Map(prev)
          copy.set(userId, existingStream)
          console.log(`[VideoCall] Setting initial stream for ${userId}`)
          return copy
        } else {
          // Stream already exists in map - existingStream is the same object
          // Tracks were modified in place, video element will automatically update
          // NO NEED to trigger React re-render - this causes flickering!
          // Video element references the stream object, so it will update automatically
          // when tracks are added/removed from the stream
          console.log(`[VideoCall] Stream tracks modified for ${userId} (same reference, no state update needed)`)
          // Return previous state to prevent unnecessary re-render
          return prev
        }
      })
      
      // Also listen for track events to update state
      // Note: We don't need to update stream reference here as the track events
      // will be handled by the RemoteVideo component's useEffect listeners
      track.onunmute = () => {
        console.log(`[VideoCall] Remote track unmuted from ${userId}, kind: ${track.kind}`)
        // Don't update stream reference here to prevent flickering
        // The RemoteVideo component will handle track state changes via its own listeners
      }
      
      // Handle track ended
      track.onended = () => {
        console.log(`[VideoCall] Remote track ended from ${userId}, kind: ${track.kind}`)
        if (track.kind === "video") {
          // Don't remove stream immediately, wait a bit in case it reconnects
          setTimeout(() => {
            setRemoteStreams((prev) => {
              const copy = new Map(prev)
              const stream = copy.get(userId)
              if (stream) {
                const videoTracks = stream.getVideoTracks()
                // Only remove if no live video tracks remain
                if (videoTracks.length === 0 || videoTracks.every(t => t.readyState === "ended")) {
                  copy.delete(userId)
                }
              }
              return copy
            })
          }, 2000)
        }
      }
    }

    pc.onremovetrack = (event) => {
      const senderUserId = userId
      setRemoteStreams((prev) => {
        const copy = new Map(prev)
        copy.delete(senderUserId)
        return copy
      })
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("webrtc-ice-candidate", {
          roomId,
          targetUserId: userId,
          candidate: event.candidate,
        })
      }
    }

    // Handle connection state
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${userId}:`, pc.connectionState)
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        console.error(`WebRTC connection ${pc.connectionState} with ${userId}. ICE connection state:`, pc.iceConnectionState)
        // Optionally try to reconnect or notify user
      }
    }
    
    // Handle ICE connection state for better debugging
    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${userId}:`, pc.iceConnectionState)
      if (pc.iceConnectionState === "failed") {
        console.error(`ICE connection failed with ${userId}. This may indicate NAT/firewall issues.`)
      }
    }
    
    // Log ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log(`ICE gathering state with ${userId}:`, pc.iceGatheringState)
    }

    peerConnectionsRef.current.set(userId, pc)
    return pc
  }

  // Create and send offer to user
  const createOfferForUser = async (userId) => {
    try {
      // CRITICAL FIX #1: Ensure localStream is ready before creating offer
      if (!localStream) {
        console.warn(`[VideoCall] Cannot create offer for ${userId}: localStream not ready yet, waiting...`)
        // Wait a bit and retry
        setTimeout(() => {
          if (localStream) {
            console.log(`[VideoCall] Retrying offer creation for ${userId} after localStream ready`)
            createOfferForUser(userId)
          }
        }, 500)
        return
      }

      const pc = await getOrCreatePeerConnection(userId)
      // Deterministic initiator to avoid glare: only the lexicographically smaller userId makes offers
      if ((user?.id || "") > userId) {
        console.log(`[VideoCall] Skipping offer creation for ${userId} (not initiator)`)
        return
      }
      if (pc.signalingState !== "stable") {
        console.log(`[VideoCall] Skipping offer creation for ${userId} (signaling state: ${pc.signalingState})`)
        return
      }
      
      // Check if we have local tracks before creating offer
      const senders = pc.getSenders()
      const hasVideoTrack = senders.some(s => s.track && s.track.kind === "video")
      const hasAudioTrack = senders.some(s => s.track && s.track.kind === "audio")
      console.log(`[VideoCall] Creating offer for ${userId}. Has video: ${hasVideoTrack}, Has audio: ${hasAudioTrack}, LocalStream: ${!!localStream}, senders: ${senders.length}`)
      
      if (!hasVideoTrack && localStream) {
        console.warn(`[VideoCall] No video track in PC for ${userId}, adding now...`)
        const videoTracks = localStream.getVideoTracks()
        videoTracks.forEach((track) => {
          if (pc.signalingState !== "closed") {
            try {
              const sender = pc.addTrack(track, localStream)
              console.log(`[VideoCall] Added video track to PC for ${userId} before offer`)
              const params = sender.getParameters()
              params.degradationPreference = "maintain-framerate"
              if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{ maxBitrate: 600000 }]
              }
              sender.setParameters(params)
            } catch (err) {
              console.error(`[VideoCall] Error adding video track before offer:`, err)
            }
          }
        })
      }
      
      if (!hasAudioTrack && localStream) {
        const audioTracks = micProcessedStreamRef.current?.getAudioTracks?.()
        const processedMicTrack = audioTracks && audioTracks[0] ? audioTracks[0] : localStream.getAudioTracks()[0]
        if (processedMicTrack && pc.signalingState !== "closed") {
          try {
            pc.addTrack(processedMicTrack, micProcessedStreamRef.current || localStream)
            console.log(`[VideoCall] Added audio track to PC for ${userId} before offer`)
          } catch (err) {
            console.error(`[VideoCall] Error adding audio track before offer:`, err)
          }
        }
      }
      
      const finalSenders = pc.getSenders()
      const finalHasVideo = finalSenders.some(s => s.track && s.track.kind === "video")
      const finalHasAudio = finalSenders.some(s => s.track && s.track.kind === "audio")
      
      if (!finalHasVideo) {
        console.error(`[VideoCall] CRITICAL: Still no video track after adding! Cannot create offer for ${userId}`)
        return
      }
      
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      console.log(`[VideoCall] Offer created and set for ${userId}, hasVideo: ${finalHasVideo}, hasAudio: ${finalHasAudio}`)

      if (socketRef.current) {
        socketRef.current.emit("webrtc-offer", {
          roomId,
          targetUserId: userId,
          offer: pc.localDescription,
        })
        console.log(`[VideoCall] Offer sent via socket to ${userId}`)
      } else {
        console.error(`[VideoCall] CRITICAL: socketRef.current is null! Cannot send offer to ${userId}`)
      }
    } catch (error) {
      console.error(`[VideoCall] Error creating offer for ${userId}:`, error)
    }
  }

  // When local stream becomes available later, add tracks to existing PCs and renegotiate
  useEffect(() => {
    if (!localStream) {
      console.log("Local stream not ready yet, waiting...")
      return
    }
    console.log("Local stream ready, adding tracks to existing peer connections")
    peerConnectionsRef.current.forEach((pc, remoteUserId) => {
      if (pc.signalingState === "closed") {
        try { peerConnectionsRef.current.delete(remoteUserId) } catch {}
        return
      }
      const sendersKinds = pc.getSenders().map((s) => s.track?.kind)
      console.log(`Checking tracks for ${remoteUserId}. Existing senders:`, sendersKinds)
      
      // Add video tracks
      const videoTracks = localStream.getVideoTracks()
      videoTracks.forEach((track) => {
        if (!sendersKinds.includes("video")) {
          try { 
            if (pc.signalingState !== "closed") {
              pc.addTrack(track, localStream)
              console.log(`Added video track to existing PC for ${remoteUserId}`)
            }
          } catch (err) {
            console.error(`Error adding video track to existing PC for ${remoteUserId}:`, err)
          }
        }
      })
      
      // Add audio tracks (prefer processed mic if available)
      if (!sendersKinds.includes("audio")) {
        const audioTracks = micProcessedStreamRef.current?.getAudioTracks?.()
        const processedMicTrack = audioTracks && audioTracks[0] ? audioTracks[0] : localStream.getAudioTracks()[0]
        if (processedMicTrack) {
          try {
            if (pc.signalingState !== "closed") {
              pc.addTrack(processedMicTrack, micProcessedStreamRef.current || localStream)
              console.log(`Added audio track to existing PC for ${remoteUserId}`)
            }
          } catch (err) {
            console.error(`Error adding audio track to existing PC for ${remoteUserId}:`, err)
          }
        }
      }
      
      // Fire negotiation for initiator
      if ((user?.id || "") < (remoteUserId || "")) {
        console.log(`Triggering renegotiation for ${remoteUserId} after adding tracks`)
        createOfferForUser(remoteUserId)
      }
    })
  }, [localStream]) // eslint-disable-line react-hooks/exhaustive-deps

  // Remove peer connection
  const removePeerConnection = (userId) => {
    const pc = peerConnectionsRef.current.get(userId)
    if (pc) {
      pc.close()
      peerConnectionsRef.current.delete(userId)
    }
    setRemoteStreams((prev) => {
      const newMap = new Map(prev)
      newMap.delete(userId)
      return newMap
    })
  }

  // Toggle video
  const toggleVideo = () => {
    const next = !isVideoEnabled
    setIsVideoEnabled(next)
    const videoTrack = localStream?.getVideoTracks?.()[0]
    if (videoTrack) videoTrack.enabled = next

    // Cập nhật tất cả peer connections để tránh flicker phía nhận
    peerConnectionsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video")
      if (!sender) return
      try {
        if (next && videoTrack) {
          sender.replaceTrack(videoTrack)
        } else {
          // gửi null để bên kia không nhận khung hình đen nhấp nháy
          sender.replaceTrack(null)
        }
      } catch {}
    })

    notifyMediaToggle("video", next)
  }

  // Toggle audio
  const toggleAudio = () => {
    const next = !isAudioEnabled
    setIsAudioEnabled(next)

    const audioTrack = (micProcessedStreamRef.current?.getAudioTracks?.()[0]) || (localStream?.getAudioTracks?.()[0])
    if (audioTrack) audioTrack.enabled = next

    // Mute tất cả audio đang gửi (kể cả từ share) để đảm bảo phía kia không nghe thấy
    peerConnectionsRef.current.forEach((pc) => {
      pc.getSenders()
        .filter((s) => s.track && s.track.kind === "audio")
        .forEach((sender) => {
          try {
            if (next && audioTrack) sender.replaceTrack(audioTrack)
            else sender.replaceTrack(null)
          } catch {}
        })
    })

    notifyMediaToggle("audio", next)
  }

  // Toggle screen share
  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })

        // Replace video track in all peer connections
        const videoTrack = screenStream.getVideoTracks()[0]
        const audioShare = screenStream.getAudioTracks()[0]
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video")
          if (sender) {
            sender.replaceTrack(videoTrack)
          }
          // nếu có audio từ share, đẩy lên (ghi đè mute của mic)
          if (audioShare) {
            const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio")
            if (audioSender) {
              try { audioSender.replaceTrack(audioShare) } catch {}
            }
          }
        })

        // Update local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream
        }

        screenStreamRef.current = screenStream
        setIsScreenSharing(true)
        notifyMediaToggle("screen", true)

        // Handle screen share end
        videoTrack.onended = () => {
          toggleScreenShare()
        }
      } else {
        // Stop screen sharing
        if (screenStreamRef.current) {
          const videoTrack = localStream?.getVideoTracks()[0]
          const micTrack = localStream?.getAudioTracks?.()[0]
          if (videoTrack) {
            // Replace back to camera
            peerConnectionsRef.current.forEach((pc) => {
              const sender = pc.getSenders().find((s) => s.track?.kind === "video")
              if (sender) {
                sender.replaceTrack(videoTrack)
              }
              // khôi phục audio mic nếu đang bật
              const audioSender = pc.getSenders().find((s) => s.track?.kind === "audio")
              if (audioSender) {
            const processed = micProcessedStreamRef.current?.getAudioTracks?.()[0] || micTrack
            try { audioSender.replaceTrack(isAudioEnabled && processed ? processed : null) } catch {}
              }
            })

            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStream
            }

            screenStreamRef.current.getTracks().forEach((track) => track.stop())
            screenStreamRef.current = null
            setIsScreenSharing(false)
            notifyMediaToggle("screen", false)
          }
        }
      }
    } catch (error) {
      console.error("Error toggling screen share:", error)
      alert("Không thể chia sẻ màn hình")
    }
  }

  // Notify other users about media toggle
  const notifyMediaToggle = (mediaType, enabled) => {
    if (socketRef.current) {
      socketRef.current.emit("media-toggle", {
        roomId,
        mediaType,
        enabled,
      })
    }
  }

  // Create/cleanup peer connections based on participants list
  useEffect(() => {
    if (!participants) {
      console.log("No participants, skipping peer connection setup")
      return
    }
    console.log("Participants changed:", participants.map(p => ({ userId: p.userId, userName: p.userName })))
    const currentIds = new Set(participants.map((p) => p.userId))

    // Close PCs for users who left
    ;[...peerConnectionsRef.current.keys()].forEach((uid) => {
      if (!currentIds.has(uid)) {
        console.log(`Removing peer connection for user ${uid} (left meeting)`)
        removePeerConnection(uid)
      }
    })

    // Create PCs and offer only for new users
    participants.forEach((p) => {
      if (p.userId === user?.id) {
        console.log(`Skipping peer connection for self: ${p.userId}`)
        return
      }
      if (!peerConnectionsRef.current.has(p.userId)) {
        console.log(`Creating new peer connection for user ${p.userId} (${p.userName})`)
        getOrCreatePeerConnection(p.userId).then(() => {
          console.log(`Peer connection created for ${p.userId}, creating offer...`)
          // Wait a bit to ensure tracks are added
          setTimeout(() => {
            createOfferForUser(p.userId)
          }, 100)
        }).catch((err) => {
          console.error(`Error creating peer connection for ${p.userId}:`, err)
        })
      } else {
        console.log(`Peer connection already exists for user ${p.userId}`)
      }
    })
  }, [participants, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent state churn from frequent track events by batching remote streams update
  const setRemoteStreamForUser = (userId, remoteStream) => {
    setRemoteStreams((prev) => {
      const existing = prev.get(userId)
      if (existing === remoteStream) {
        console.log(`[VideoCall] Stream for ${userId} unchanged, skipping update`)
        return prev
      }
      console.log(`[VideoCall] Setting remote stream for ${userId}:`, {
        streamId: remoteStream?.id,
        active: remoteStream?.active,
        videoTracks: remoteStream?.getVideoTracks()?.length || 0,
        audioTracks: remoteStream?.getAudioTracks()?.length || 0,
        videoTrackIds: remoteStream?.getVideoTracks()?.map(t => t.id) || []
      })
      const copy = new Map(prev)
      copy.set(userId, remoteStream)
      console.log(`[VideoCall] Remote streams map updated. Total: ${copy.size}`)
      return copy
    })
  }

  // Memoize RemoteVideo to prevent re-render on every parent re-render
  const RemoteVideo = memo(({ stream, label }) => {
    const ref = useRef(null)
    const streamAttachedRef = useRef(null) // Track which stream is attached to prevent re-attachment
    const playAttemptedRef = useRef(false) // Track if play() has been attempted
    const initialCheckDoneRef = useRef(false) // Track if initial check has been done
    const [isLive, setIsLive] = useState(false)
    const [shouldShow, setShouldShow] = useState(false) // Stable state to prevent flickering

    // Attach stream ONCE and ensure it plays - only re-attach if stream actually changes
    useEffect(() => {
      if (!ref.current || !stream) {
        console.log(`[VideoCall] Cannot attach stream for ${label}:`, { hasRef: !!ref.current, hasStream: !!stream })
        return
      }
      
      // CRITICAL: Only attach if stream has actually changed
      // This prevents re-attachment on every re-render, which causes flickering
      if (streamAttachedRef.current === stream) {
        // Stream already attached, no need to do anything
        console.log(`[VideoCall] Stream already attached for ${label}, skipping re-attachment`)
        return
      }
      
      const videoTracks = stream.getVideoTracks()
      const audioTracks = stream.getAudioTracks()
      const hasVideoTracks = videoTracks.length > 0
      const hasNonEndedTracks = videoTracks.some(t => t.readyState !== "ended")
      
      console.log(`[VideoCall] Attaching stream for ${label}:`, {
        streamId: stream.id,
        streamActive: stream.active,
        videoTracksCount: videoTracks.length,
        audioTracksCount: audioTracks.length,
        hasVideoTracks,
        hasNonEndedTracks
      })
      
      // Attach stream
      ref.current.srcObject = stream
      streamAttachedRef.current = stream // Mark as attached
      playAttemptedRef.current = false // Reset play attempt flag
      
      // CRITICAL: Ensure audio is enabled and not muted
      ref.current.muted = false
      ref.current.volume = 1.0
      
      // If we have video tracks, play once
      if (hasVideoTracks && hasNonEndedTracks && !playAttemptedRef.current) {
        playAttemptedRef.current = true
        console.log(`[VideoCall] Playing video for ${label} (has tracks)`)
        const playPromise = ref.current.play()
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log(`[VideoCall] Video playing successfully for ${label}`)
              setIsLive(true)
            })
            .catch((err) => {
              console.warn(`[VideoCall] Error playing remote video for ${label}:`, err)
              playAttemptedRef.current = false // Allow retry
            })
        }
      }
    }, [stream, label]) // Only re-run if stream reference actually changes
    
    // Separate effect to handle play() when video is paused but has tracks
    // This runs less frequently to avoid flickering
    useEffect(() => {
      if (!ref.current || !stream || streamAttachedRef.current !== stream) return
      
      const checkAndPlay = () => {
        if (!ref.current || !stream) return
        
        const currentTracks = stream.getVideoTracks()
        const hasTracks = currentTracks.length > 0
        const hasNonEnded = currentTracks.some(t => t.readyState !== "ended")
        
        // Only try to play if video is paused, has tracks, and we haven't attempted recently
        if (hasTracks && hasNonEnded && ref.current.paused && !playAttemptedRef.current) {
          console.log(`[VideoCall] Video paused but has tracks, trying to play for ${label}`)
          playAttemptedRef.current = true
          ref.current.play()
            .then(() => {
              setIsLive(prev => prev ? prev : true)
            })
            .catch((err) => {
              console.warn(`[VideoCall] Error playing video for ${label}:`, err)
              playAttemptedRef.current = false // Allow retry
            })
        }
      }
      
      // Check less frequently to reduce flickering
      const checkInterval = setInterval(checkAndPlay, 3000)
      
      return () => {
        clearInterval(checkInterval)
      }
    }, [stream, label])

    // Track mute/unmute/ended to avoid flicker: show avatar when not live
    useEffect(() => {
      if (!stream) {
        console.log(`[VideoCall] No stream for ${label}, setting isLive=false`)
        setIsLive(false)
        return
      }
      
      // CRITICAL: Get fresh tracks from stream each time this effect runs
      // Stream reference might change, so we need to get current tracks
      const getCurrentTracks = () => {
        if (!stream) return []
        try {
          return stream.getVideoTracks()
        } catch (e) {
          console.error(`[VideoCall] Error getting video tracks for ${label}:`, e)
          return []
        }
      }
      
      const videoTracks = getCurrentTracks()
      // REMOVED: Excessive logging that runs on every render - causes performance issues
      // Only log when tracks actually change
      
      if (videoTracks.length === 0) {
        setIsLive(false)
        return
      }
      
      const update = () => {
        // CRITICAL: Get fresh videoTracks from stream each time - don't use closure
        // Stream tracks can change, so we need to check current state
        const currentStream = stream
        if (!currentStream) {
          console.log(`[VideoCall] No stream for ${label} in update(), setting isLive=false`)
          setIsLive(false)
          return
        }
        
        const currentVideoTracks = getCurrentTracks()
        if (currentVideoTracks.length === 0) {
          console.log(`[VideoCall] No video tracks for ${label} in update(), setting isLive=false`)
          setIsLive(false)
          return
        }
        
        // ULTRA SIMPLIFIED: If we have tracks, show video (don't check anything else)
        // Browser will handle rendering - if track is not ready, it just won't show frames yet
        const hasTracks = currentVideoTracks.length > 0
        const hasNonEndedTracks = currentVideoTracks.some(t => t.readyState !== "ended")
        
        // SIMPLEST LOGIC: Show if has tracks and at least one is not ended
        // Don't require "live" or "active" - browser will handle it
        // This ensures video shows even if track is not "live" yet
        const shouldShow = hasTracks && hasNonEndedTracks
        
        // REMOVED: Excessive logging that runs frequently - causes performance issues
        // Only log when state actually changes (handled in setIsLive below)
        
        // CRITICAL: Only update state if value actually changed to prevent flickering
        // Use functional update to compare with current state
        // Also check if update is really needed - don't update if already correct
        setIsLive(prev => {
          if (prev === shouldShow) {
            // State unchanged, no need to update
            return prev
          }
          // Only log and update if there's an actual change
          console.log(`[VideoCall] Updating isLive for ${label}: ${prev} -> ${shouldShow}`)
          return shouldShow
        })
        
        // DON'T call play() here - it's handled by the separate useEffect
        // Calling play() here causes flickering because update() can be called frequently
      }
      
      // Set up event listeners on current tracks
      // IMPORTANT: We need to set up listeners on the actual tracks in the stream
      // These listeners will fire when track state changes
      videoTracks.forEach((t) => {
        // Remove old listeners first
        t.onmute = null
        t.onunmute = null
        t.onended = null
        
        // Set new listeners - use debounced update to prevent flickering
        t.onmute = () => {
          console.log(`[VideoCall] Track muted for ${label}, trackId: ${t.id}`)
          debouncedUpdate()
        }
        t.onunmute = () => {
          console.log(`[VideoCall] Track unmuted for ${label}, trackId: ${t.id}`)
          debouncedUpdate()
        }
        t.onended = () => {
          console.log(`[VideoCall] Track ended for ${label}, trackId: ${t.id}`)
          debouncedUpdate()
        }
      })
      
      // Also listen to stream's addtrack/removetrack events
      const handleAddTrack = (event) => {
        console.log(`[VideoCall] Track added to stream for ${label}:`, event.track.kind, event.track.id)
        debouncedUpdate()
        // Set up listeners on new track
        if (event.track.kind === "video") {
          event.track.onmute = () => debouncedUpdate()
          event.track.onunmute = () => debouncedUpdate()
          event.track.onended = () => debouncedUpdate()
        }
      }
      
      const handleRemoveTrack = (event) => {
        console.log(`[VideoCall] Track removed from stream for ${label}:`, event.track.kind, event.track.id)
        debouncedUpdate()
      }
      
      stream.addEventListener('addtrack', handleAddTrack)
      stream.addEventListener('removetrack', handleRemoveTrack)
      
      // Debounce update calls to prevent flickering
      let updateTimeout = null
      const debouncedUpdate = () => {
        if (updateTimeout) clearTimeout(updateTimeout)
        updateTimeout = setTimeout(() => {
          update()
        }, 1000) // Increase debounce to 1 second to prevent frequent updates
      }
      
      // CRITICAL: Only run initial check once when stream is first attached
      // Don't run on every re-render to prevent flickering
      // Reset flag when stream changes
      if (streamAttachedRef.current !== stream) {
        initialCheckDoneRef.current = false
      }
      if (!initialCheckDoneRef.current) {
        initialCheckDoneRef.current = true
        // Run initial check only once per stream
        update()
      }
      
      // REMOVED: Periodic interval check - this was causing flickering
      // Event listeners (addtrack, removetrack, onmute, onunmute, onended) are sufficient
      // to detect track changes. No need for periodic polling.
      
      return () => {
        initialCheckDoneRef.current = false // Reset on cleanup
        if (updateTimeout) clearTimeout(updateTimeout)
        stream.removeEventListener('addtrack', handleAddTrack)
        stream.removeEventListener('removetrack', handleRemoveTrack)
        videoTracks.forEach((t) => {
          t.onmute = null
          t.onunmute = null
          t.onended = null
        })
      }
    }, [stream, label])

    // CRITICAL FIX: Don't calculate shouldDisplayVideo from stream in render
    // This causes flickering because stream.getVideoTracks() is called on every render
    // (which happens every second due to elapsed timer in parent component)
    // Instead, only rely on isLive state which is updated by event listeners
    
    // Stabilize shouldShow state - only update based on isLive state
    // Don't check stream directly in render to avoid flickering
    // CRITICAL: Lock shouldShow state to prevent flickering - only update when isLive changes significantly
    const lastIsLiveRef = useRef(isLive)
    const shouldShowLockRef = useRef(false) // Lock to prevent rapid toggling
    const lastShouldShowUpdateRef = useRef(Date.now())
    
    useEffect(() => {
      // Only update if isLive actually changed
      if (lastIsLiveRef.current === isLive) return // No change
      
      // Prevent rapid updates - only allow update if enough time has passed
      const now = Date.now()
      const timeSinceLastUpdate = now - lastShouldShowUpdateRef.current
      if (timeSinceLastUpdate < 2000 && shouldShowLockRef.current) {
        // Too soon since last update, skip this update to prevent flickering
        return
      }
      
      lastIsLiveRef.current = isLive
      
      // Only update shouldShow based on isLive state
      // isLive is updated by event listeners, not on every render
      if (isLive === shouldShow) return // No change needed
      
      if (isLive) {
        // Video is live, show it immediately
        shouldShowLockRef.current = true
        lastShouldShowUpdateRef.current = now
        setShouldShow(true)
        // Unlock after a delay
        setTimeout(() => {
          shouldShowLockRef.current = false
        }, 3000)
      } else {
        // Video is not live, wait longer before hiding to prevent flickering
        shouldShowLockRef.current = true
        const timeout = setTimeout(() => {
          // Double check isLive is still false before hiding
          if (lastIsLiveRef.current === false) {
            lastShouldShowUpdateRef.current = Date.now()
            setShouldShow(false)
            // Unlock after a delay
            setTimeout(() => {
              shouldShowLockRef.current = false
            }, 3000)
          }
        }, 3000) // Wait 3 seconds before hiding to prevent flickering
        return () => clearTimeout(timeout)
      }
    }, [isLive, shouldShow])
    
    // Fallback: If stream exists and has tracks, ensure isLive is set
    // This handles the case where isLive state might not be updated yet
    // CRITICAL: Only check once when stream is first attached, not on every isLive change
    useEffect(() => {
      if (!stream) return
      
      // Only check if isLive is currently false - if it's already true, don't check again
      if (isLive) return // Already live, no need to check
      
      const videoTracks = stream.getVideoTracks()
      const hasTracks = videoTracks.length > 0
      const hasNonEndedTracks = videoTracks.some(t => t.readyState !== "ended")
      
      // If we have tracks but isLive is false, set it to true
      // This is a one-time check when stream is first attached
      if (hasTracks && hasNonEndedTracks) {
        setIsLive(true)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stream]) // Only run when stream reference changes, NOT when isLive changes (intentional)
    
    // CRITICAL: Use ref to update video style directly, not through React state
    // This prevents re-render flickering when shouldShow changes
    const videoStyleRef = useRef({ 
      visibility: "hidden",
      opacity: 0,
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      transition: "none"
    })
    
    // Update video style directly via ref, not through React render
    useEffect(() => {
      if (!ref.current) return
      
      const newVisibility = shouldShow ? "visible" : "hidden"
      const newOpacity = shouldShow ? 1 : 0
      
      // Only update if actually changed to prevent flickering
      if (videoStyleRef.current.visibility !== newVisibility || videoStyleRef.current.opacity !== newOpacity) {
        videoStyleRef.current.visibility = newVisibility
        videoStyleRef.current.opacity = newOpacity
        ref.current.style.visibility = newVisibility
        ref.current.style.opacity = newOpacity
      }
    }, [shouldShow])
    
    // Reduced logging to prevent console spam on every render
    // Only log when state actually changes
    if (shouldShow !== isLive) {
      console.log(`[VideoCall] Rendering RemoteVideo for ${label}:`, {
        shouldShow,
        isLive,
        streamId: stream?.id,
        hasStream: !!stream
      })
    }
    
    return (
      <div className="remote-video-wrapper">
        <video 
          ref={ref} 
          autoPlay 
          playsInline 
          className="remote-video" 
          style={videoStyleRef.current}
        />
        {!shouldShow && (
          <div className="vc-placeholder" style={{ position: "absolute", inset: 0, zIndex: 0 }}>
            <div className="vc-avatar">{(label || "U").charAt(0).toUpperCase()}</div>
          </div>
        )}
        <div className="video-label">{label}</div>
      </div>
    )
  }, (prevProps, nextProps) => {
    // Only re-render if stream reference or label actually changes
    // This prevents re-render on every parent component re-render (e.g., from timer)
    return prevProps.stream === nextProps.stream && prevProps.label === nextProps.label
  })

  return (
    <div className="video-call-container">
      {/* Top toolbar */}
      <div className="vc-topbar">
        <div className="vc-left">
          <span className="vc-title">Meeting</span>
          <span className="vc-timer">{elapsed}</span>
        </div>
        <div className="vc-actions">
          <button title="Chat" className="vc-top-btn" onClick={() => document.querySelector('.tab-btn:nth-child(2)')?.click()}>💬<span>Chat</span></button>
          <button title="People" className={`vc-top-btn ${showPeoplePanel ? 'active' : ''}`} onClick={() => setShowPeoplePanel(!showPeoplePanel)}>👤<span>People</span></button>
          <button title="Camera" className={`vc-top-btn ${!isVideoEnabled ? 'muted' : ''}`} onClick={toggleVideo}>📷<span>Camera</span></button>
          <button title="Mic" className={`vc-top-btn ${!isAudioEnabled ? 'muted' : ''}`} onClick={toggleAudio}>🎙️<span>Mic</span></button>
          <button title="Share" className={`vc-top-btn ${isScreenSharing ? 'active' : ''}`} onClick={toggleScreenShare}>🖥️<span>Share</span></button>
          <button title="Leave" className="vc-top-btn leave" onClick={() => window.history.back()}>⛔<span>Leave</span></button>
        </div>
      <div className="vc-actions" style={{ marginLeft: 8, alignItems: 'center', gap: 6 }}>
        <label style={{ color: 'var(--text-light)', fontSize: 12 }}>Mic gain</label>
        <input
          type="range"
          min="0.5"
          max="3"
          step="0.1"
          value={micGain}
          onChange={(e) => {
            const val = parseFloat(e.target.value)
            setMicGain(val)
            try { if (micGainRef.current) micGainRef.current.gain.value = val } catch {}
          }}
          style={{ width: 120 }}
        />
        <span style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 12 }}>{micGain.toFixed(1)}x</span>
      </div>
      </div>

      {/* Remote videos */}
      <div className="remote-videos">
        {useMemo(() => {
          return Array.from(remoteStreams.entries()).map(([userId, stream]) => {
            const participant = participants.find((p) => p.userId === userId)
            // REMOVED: Don't call stream.getVideoTracks() in render - this causes flickering
            // The RemoteVideo component will handle stream internally
            return <RemoteVideo key={userId} stream={stream} label={participant?.userName || "User"} />
          })
        }, [remoteStreams, participants])}
      </div>
      
      {/* Debug info */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{ position: 'fixed', bottom: 10, right: 10, background: 'rgba(0,0,0,0.8)', color: 'white', padding: '10px', fontSize: '12px', zIndex: 9999 }}>
          <div>Remote streams: {remoteStreams.size}</div>
          <div>Peer connections: {peerConnectionsRef.current.size}</div>
          <div>Local stream: {localStream ? 'Ready' : 'Not ready'}</div>
          <div>Participants: {participants.length}</div>
        </div>
      )}

      {/* If no remote, show placeholder avatar */}
      {remoteStreams.size === 0 && (
        <div className="vc-placeholder">
          <div className="vc-avatar">{(user?.fullName || user?.email || "U").charAt(0).toUpperCase()}</div>
          <div className="vc-invite">Invite people to join you</div>
        </div>
      )}

      {/* Local video */}
      <div className="local-video-wrapper">
        <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
        <div className="video-label">Bạn {isVideoEnabled ? "" : "(Camera tắt)"}</div>
      </div>

      {/* Side people panel */}
      {showPeoplePanel && (
        <div className="vc-people-panel">
          <div className="vc-panel-header">Participants ({participants.length})</div>
          <div className="vc-people-list">
            {participants.map((p) => (
              <div key={p.userId} className="vc-person">
                <div className="vc-person-avatar">{p.userName.charAt(0).toUpperCase()}</div>
                <div className="vc-person-name">{p.userName}{p.userId === user?.id ? " (You)" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
