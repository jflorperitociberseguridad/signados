/**
 * useWebRTC — minimal 1-to-1 WebRTC peer connection over a JSON WebSocket
 * signaling channel. Polite/impolite "perfect negotiation" pattern.
 *
 * Usage:
 *   const rtc = useWebRTC({ room, role });
 *   rtc.start({ video: true, audio: true })  // attaches local stream
 *   <video ref={rtc.localVideoRef} muted playsInline autoPlay />
 *   <video ref={rtc.remoteVideoRef} playsInline autoPlay />
 *   rtc.sendData({ type: "subtitle", data: { text: "Hola" } })
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getIceServers } from "../lib/api";

const WS_BASE = (() => {
  const url = process.env.REACT_APP_BACKEND_URL || "";
  // https://x.preview.emergentagent.com -> wss://x.preview.emergentagent.com
  return url.replace(/^http/, "ws");
})();

export function useWebRTC({ room, role = "signer" }) {
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const handlersRef = useRef({}); // { type: cb }
  const politeRef = useRef(role !== "signer"); // listener is polite
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);

  const [status, setStatus] = useState("idle"); // idle | connecting | waiting | live | ended | error
  const [peers, setPeers] = useState(0);
  const [error, setError] = useState("");

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const sendData = useCallback(
    (msg) => {
      send(msg);
    },
    [send],
  );

  const on = useCallback((type, cb) => {
    handlersRef.current[type] = cb;
    return () => {
      if (handlersRef.current[type] === cb) delete handlersRef.current[type];
    };
  }, []);

  const cleanup = useCallback(() => {
    try {
      if (pcRef.current) {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onnegotiationneeded = null;
        pcRef.current.close();
        pcRef.current = null;
      }
    } catch {}
    try {
      if (wsRef.current) {
        try {
          wsRef.current.send(JSON.stringify({ type: "leave" }));
        } catch {}
        wsRef.current.close();
        wsRef.current = null;
      }
    } catch {}
    try {
      localStreamRef.current?.getTracks()?.forEach((t) => t.stop());
      localStreamRef.current = null;
    } catch {}
  }, []);

  const ensurePc = useCallback(async (iceServers) => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "ice", data: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current && e.streams && e.streams[0]) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") setStatus("live");
      else if (st === "failed" || st === "disconnected") setStatus("ended");
    };
    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        send({ type: "offer", data: pc.localDescription });
      } catch (e) {
        // ignore
      } finally {
        makingOfferRef.current = false;
      }
    };

    return pc;
  }, [send]);

  const start = useCallback(
    async ({ video = true, audio = true } = {}) => {
      if (!room) return;
      setStatus("connecting");
      setError("");
      let iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];
      try {
        const ice = await getIceServers();
        if (ice?.iceServers?.length) iceServers = ice.iceServers;
      } catch {}

      // Local media
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
          audio,
        });
      } catch (e) {
        setError("No se pudo acceder a la cámara/micrófono");
        setStatus("error");
        return;
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = await ensurePc(iceServers);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // WebSocket signaling
      const wsUrl = `${WS_BASE}/api/rtc/${encodeURIComponent(room)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        send({ type: "join", data: { role } });
        setStatus("waiting");
      };
      ws.onerror = () => {
        setError("Error de conexión con el servidor de señalización");
        setStatus("error");
      };
      ws.onclose = () => {
        setStatus((s) => (s === "live" ? "ended" : s));
      };
      ws.onmessage = async (evt) => {
        let msg;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }
        const t = msg.type;
        const data = msg.data || {};

        if (t === "joined" || t === "peer-joined" || t === "peer-left") {
          setPeers(data.peers || 0);
          if (t === "peer-joined" && !politeRef.current) {
            // Impolite peer (signer) initiates the offer when listener joins
            try {
              makingOfferRef.current = true;
              await pc.setLocalDescription();
              send({ type: "offer", data: pc.localDescription });
            } catch {}
            finally {
              makingOfferRef.current = false;
            }
          }
          handlersRef.current[t]?.(data);
          return;
        }

        if (t === "offer") {
          const desc = data;
          const offerCollision =
            makingOfferRef.current || pc.signalingState !== "stable";
          ignoreOfferRef.current = !politeRef.current && offerCollision;
          if (ignoreOfferRef.current) return;
          if (offerCollision) {
            await Promise.all([
              pc.setLocalDescription({ type: "rollback" }).catch(() => {}),
              pc.setRemoteDescription(desc),
            ]);
          } else {
            await pc.setRemoteDescription(desc);
          }
          await pc.setLocalDescription();
          send({ type: "answer", data: pc.localDescription });
          return;
        }

        if (t === "answer") {
          try {
            await pc.setRemoteDescription(data);
          } catch {}
          return;
        }

        if (t === "ice") {
          try {
            await pc.addIceCandidate(data);
          } catch (e) {
            if (!ignoreOfferRef.current) {
              // log but don't crash
            }
          }
          return;
        }

        // Custom payloads: subtitle, translation, chat
        handlersRef.current[t]?.(data);
      };
    },
    [room, role, ensurePc, send],
  );

  const stop = useCallback(() => {
    cleanup();
    setStatus("ended");
  }, [cleanup]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    status,
    peers,
    error,
    localVideoRef,
    remoteVideoRef,
    start,
    stop,
    sendData,
    on,
  };
}
