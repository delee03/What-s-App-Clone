"use client";

import { User } from "@prisma/client";
import axios from "axios";
import Image from "next/image";
import React from "react";
import Avatar from "react-avatar";
import { MdCall, MdCallEnd } from "react-icons/md";
import { BeatLoader } from "react-spinners";
import { toast } from "react-toastify";
import { useRecoilState } from "recoil";
import { ZegoExpressEngine } from "zego-express-engine-webrtc";
import { ZegoStreamList } from "zego-express-engine-webrtc/sdk/code/zh/ZegoExpressEntity.web";

import { pusherClient } from "@/lib/pusher";
import getZegoToken from "@/lib/token";

import { Call, callState } from "../atoms/CallState";

export default function IncomingCall({
	call,
	email,
	user,
}: {
	call: Call;
	email: string;
	user: User;
}): React.JSX.Element {
	const setCallState = useRecoilState(callState)[1];
	const [callAccepted, setCallAccepted] = React.useState(false);
	const [zg, setZg] = React.useState<ZegoExpressEngine | null>(null);
	const [streamID, setStreamID] = React.useState("");
	const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
	const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(null);
	const [duration, setDuration] = React.useState(0);
	const [incomingLoading, setIncomingLoading] = React.useState(false);
	const [endingLoading, setEndingLoading] = React.useState(false);
	React.useEffect(() => {
		pusherClient.subscribe(email);
		pusherClient.bind("call:cancelled", () => {
			toast.error("Call ended");
			setCallState({});
			zg?.stopPlayingStream(streamID);
			zg?.stopPublishingStream(streamID);
			zg?.logoutRoom(String(call.roomID));
			if (remoteStream) zg?.destroyStream(remoteStream);
			if (localStream) zg?.destroyStream(localStream);
			zg?.destroyEngine();
		});
		return () => {
			pusherClient.unsubscribe(email);
			pusherClient.unbind("call:cancelled");
		};
	}, []);
	React.useEffect(() => {
		const playRingtone = (): HTMLAudioElement => {
			const audioElement = new Audio("/call-sound.mp3");
			audioElement.loop = true;
			void audioElement.play();
			return audioElement;
		};

		const stopRingtone = (audioElement: HTMLAudioElement): void => {
			audioElement.pause();
			audioElement.currentTime = 0;
		};

		let audioElement: HTMLAudioElement | undefined;
		if (!callAccepted) {
			audioElement = playRingtone();
		} else {
			if (audioElement) stopRingtone(audioElement);
		}
		return () => {
			if (audioElement) stopRingtone(audioElement);
		};
	}, [callAccepted]);
	React.useEffect((): void => {
		if (callAccepted) {
			const _zg = new ZegoExpressEngine(
				parseInt(process.env.NEXT_PUBLIC_ZEGOCLOUD_APP_ID ?? ""),
				process.env.NEXT_PUBLIC_ZEGOCLOUD_SERVER_SECRET ?? ""
			);
			_zg.setDebugVerbose(false);
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			void _zg.on("roomStreamUpdate", async (roomID, updateType, streamList: ZegoStreamList[]): Promise<void> => {
				console.log("roomUserUpdate roomID ", roomID, streamList);
				if (updateType === "ADD") {
					const streamID = streamList[0].streamID;
					const remoteStream = await _zg.startPlayingStream(streamID);
					const remoteView = _zg.createRemoteStreamView(remoteStream);
					setRemoteStream(remoteStream);
					remoteView.play("remote-video", { enableAutoplayDialog: true });
				} else if (updateType === "DELETE") {
					_zg.stopPlayingStream(streamList[0].streamID);
				}
			});
			const token = getZegoToken(user.id);
			setZg(_zg);
			void _zg
				.loginRoom(
					String(call.roomID),
					token,
					{ userID: user.id, userName: user.name ?? "" },
					{ userUpdate: true }
				)
				.then(async (result) => {
					if (result) {
						const localStream = await _zg.createStream({
							camera: { audio: true, video: call.type === "video" },
						});
						const localView = _zg.createLocalStreamView(localStream);
						localView.play(call.type === "video" ? "local-video" : "local-audio", {
							enableAutoplayDialog: true,
						});
						const streamID = new Date().getTime().toString();
						setLocalStream(localStream);
						setStreamID(streamID);
						_zg.startPublishingStream(streamID, localStream);
					}
				});
		}
	}, [callAccepted]);
	React.useEffect(() => {
		if (callAccepted) {
			const interval = setInterval(() => {
				setDuration((duration) => duration + 1);
			}, 1000);
			return () => clearInterval(interval);
		}
		return;
	}, [callAccepted]);
	const formatTime = (time: number): string => {
		if (isNaN(time) || time === Infinity) return "00:00";
		const minutes = Math.floor(time / 60);
		const seconds = Math.floor(time % 60);
		return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
	};
	return (
		<div className="z-20 flex h-[100vh] max-h-screen w-full items-center justify-center overflow-hidden border border-[#e9edef] bg-[#efeae2] text-[#54656f] dark:border-[#313d45] dark:bg-[#0b141a] dark:text-[#aebac1] lg:h-[95vh] lg:rounded-lg">
			<div className="flex flex-col items-center justify-center space-y-10">
				{!callAccepted && (
					<span className="my-3 text-sm text-opacity-30">
						{call.type === "video" ? "Video Call" : "Voice Call"}
					</span>
				)}
				<div className={`${callAccepted && call.type === "video" ? "hidden" : ""}`}>
					{(!callAccepted || call.type === "voice") &&
						(call.user?.image ? (
							<Image
								src={call.user.image}
								alt={call.user.name ?? ""}
								className="rounded-full"
								height={200}
								width={200}
							/>
						) : (
							<Avatar
								name={call.user?.name ?? ""}
								className="rounded-full"
								size="200"
								textSizeRatio={2}
							/>
						))}
				</div>
				<span className="mt-5 text-5xl font-semibold">{call.user?.name}</span>
				{callAccepted ? (
					<div className="flex flex-row items-center justify-center space-x-3">
						<div className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
						<span className="text-md">{formatTime(duration)}</span>
					</div>
				) : (
					<span className="mt-5 text-xl font-semibold">
						<BeatLoader color="#54656f" />
					</span>
				)}
				<div className={`video-wrapper ${callAccepted && call.type === "video" ? "" : "hidden"}`}>
					<div id="local-video" />
					<div id="local-audio" className="hidden" />
					<div id="remote-video" />
				</div>
				<div className="flex flex-row space-x-5">
					{!callAccepted && (
						<button
							disabled={incomingLoading || endingLoading}
							className="mt-5 flex h-[56px] w-[56px] cursor-pointer items-center justify-center rounded-full bg-green-500 p-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
							onClick={(): void => {
								if (incomingLoading) return;
								setIncomingLoading(true);
								void axios
									.post("/api/call/accepted", {
										id: call.roomID,
										receiver: call.user,
										accepted: true,
									})
									.then(() => {
										setCallAccepted(true);
										setIncomingLoading(false);
										// audio?.pause();
										// setAudio(null);
									});
							}}>
							<MdCall className="h-6 w-6" />
						</button>
					)}
					<button
						className="mt-5 flex h-[56px] w-[56px] cursor-pointer items-center justify-center rounded-full bg-red-500 p-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
						onClick={(): void => {
							if (endingLoading) return;
							setEndingLoading(true);
							void axios
								.post("/api/call/accepted", {
									id: call.roomID,
									receiver: call.user,
									accepted: false,
								})
								.then(() => {
									setCallState({});
									zg?.stopPlayingStream(streamID);
									zg?.stopPublishingStream(streamID);
									if (remoteStream) zg?.destroyStream(remoteStream);
									if (localStream) zg?.destroyStream(localStream);
									zg?.logoutRoom(String(call.roomID));
									zg?.destroyEngine();
									setCallAccepted(false);
									setEndingLoading(false);
									// audio?.pause();
									// setAudio(null);
								});
						}}
						disabled={endingLoading || incomingLoading}>
						<MdCallEnd className="h-6 w-6" />
					</button>
				</div>
			</div>
		</div>
	);
}
