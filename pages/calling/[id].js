import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { io } from "socket.io-client";
import useSocket from "../../hooks/useSocket";
import { Tooltip as ReactTooltip } from "react-tooltip";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
};
function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      c ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16)
  );
}

const Calling = () => {
  useSocket();
  const router = useRouter();
  const socketRef = useRef();
  const userStreamRef = useRef();
  const hostRef = useRef(false);
  const userVideoRef = useRef();
  const peerVideoRef = useRef();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [roomName, setRoomName] = useState(router.query.id);
  const [micActive, setMicActive] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const rtcConnectionRef = useRef(null);
  const chatWindowRef = useRef();
  const chatInputRef = useRef();
  const [skippedSessions, setSkippedSessions] = useState([]);
  const [waitingRooms, setWaitingRooms] = useState([]);
  const [firstLoad, setFirstLoad] = useState(true);
  const [sessionUsers, setSessionUsers] = useState([]);
  const [microphoneAccess, setMicrophoneAccess] = useState();
  const [connectionStatus, setConnectionStatus] = useState("Searching...");

  useEffect(() => {
    setRoomName(router.query.id);
  }, [router.query]);

  useEffect(() => {
    requestMicrophonePermission();
  }, []);

  useEffect(() => {
    socketRef.current = io(process.env.NEXT_PUBLIC_LIVE_URL, {
      transports: ["websocket"],
      upgrade: false,
    });
  }, [roomName]);

  useEffect(() => {
    if (!roomName && firstLoad) {
      setFirstLoad(false);
      console.log("exiting due to first load");
      return;
    }
    var roomToJoin = roomName;

    if (!roomName) {
      var isThereARoomToJoin = false;
      var checked = new Set();
      // console.log({ skippedSessions, waitingRooms });
      while (isThereARoomToJoin == false && waitingRooms.length > 0) {
        // console.log("while useEffect");
        roomToJoin =
          waitingRooms[Math.floor(Math.random() * (waitingRooms.length - 1))];
        checked.add(roomToJoin);
        if (
          !skippedSessions.includes(roomToJoin) ||
          checked.size == waitingRooms.length
        )
          isThereARoomToJoin = true;
      }
      console.log({ roomToJoin });
    }

    // console.log("I am in useEffect", roomToJoin);
    socketRef.current.on("getWaitingRooms", (rooms) => {
      console.log({ rooms }, "room1234");
      setWaitingRooms(rooms.waiting_queue);
      setSessionUsers(rooms.active_sessions_users);

      // Check if the room is connected after sessionUsers is updated
      if (
        roomToJoin &&
        rooms?.active_sessions_users &&
        rooms?.active_sessions_users[roomToJoin] &&
        rooms?.active_sessions_users[roomToJoin].length === 2
      ) {
        setConnectionStatus("Connected");
      } else {
        setConnectionStatus("Searching...");
      }
    });

    // First we join a room
    socketRef.current.emit("join", roomToJoin);
    socketRef.current.on("joined", handleRoomJoined);
    // If the room didn't exist, the server would emit the room was 'created'
    socketRef.current.on("created", handleRoomCreated);
    // Whenever the next person joins, the server emits 'ready'
    socketRef.current.on("ready", initiateCall);

    // Emitted when a peer leaves the room
    socketRef.current.on("leave", onPeerLeave);

    // If the room is full, we show an alert
    socketRef.current.on("full", () => {
      // console.log({ skippedSessions, waitingRooms });
      let isThereARoomToJoin = false;
      let checked = new Set([]);
      while (isThereARoomToJoin == false && waitingRooms.length > 0) {
        roomToJoin =
          waitingRooms[Math.floor(Math.random() * (waitingRooms.length - 1))];
        // console.log("while full");
        checked.add(roomToJoin);
        if (
          !skippedSessions.includes(roomToJoin) ||
          checked.size == waitingRooms.length
        )
          isThereARoomToJoin = true;
      }
      roomToJoin = roomToJoin || uuidv4();
      setRoomName(roomToJoin);
    });

    socketRef.current.on("message_recieved", message_received);

    // Event called when a remote user initiating the connection and
    socketRef.current.on("offer", handleReceivedOffer);
    socketRef.current.on("answer", handleAnswer);
    socketRef.current.on("ice-candidate", handlerNewIceCandidateMsg);
    socketRef.current.on("skipped_users", updateSkippedUsers);

    // clear up after
    return () => {
      socketRef.current.emit("skip", roomName);
      socketRef.current.disconnect();
    };
  }, [roomName]);

  const handleRoomJoined = () => {
    // console.log("handleRoomJoind")
    setRoomName(roomName);

    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: false,
      })
      .then((stream) => {
        userStreamRef.current = stream;
        userVideoRef.current.srcObject = stream;
        userVideoRef.current.onloadedmetadata = () => {
          userVideoRef.current.play();
        };
        socketRef.current.emit("ready", roomName);
      })
      .catch((err) => {
        console.log("error", err);
      });
  };

  const handleRoomCreated = () => {
    setRoomName(roomName);

    hostRef.current = true;
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: false,
      })
      .then((stream) => {
        userStreamRef.current = stream;
        userVideoRef.current.srcObject = stream;
        userVideoRef.current.onloadedmetadata = () => {
          userVideoRef.current.play();
        };
      })
      .catch((err) => {
        console.log("handleRoomCreated", err);
      });
  };

  const initiateCall = () => {
    if (hostRef.current) {
      if (!userStreamRef.current) {
        console.error("User stream is not initialized");
        return;
      }
      rtcConnectionRef.current = createPeerConnection();
      rtcConnectionRef.current.addTrack(
        userStreamRef.current.getTracks()[0],
        userStreamRef.current
      );
      rtcConnectionRef.current
        .createOffer()
        .then((offer) => {
          rtcConnectionRef.current.setLocalDescription(offer);
          socketRef.current.emit("offer", offer, roomName);
        })
        .catch((error) => {
          console.log(error);
        });
    }
  };

  const onPeerLeave = (waiting_queue) => {
    // This person is now the creator because they are the only person in the room.
    hostRef.current = false;
    setConnectionStatus("Searching...");
    // console.log("peer left");
    window.location.reload();
  };

  const message_received = (message) => {
    setMessages(message);
  };

  const handleSendMessage = () => {
    // if (inputMessage.trim()) {
    //     setMessages([...messages, { text: inputMessage, sender: "user" }]);
    //     setInputMessage("");
    // }
    if (inputMessage.trim()) {
      setMessages([
        ...messages,
        { message: inputMessage, sender: socketRef.current.id },
      ]);
      socketRef.current.emit("message_send", {
        roomName,
        message: inputMessage,
      });
      setInputMessage("");
    }
  };

  /**
   * Takes a userid which is also the socketid and returns a WebRTC Peer
   *
   * @param  {string} userId Represents who will receive the offer
   * @returns {RTCPeerConnection} peer
   */

  const createPeerConnection = () => {
    // We create a RTC Peer Connection
    const connection = new RTCPeerConnection(ICE_SERVERS);

    // We implement our onicecandidate method for when we received a ICE candidate from the STUN server
    connection.onicecandidate = handleICECandidateEvent;

    // We implement our onTrack method for when we receive tracks
    connection.ontrack = handleTrackEvent;
    return connection;
  };

  const handleICECandidateEvent = (event) => {
    if (event.candidate) {
      socketRef.current.emit("ice-candidate", event.candidate, roomName);
    }
  };

  const handleTrackEvent = (event) => {
    // eslint-disable-next-line prefer-destructuring
    peerVideoRef.current.srcObject = event.streams[0];
  };

  const handleReceivedOffer = (offer) => {
    if (!hostRef.current) {
      rtcConnectionRef.current = createPeerConnection();
      rtcConnectionRef.current.addTrack(
        userStreamRef.current.getTracks()[0],
        userStreamRef.current
      );
      rtcConnectionRef.current.setRemoteDescription(offer);

      rtcConnectionRef.current
        .createAnswer()
        .then((answer) => {
          rtcConnectionRef.current.setLocalDescription(answer);
          socketRef.current.emit("answer", answer, roomName);
        })
        .catch((error) => {
          console.log(error);
        });
    }
  };

  const handleAnswer = (answer) => {
    rtcConnectionRef.current
      .setRemoteDescription(answer)
      .catch((err) => console.log(err));
  };

  const handlerNewIceCandidateMsg = (incoming) => {
    // We cast the incoming candidate to RTCIceCandidate
    const candidate = new RTCIceCandidate(incoming);
    if (!rtcConnectionRef) initiateCall();
    rtcConnectionRef.current
      .addIceCandidate(candidate)
      .catch((e) => console.log(e));
  };

  const updateSkippedUsers = (data) => {
    setSkippedSessions(data);
  };

  // const requestMicrophonePermission = async () => {
  //   try {
  //     const permissionStatus = await navigator.permissions.query({
  //       name: "microphone",
  //     });
  //     //   console.log("permissionStatus",permissionStatus)
  //     //   console.log('Microphone permission status:', permissionStatus.state);

  //     setMicrophoneAccess(permissionStatus.state);

  //     const constraints = navigator.userAgent.includes("iPhone")
  //       ? { video: true }
  //       : {
  //           audio: true,
  //           video: {
  //             width: { ideal: 640 },
  //             height: { ideal: 400 },
  //           },
  //         };

  //     navigator.mediaDevices
  //       .getUserMedia({ audio: true, video: true })
  //       .then((stream) => {
  //         const videoTracks = stream.getVideoTracks();
  //         //   console.log('video---->', stream, videoTracks[0].enabled);
  //         document.querySelector("video").srcObject = stream;
  //       });

  //     //   console.log('result5---->', constraints);

  //     if (permissionStatus.state === "denied") {
  //       const userResponse = window.confirm(
  //         "Microphone access is required for this application. Do you want to grant permission?"
  //       );
  //       // console.log('userResponse', userResponse);

  //       if (userResponse) {
  //         // console.log("if condition")

  //         try {
  //           const result = await navigator.mediaDevices.getUserMedia({
  //             audio: true,
  //           });
  //           // console.log("result", result)

  //           const result2 = await navigator.mediaDevices.getUserMedia({
  //             audio: true,
  //           });
  //           const result3 = await navigator.mediaDevices.getUserMedia({
  //             audio: true,
  //           });
  //           const result4 = await navigator.mediaDevices.getUserMedia({
  //             audio: true,
  //           });
  //           const result5 = await navigator.mediaDevices.getUserMedia({
  //             audio: true,
  //           });

  //           // console.log('Microphone permission granted:', result,result2,result3,result4,result4);
  //         } catch (error) {
  //           console.error("Error accessing microphone:", error);
  //         }
  //       } else {
  //         window.alert("Microphone permission denied by user");
  //       }
  //     } else if (permissionStatus.state === "prompt") {
  //       const result = await permissionStatus.userChoice;

  //       if (result.outcome === "granted") {
  //         //   console.log('Microphone permission granted');
  //       } else if (result.outcome === "denied") {
  //         window.alert("Microphone permission denied by user");
  //       }
  //     }
  //   } catch (error) {
  //     const result5 = await navigator.mediaDevices.getUserMedia({
  //       audio: true,
  //     });
  //     console.error("Error requesting microphone permission:", error);
  //   }
  // };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      userStreamRef.current = stream;
      console.log("Microphone access granted, stream initialized:", stream);
      // Attach to the user video ref
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = stream;
        userVideoRef.current.play();
      }
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const toggleMediaStream = (type, state) => {
    userStreamRef.current?.getTracks()?.forEach((track) => {
      if (track.kind === type) {
        // eslint-disable-next-line no-param-reassign
        track.enabled = !state;
      }
    });
  };
  const getRandomDelay = () => {
    return Math.floor(Math.random() * 5000) + 10000; // Random time between 10000ms (10s) and 15000ms (15s)
  };
  const toggleMic = () => {
    toggleMediaStream("audio", micActive);
    setMicActive((prev) => !prev);
  };

  const handleSkipCalling = () => {
    // setLoader(true);

    const connectSocket = () => {
      socketRef.current.emit("skip", roomName);
      if (peerVideoRef.current.srcObject) {
        peerVideoRef.current.srcObject
          .getTracks()
          .forEach((track) => track.stop());
      }

      let waitingRoomsTemp = [...waitingRooms].filter((rn) => rn != roomName);

      if (waitingRoomsTemp.length !== 0) {
        let roomToJoin =
          waitingRoomsTemp.length > 0
            ? waitingRoomsTemp[
                Math.floor(Math.random() * waitingRoomsTemp.length)
              ]
            : uuidv4();
        if (connectionStatus === "Searching...") {
          socketRef.current.emit("onLeave", roomName);
        }

        window.location.href = "/calling/" + roomToJoin;
      } else {
        let roomToJoin = roomName;

        if (connectionStatus === "Searching...") {
          socketRef.current.emit("onLeave", roomName);
        }
        window.location.href = "/calling/" + roomToJoin;
      }
    };
    connectSocket();
    // const intervalId = setTimeout(function run() {
    //   setTimeout(run, getRandomDelay());
    // }, getRandomDelay());
  };

  const handleEndCalling = () => {
    socketRef.current.emit("skip", roomName);
    if (connectionStatus === "Searching...") {
      socketRef.current.emit("onLeave", roomName);
    }
    window.location.href = "/";
  };

  return (
    <>
      <div className="main-content-text">
        {/* {loader && <div id="loader" class="loader"></div>} */}
        <div className="grid lg:grid-cols-2 grid-cols-1 gap-4 items-center ">
          <div className="class-section text-center">
            <h1 className="font-katibeh  text-[60px] mb-[20px]">
              {connectionStatus === "Connected" ? (
                <span>Connected</span>
              ) : (
                <span>Searching...</span>
              )}
            </h1>
            {/* <p style={{
							backgroundColor:'white',
							padding: '10px 20px'
						}}>{microphoneAccess}</p> */}
            <div className="flex justify-center flex-wrap items-center">
              <button
                className="m-2 btn bg-[#031E29] text-white dark:bg-white dark:text-[#000]"
                onClick={toggleMic}
              >
                <span className="flex justify-center  items-center gap-2">
                  {micActive ? (
                    <img
                      className="dark:hidden block"
                      src="../mic_svgrepo.png"
                    />
                  ) : (
                    <img className="dark:hidden block" src="../mute_icon.svg" />
                  )}
                  {micActive ? (
                    <img
                      className="dark:block hidden"
                      src="../mic_svgrepo-dark.png"
                    />
                  ) : (
                    <img
                      className="dark:block hidden"
                      src="../mute_dark-mode.svg"
                    />
                  )}
                  Mute Call
                </span>
              </button>
              <button
                className="m-2 btn bg-[#031E29] text-white dark:bg-white dark:text-[#000]"
                onClick={handleSkipCalling}
              >
                <span className="flex justify-center items-center gap-2">
                  <img
                    className="dark:hidden block"
                    src="../switch-vertical-light.png"
                  />
                  <img
                    className="dark:block hidden"
                    src="../switch-vertical-dark.png"
                  />
                  Skip Call
                </span>
              </button>
              <button
                className="m-2 btn bg-[#031E29] text-white dark:bg-white dark:text-[#000]"
                onClick={handleEndCalling}
              >
                <span className="flex justify-center items-center gap-2">
                  <img
                    className="dark:hidden block"
                    src="../cancel_svgrepo-light.png"
                  />
                  <img
                    className="dark:block hidden"
                    src="../cancel_svgrepo-dark.png"
                  />
                  End call
                </span>
              </button>
            </div>
          </div>
          <div className="message-section">
            {/* <div className="chat-box">
            <div className="messages">
              {messages.map((msg, index) => (
                <div key={index} className={`message ${msg.sender}`}>
                  {msg.text}
                </div>
              ))}
            </div>
            <div className="input-box">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Start chatting..."
              />
              <button onClick={handleSendMessage}>Send</button>
            </div>
          </div> */}
            <div className="chat-box">
              {/* <video style={{ width: 5 }} autoPlay ref={userVideoRef} muted /> */}
              <video style={{ display: 'none' }} autoPlay ref={userVideoRef} muted />
              <div className="messages">
                {messages.map((msg, index) => (
                  <div
                    key={uuidv4()}
                    className={`message ${
                      msg.sender == socketRef.current?.id ? "user" : "other"
                    }`}
                  >
                    {msg.message}
                  </div>
                ))}
              </div>
              <div className="input-box">
                <div className="message-input-box">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Start chatting..."
                  />
                  <video style={{ width: 5 }} autoPlay ref={peerVideoRef} />
                  <button onClick={handleSendMessage}>
                    <img className="" src="../send-icon-img.png" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Calling;