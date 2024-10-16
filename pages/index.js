import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/router";
import { Inter } from "next/font/google";
import { IoMoon } from "react-icons/io5";
import { IoSunny } from "react-icons/io5";
import { io } from "socket.io-client";
import useSocket from "../hooks/useSocket";
const inter = Inter({ subsets: ["latin"] });

export default function Home() {
  useSocket();
  const router = useRouter();
  const [roomName, setRoomName] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const socketRef = useRef();
  const [loader, setLoader] = useState(true);

  const handleRedirect = () => {
    router.push(`/calling/${roomName || Math.random().toString(36).slice(2)}`); // Replace with your target page route
  };

  useEffect(() => {
    // Check if the user prefers dark mode
    const prefersDarkMode = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;

    // Set the initial theme based on user preference
    setIsDarkTheme(prefersDarkMode);
  }, []);

  useEffect(() => {
    const connectSocket = () => {
      setLoader(false);
      var existingUUID = getUUIDCookie();
      if (!existingUUID) {
        setUUIDCookie();
      }
      socketRef.current = io(process.env.NEXT_PUBLIC_LIVE_URL);
      // if (!socketRef.current) {
      //   socketRef.current = io(process.env.NEXT_PUBLIC_LIVE_URL);
      // }

      socketRef.current.on("getWaitingRooms", (rooms) => {
        console.log("rooms", rooms);
        setRoomName(
          rooms?.waiting_queue?.length
            ? rooms.waiting_queue[rooms.waiting_queue.length - 1] || uuidv4()
            : uuidv4()
        );

        // for (let i = rooms?.waiting_queue?.length; i > 0; i++) {
        //   if (
        //     rooms?.active_sessions_users[rooms.waiting_queue[i - 1]]?.length < 2
        //   ) {
        //     setRoomName(rooms.waiting_queue[i - 1]);
        //     break;
        //   } else if (i == 1) {
        //     setRoomName(uuidv4());
        //   }
        // }

        // if (!roomName) {
        //   setRoomName(uuidv4());
        // }
      });
    };

    // Start the first connection immediately
    // connectSocket();
    connectSocket();
    // const intervalId = setTimeout(function run() {

    //   setTimeout(run, getRandomDelay());
    // }, getRandomDelay());

    // Clean up the interval and socket connection on component unmount
    return () => socketRef.current.disconnect();
  }, []);

  function uuidv4() {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (
        c ^
        (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
      ).toString(16)
    );
  }

  // Function to set a cookie with the UUID
  function setUUIDCookie() {
    document.cookie =
      "token_id=" +
      uuidv4() +
      "; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/";
    // console.log('the cookie is setUUID ', document.cookie)
  }

  // Function to get the UUID cookie
  function getUUIDCookie() {
    var name = "token_id=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var cookieArray = decodedCookie.split(";");
    for (var i = 0; i < cookieArray.length; i++) {
      var cookie = cookieArray[i];
      while (cookie.charAt(0) == " ") {
        cookie = cookie.substring(1);
      }
      if (cookie.indexOf(name) == 0) {
        return cookie.substring(name.length, cookie.length);
      }
    }
    return null;
  }

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };
  return (
    <>
      <main className={` min-h-screen ${inter.className}`}>
        {loader && <div id="loader" class="loader"></div>}
        <div className="">
          <div className="main-content-text">
            <h1 className="main-hd">Smart AI Conversations</h1>
            <p className="sub-hd mb-[30px]">
              Your Ultimate Virtual Chat Assistant Experience
            </p>
            <button
              onClick={openModal}
              className="btn bg-[#031E29] text-white dark:bg-white dark:text-[#000]"
            >
              <span className="flex justify-center items-center gap-2">
                <img className="dark:hidden block" src="./mic_svgrepo.png" />
                <img
                  className="dark:block hidden"
                  src="./mic_svgrepo-dark.png"
                />
                Start Call
              </span>
            </button>
          </div>
        </div>
        {isModalOpen && (
          <div className="modal ">
            <div className="modal-content bg-[#031E29] text-white dark:bg-[#fff] dark:text-[#031E29] text-center">
              <p className="text-[32px] mb-[40px]">Are you 18+</p>
              <div>
                <button
                  onClick={handleRedirect}
                  className="m-2 btn dark:bg-[#031E29] dark:text-white bg-white text-[#000]"
                >
                  Yes
                </button>
                <button
                  onClick={closeModal}
                  className="m-2 btn dark:bg-[#031E29] dark:text-white bg-white text-[#000]"
                >
                  No
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
