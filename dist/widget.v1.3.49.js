"use strict";
(() => {
  // src/voice-saas-app/public/widget.src.js
  (function() {
    const scriptTag = document.currentScript;
    const version = "1.3.49";
    const config = {
      agentId: scriptTag.getAttribute("data-agent-id"),
      jwtEndpoint: scriptTag.getAttribute("data-jwt-endpoint"),
      tokenUrl: scriptTag.getAttribute("data-token-endpoint"),
      name: scriptTag.getAttribute("data-name") || "Assistant",
      themeColor: scriptTag.getAttribute("data-theme-color") || "#0077ff",
      position: scriptTag.getAttribute("data-position") || "bottom-right"
    };
    const log = (message) => {
      if (window.DEBUG_WIDGET) {
        console.log(`[VoiceSaaS Widget] ${message}`);
      }
    };
    function scrollToBottom(container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
    log(`Widget loaded (version ${version})`);
    function loadExternalCSS() {
      if (window.__vsStylesInjected)
        return;
      window.__vsStylesInjected = true;
      const cdnBase = new URL(scriptTag.src).origin;
      const link = document.createElement("link");
      link.id = "vs-widget-css";
      link.rel = "stylesheet";
      link.href = scriptTag.src.replace(/\.js$/, ".css");
      document.head.appendChild(link);
      return link;
    }
    function injectThemeStyles() {
      const themeStyle = document.createElement("style");
      themeStyle.textContent = `
      .voice-saas-widget-button {
        background: ${config.themeColor};
      }
      .voice-saas-widget-header {
        background: ${config.themeColor};
      }
      .voice-saas-widget-message.user {
        background: ${config.themeColor};
      }
      .voice-saas-widget-retry-button {
        background: ${config.themeColor};
      }
    `;
      document.head.appendChild(themeStyle);
    }
    function addMessage(elements, text, isUser = false) {
      const message = document.createElement("div");
      message.className = `voice-saas-widget-message ${isUser ? "user" : "assistant"}`;
      message.textContent = text;
      elements.messagesContainer.appendChild(message);
      scrollToBottom(elements.messagesContainer);
      return message;
    }
    function attachAssistantAudio(elements, audioContext, track) {
      if (track.kind !== "audio")
        return;
      log("Received audio track from assistant");
      const audioEl = track.attach();
      audioEl.autoplay = true;
      audioEl.volume = 1;
      audioEl.style.display = "none";
      elements.audioContainer.appendChild(audioEl);
      if (audioContext && audioContext.state === "running") {
        const mediaStreamSource = audioContext.createMediaStreamSource(
          new MediaStream([track.mediaStreamTrack])
        );
        mediaStreamSource.connect(audioContext.destination);
      }
    }
    function showThinking(elements) {
      const thinking = document.createElement("div");
      thinking.className = "voice-saas-widget-thinking";
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement("span");
        thinking.appendChild(dot);
      }
      elements.messagesContainer.appendChild(thinking);
      scrollToBottom(elements.messagesContainer);
      return thinking;
    }
    function buildWidgetUI() {
      const panel = document.createElement("div");
      panel.className = "voice-saas-widget-dialog";
      panel.id = "vs-chat";
      Object.assign(panel.style, {
        position: "fixed",
        right: "24px",
        bottom: "80px",
        width: "380px",
        height: "600px",
        borderRadius: "12px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        background: "#ffffff",
        display: "none",
        zIndex: "9999",
        overflow: "hidden",
        flexDirection: "column"
      });
      panel.innerHTML = "";
      const header = document.createElement("div");
      header.className = "voice-saas-widget-header";
      Object.assign(header.style, {
        background: config.themeColor,
        color: "#ffffff",
        padding: "12px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      });
      const headerTitle = document.createElement("div");
      headerTitle.textContent = config.name;
      headerTitle.style.fontWeight = "bold";
      const closeButton = document.createElement("button");
      closeButton.innerHTML = "\u2715";
      closeButton.className = "voice-saas-widget-close-button";
      Object.assign(closeButton.style, {
        background: "transparent",
        border: "none",
        color: "#ffffff",
        cursor: "pointer",
        fontSize: "16px"
      });
      header.appendChild(headerTitle);
      header.appendChild(closeButton);
      panel.appendChild(header);
      const chatContent = document.createElement("div");
      chatContent.className = "voice-saas-widget-content";
      Object.assign(chatContent.style, {
        flex: "1",
        padding: "16px",
        overflowY: "auto",
        height: "calc(100% - 100px)"
      });
      const messagesContainer = document.createElement("div");
      messagesContainer.className = "voice-saas-widget-messages";
      chatContent.appendChild(messagesContainer);
      panel.appendChild(chatContent);
      const footer = document.createElement("div");
      footer.className = "voice-saas-widget-footer";
      Object.assign(footer.style, {
        borderTop: "1px solid #eee",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center"
      });
      const statusIndicator = document.createElement("div");
      statusIndicator.className = "voice-saas-widget-status";
      statusIndicator.textContent = "Click microphone to speak";
      statusIndicator.style.fontSize = "14px";
      statusIndicator.style.color = "#666";
      footer.appendChild(statusIndicator);
      panel.appendChild(footer);
      const audioContainer = document.createElement("div");
      audioContainer.id = "voice-saas-widget-audio-container";
      audioContainer.style.display = "none";
      panel.appendChild(audioContainer);
      document.body.appendChild(panel);
      return {
        panel,
        elements: {
          messagesContainer,
          closeButton,
          statusIndicator,
          audioContainer
        }
      };
    }
    async function initWidget() {
      const messageBuffer = [];
      const micButton = document.createElement("button");
      micButton.className = "voice-saas-widget-button";
      micButton.innerHTML = "\u{1F399}\uFE0F";
      Object.assign(micButton.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        width: "60px",
        height: "60px",
        borderRadius: "50%",
        background: config.themeColor,
        color: "#ffffff",
        border: "none",
        boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "24px",
        zIndex: "9998"
      });
      document.body.appendChild(micButton);
      const { panel, elements } = buildWidgetUI();
      log("Widget UI created");
      let livekitRoom = null;
      let isConnected = false;
      let isMicActive = false;
      let micTrack = null;
      let audioContext = null;
      elements.closeButton.addEventListener("click", () => {
        panel.style.display = "none";
        disconnectFromLiveKit();
        messageBuffer.length = 0;
        elements.messagesContainer.innerHTML = "";
      });
      async function disconnectFromLiveKit() {
        if (micTrack) {
          log("Stopping microphone track");
          micTrack.stop();
          micTrack = null;
        }
        const unmuteBtn = panel.querySelector(".unmute-button");
        if (unmuteBtn)
          unmuteBtn.remove();
        if (livekitRoom) {
          log("Disconnecting from LiveKit");
          await livekitRoom.disconnect();
          livekitRoom = null;
          isConnected = false;
          isMicActive = false;
        }
        if (audioContext && audioContext.state !== "closed") {
          try {
            await audioContext.close();
            log("AudioContext closed");
          } catch (err) {
            console.warn("Error closing AudioContext:", err);
          }
          audioContext = null;
        }
        if (elements.audioContainer) {
          elements.audioContainer.innerHTML = "";
        }
        messageBuffer.length = 0;
        elements.messagesContainer.innerHTML = "";
        elements.statusIndicator.textContent = "Click microphone to speak";
      }
      micButton.addEventListener("click", async () => {
        if (panel.style.display === "none") {
          panel.style.display = "flex";
          if (!isConnected) {
            try {
              elements.statusIndicator.textContent = "Requesting microphone access...";
              if (!window.LivekitClient && !window.livekit && !window.__loadingLiveKit) {
                window.__loadingLiveKit = true;
                log("Loading LiveKit client library");
                try {
                  await new Promise((resolve, reject) => {
                    if (document.querySelector('script[src*="livekit-client"]')) {
                      log("LiveKit script already exists, waiting for it to load");
                      return resolve();
                    }
                    const script = document.createElement("script");
                    script.src = "https://cdn.jsdelivr.net/npm/livekit-client@2.11.0/dist/livekit-client.umd.min.js";
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                  });
                  log("LiveKit client library loaded successfully");
                } catch (err) {
                  window.__loadingLiveKit = false;
                  throw new Error(`Failed to load LiveKit: ${err.message}`);
                }
              } else if (window.__loadingLiveKit) {
                log("Waiting for LiveKit to finish loading");
                while (window.__loadingLiveKit && !window.LivekitClient && !window.livekit) {
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }
              }
              const LiveKit = window.LivekitClient || window.livekit;
              if (!LiveKit) {
                throw new Error("Failed to load LiveKit client");
              }
              micTrack = await LiveKit.createLocalAudioTrack({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              });
              log("Microphone access granted");
              elements.statusIndicator.textContent = "Setting up audio...";
              audioContext = new (window.AudioContext || window.webkitAudioContext)();
              try {
                await audioContext.resume();
                log("AudioContext resumed successfully");
              } catch (err) {
                console.warn("AudioContext.resume() failed:", err);
                log(`AudioContext resume error: ${err.message}`);
              }
              try {
                const buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
                const source = audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContext.destination);
                source.start();
                log("Silent buffer played to unlock audio");
              } catch (err) {
                console.warn("Silent buffer playback failed:", err);
                log(`Silent buffer error: ${err.message}`);
              }
              elements.statusIndicator.textContent = "Connecting...";
              const widgetJwtResponse = await fetch(config.jwtEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ agentId: config.agentId }),
                credentials: "include"
              });
              if (!widgetJwtResponse.ok) {
                throw new Error("Failed to get widget authentication");
              }
              const { jwt: widgetJwt } = await widgetJwtResponse.json();
              const timestamp = Date.now();
              const roomName = `agent-${config.agentId}-${timestamp}`;
              log(`Generated room name: ${roomName}`);
              const tokenResponse = await fetch(config.tokenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  agentId: config.agentId,
                  roomName,
                  jwtFromWidget: widgetJwt
                }),
                credentials: "include"
              });
              if (!tokenResponse.ok) {
                throw new Error("Failed to get connection token");
              }
              const { token, url } = await tokenResponse.json();
              livekitRoom = new LiveKit.Room({
                adaptiveStream: true,
                dynacast: true,
                // Removed invalid 'audioPreferHighQuality' option
                // Using correct lowercase 'webaudio' option (not WebAudio)
                webaudio: {
                  audioContext
                }
              });
              await livekitRoom.connect(url, token);
              livekitRoom.on("trackSubscribed", (track) => {
                attachAssistantAudio(elements, audioContext, track);
              });
              livekitRoom.remoteParticipants.forEach((participant) => {
                participant.trackPublications.forEach((publication) => {
                  if (publication.isSubscribed && publication.track) {
                    attachAssistantAudio(elements, audioContext, publication.track);
                  }
                });
                participant.on("trackSubscribed", (track) => {
                  attachAssistantAudio(elements, audioContext, track);
                });
              });
              log(`Found ${livekitRoom.remoteParticipants.size} participants already in the room`);
              log("Connected to LiveKit room using v2 API");
              try {
                await livekitRoom.startAudio();
                log("Room audio started successfully");
              } catch (err) {
                console.warn("room.startAudio() failed:", err);
                log(`Room audio start error: ${err.message}`);
                const unmuteBtn = document.createElement("button");
                unmuteBtn.textContent = "\u{1F50A} Tap to unmute";
                unmuteBtn.className = "unmute-button";
                Object.assign(unmuteBtn.style, {
                  position: "absolute",
                  bottom: "8px",
                  right: "8px",
                  zIndex: "999",
                  padding: "8px 12px",
                  background: "#0077ff",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                });
                unmuteBtn.onclick = async () => {
                  try {
                    await livekitRoom.startAudio();
                    unmuteBtn.remove();
                  } catch (e) {
                    console.error("Failed to start audio:", e);
                  }
                };
                panel.appendChild(unmuteBtn);
              }
              isConnected = true;
              log("Connected to LiveKit room");
              if (micTrack) {
                await livekitRoom.localParticipant.publishTrack(micTrack);
                isMicActive = true;
                elements.statusIndicator.textContent = "Listening...";
                log("Microphone track published");
              } else {
                log("Warning: No microphone track available to publish");
                elements.statusIndicator.textContent = "Microphone unavailable";
              }
              livekitRoom.on("participantConnected", (participant) => {
                log(`${participant.identity} connected`);
              });
              livekitRoom.on("dataReceived", (payload, participant, kind, topic) => {
                if (topic !== "conversation")
                  return;
                let msg;
                try {
                  msg = JSON.parse(new TextDecoder().decode(payload));
                } catch (e) {
                  console.error("[Widget] Ung\xFCltiges JSON im Datenkanal:", e);
                  return;
                }
                messageBuffer.push(msg);
                messageBuffer.sort((a, b) => a.timestamp - b.timestamp);
                elements.messagesContainer.innerHTML = "";
                messageBuffer.forEach((m) => {
                  addMessage(elements, m.text, m.role === "user");
                });
                if (msg.role === "user") {
                  showThinking(elements);
                  elements.statusIndicator.textContent = "Assistant is thinking...";
                } else if (msg.role === "assistant" || msg.role === "system") {
                  const thinking = document.querySelector(".voice-saas-widget-thinking");
                  if (thinking) {
                    thinking.remove();
                  }
                  elements.statusIndicator.textContent = "Listening...";
                }
              });
            } catch (error) {
              log(`Error: ${error.message}`);
              if (error.name === "NotAllowedError") {
                elements.statusIndicator.textContent = "Microphone access denied";
                const retryBtn = document.createElement("button");
                retryBtn.textContent = "\u{1F399}\uFE0F Allow microphone access";
                retryBtn.className = "voice-saas-widget-retry-button";
                Object.assign(retryBtn.style, {
                  margin: "10px auto",
                  display: "block",
                  padding: "8px 16px",
                  background: config.themeColor,
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                });
                const existingRetry = panel.querySelector(".voice-saas-widget-retry-button");
                if (existingRetry)
                  existingRetry.remove();
                elements.messagesContainer.appendChild(retryBtn);
                retryBtn.addEventListener("click", async () => {
                  retryBtn.remove();
                  if (navigator.permissions && navigator.permissions.query) {
                    try {
                      const permissionStatus = await navigator.permissions.query({ name: "microphone" });
                      log(`Microphone permission status: ${permissionStatus.state}`);
                      if (permissionStatus.state === "denied") {
                        addMessage(elements, "Please enable microphone access in your browser settings and refresh the page.", false);
                        return;
                      }
                    } catch (e) {
                      log(`Error checking permissions: ${e.message}`);
                    }
                  }
                  panel.style.display = "none";
                  setTimeout(() => micButton.click(), 500);
                });
              } else if (error.message.includes("WebSocket")) {
                elements.statusIndicator.textContent = "Network error";
              } else {
                elements.statusIndicator.textContent = "Connection failed";
              }
            }
          }
        } else if (isConnected) {
          if (isMicActive) {
            if (livekitRoom) {
              livekitRoom.localParticipant.unpublishAllTracks();
              if (micTrack) {
                micTrack.stop();
                micTrack = null;
              }
              isMicActive = false;
              elements.statusIndicator.textContent = "Microphone off";
              micButton.style.background = "#999";
            }
          } else {
            try {
              elements.statusIndicator.textContent = "Requesting microphone access...";
              const LiveKit = window.LivekitClient || window.livekit;
              micTrack = await LiveKit.createLocalAudioTrack({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              });
              await livekitRoom.localParticipant.publishTrack(micTrack);
              isMicActive = true;
              elements.statusIndicator.textContent = "Listening...";
              micButton.style.background = config.themeColor;
            } catch (micError) {
              log(`Microphone reactivation error: ${micError.message}`);
              if (micError.name === "NotAllowedError") {
                elements.statusIndicator.textContent = "Microphone access denied";
              } else if (micError.message.includes("WebSocket")) {
                elements.statusIndicator.textContent = "Network error";
              } else {
                elements.statusIndicator.textContent = "Could not access microphone";
              }
            }
          }
        }
      });
      document.addEventListener("click", function audioUnlock() {
        if (audioContext && audioContext.state === "suspended") {
          audioContext.resume().then(() => log("AudioContext resumed by user interaction")).catch((e) => console.warn("AudioContext resume error:", e));
        }
        if (livekitRoom) {
          livekitRoom.startAudio().then(() => log("LiveKit audio started by user interaction")).catch((e) => console.warn("LiveKit startAudio error:", e));
        }
        document.removeEventListener("click", audioUnlock);
      }, { once: true });
      window.addEventListener("beforeunload", () => {
        if (micTrack) {
          micTrack.stop();
          micTrack = null;
        }
        if (livekitRoom) {
          livekitRoom.disconnect();
        }
        if (audioContext && audioContext.state !== "closed") {
          audioContext.close().catch(() => {
          });
        }
        if (elements.audioContainer) {
          elements.audioContainer.innerHTML = "";
        }
      });
    }
    function init() {
      loadExternalCSS();
      injectThemeStyles();
      initWidget();
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
    window.VoiceSaasWidget = {
      version,
      createWidget: function(customConfig) {
        Object.assign(config, customConfig);
        loadExternalCSS();
        injectThemeStyles();
        return initWidget();
      }
    };
  })();
})();
