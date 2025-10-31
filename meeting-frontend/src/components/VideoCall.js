import { useEffect, useRef, useState } from "react"

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
      console.log("Received offer from:", fromUserId)

      const pc = await getOrCreatePeerConnection(fromUserId)
      try {
        const offerDesc = new RTCSessionDescription(offer)

        const isStabilized = pc.signalingState === "stable"
        if (!isStabilized) {
          // Glare: rollback local description before applying remote offer
          try {
            await pc.setLocalDescription({ type: "rollback" })
          } catch {}
        }

        await pc.setRemoteDescription(offerDesc)

        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        socket.emit("webrtc-answer", {
          roomId,
          targetUserId: fromUserId,
          answer: pc.localDescription,
        })
      } catch (err) {
        console.error("Error handling offer:", err)
      }
    }

    // WebRTC Answer received
    const handleAnswer = async (data) => {
      const { fromUserId, answer } = data
      console.log("Received answer from:", fromUserId)

      const pc = peerConnectionsRef.current.get(fromUserId)
      if (pc) {
        try {
          const answerDesc = new RTCSessionDescription(answer)
          await pc.setRemoteDescription(answerDesc)
        } catch (err) {
          console.error("Error setting remote answer:", err)
        }
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
      // Prefer processed mic track if available
      const audioTracks = micProcessedStreamRef.current?.getAudioTracks?.()
      const processedMicTrack = audioTracks && audioTracks[0] ? audioTracks[0] : localStream.getAudioTracks()[0]

      localStream.getVideoTracks().forEach((track) => {
        if (pc.signalingState === "closed") return
        let sender
        try { sender = pc.addTrack(track, localStream) } catch { return }
        try {
          const params = sender.getParameters()
          params.degradationPreference = "maintain-framerate"
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{ maxBitrate: 600000 }]
          }
          sender.setParameters(params)
        } catch {}
      })
      if (processedMicTrack) {
        try {
          if (pc.signalingState !== "closed") pc.addTrack(processedMicTrack, micProcessedStreamRef.current || localStream)
        } catch {}
      }
    }

    // Avoid relying on onnegotiationneeded to prevent renegotiation loops causing flicker

    // Handle remote stream
    pc.ontrack = (event) => {
      const track = event.track
      const [remoteStream] = event.streams
      // Chỉ gán stream khi track đã unmute để tránh chớp tắt do track mute/unmute trong quá trình negotiate
      track.onunmute = () => {
        console.log("Remote track unmuted from:", userId)
        setRemoteStreamForUser(userId, remoteStream)
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
    }

    peerConnectionsRef.current.set(userId, pc)
    return pc
  }

  // Create and send offer to user
  const createOfferForUser = async (userId) => {
    try {
      const pc = await getOrCreatePeerConnection(userId)
      // Deterministic initiator to avoid glare: only the lexicographically smaller userId makes offers
      if ((user?.id || "") > userId) {
        return
      }
      if (pc.signalingState !== "stable") return
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      if (socketRef.current) {
        socketRef.current.emit("webrtc-offer", {
          roomId,
          targetUserId: userId,
          offer: pc.localDescription,
        })
      }
    } catch (error) {
      console.error("Error creating offer:", error)
    }
  }

  // When local stream becomes available later, add tracks to existing PCs and renegotiate
  useEffect(() => {
    if (!localStream) return
    peerConnectionsRef.current.forEach((pc, remoteUserId) => {
      if (pc.signalingState === "closed") {
        try { peerConnectionsRef.current.delete(remoteUserId) } catch {}
        return
      }
      const sendersKinds = pc.getSenders().map((s) => s.track?.kind)
      localStream.getTracks().forEach((track) => {
        if (!sendersKinds.includes(track.kind)) {
          try { if (pc.signalingState !== "closed") pc.addTrack(track, localStream) } catch {}
        }
      })
      // fire negotiation for initiator
      if ((user?.id || "") < (remoteUserId || "")) {
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
    if (!participants) return
    const currentIds = new Set(participants.map((p) => p.userId))

    // Close PCs for users who left
    ;[...peerConnectionsRef.current.keys()].forEach((uid) => {
      if (!currentIds.has(uid)) {
        removePeerConnection(uid)
      }
    })

    // Create PCs and offer only for new users
    participants.forEach((p) => {
      if (p.userId === user?.id) return
      if (!peerConnectionsRef.current.has(p.userId)) {
        getOrCreatePeerConnection(p.userId).then(() => {
          createOfferForUser(p.userId)
        })
      }
    })
  }, [participants, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent state churn from frequent track events by batching remote streams update
  const setRemoteStreamForUser = (userId, remoteStream) => {
    setRemoteStreams((prev) => {
      const existing = prev.get(userId)
      if (existing === remoteStream) return prev
      const copy = new Map(prev)
      copy.set(userId, remoteStream)
      return copy
    })
  }

  const RemoteVideo = ({ stream, label }) => {
    const ref = useRef(null)
    const [isLive, setIsLive] = useState(false)

    // Attach stream once
    useEffect(() => {
      if (ref.current && stream && ref.current.srcObject !== stream) {
        ref.current.srcObject = stream
      }
    }, [stream])

    // Track mute/unmute/ended to avoid flicker: show avatar when not live
    useEffect(() => {
      if (!stream) return
      const videoTracks = stream.getVideoTracks()
      const update = () => {
        const live = videoTracks.some((t) => t.readyState === "live" && !t.muted && t.enabled)
        setIsLive(live)
        if (ref.current) {
          if (live) {
            ref.current.play().catch(() => {})
          } else {
            try { ref.current.pause() } catch {}
          }
        }
      }
      videoTracks.forEach((t) => {
        t.onmute = update
        t.onunmute = update
        t.onended = update
      })
      update()
      return () => {
        videoTracks.forEach((t) => {
          t.onmute = null
          t.onunmute = null
          t.onended = null
        })
      }
    }, [stream])

    return (
      <div className="remote-video-wrapper">
        <video ref={ref} autoPlay playsInline className="remote-video" style={{ visibility: isLive ? "visible" : "hidden" }} />
        {!isLive && (
          <div className="vc-placeholder" style={{ position: "absolute", inset: 0 }}>
            <div className="vc-avatar">{(label || "U").charAt(0).toUpperCase()}</div>
          </div>
        )}
        <div className="video-label">{label}</div>
      </div>
    )
  }

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
        {Array.from(remoteStreams.entries()).map(([userId, stream]) => {
          const participant = participants.find((p) => p.userId === userId)
          return <RemoteVideo key={userId} stream={stream} label={participant?.userName || "User"} />
        })}
      </div>

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
