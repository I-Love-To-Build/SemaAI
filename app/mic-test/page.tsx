"use client";

import { useMemo, useRef, useState } from "react";

type MicReport = {
  secureContext: boolean;
  protocol: string;
  host: string;
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  hasMediaRecorder: boolean;
  permissionState: string;
  devices: Array<{ kind: string; label: string; deviceId: string }>;
  recorderTypes: string[];
  result: string;
  errorName?: string;
  errorMessage?: string;
};

function initialReport(): MicReport {
  return {
    secureContext: typeof window !== "undefined" ? window.isSecureContext : false,
    protocol: typeof window !== "undefined" ? window.location.protocol : "",
    host: typeof window !== "undefined" ? window.location.host : "",
    hasMediaDevices: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices),
    hasGetUserMedia: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    hasMediaRecorder: typeof MediaRecorder !== "undefined",
    permissionState: "unknown",
    devices: [],
    recorderTypes: [],
    result: "Ready"
  };
}

export default function MicTestPage() {
  const [report, setReport] = useState<MicReport>(() => initialReport());
  const [recording, setRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const supportedTypes = useMemo(() => ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/wav"], []);

  async function getPermissionState() {
    try {
      if (!navigator.permissions?.query) return "unsupported";
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      return status.state;
    } catch {
      return "unavailable";
    }
  }

  async function getDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.map((device) => ({
        kind: device.kind,
        label: device.label || "(label hidden until permission is granted)",
        deviceId: device.deviceId ? "present" : "missing"
      }));
    } catch {
      return [];
    }
  }

  async function testMicrophone() {
    setPreviewUrl("");
    setReport((current) => ({ ...current, result: "Requesting microphone permission..." }));
    const base = initialReport();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const permissionState = await getPermissionState();
      const devices = await getDevices();
      const recorderTypes = supportedTypes.filter((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
      stream.getTracks().forEach((track) => track.stop());
      setReport({
        ...base,
        permissionState,
        devices,
        recorderTypes,
        result: "Microphone opened successfully."
      });
    } catch (error) {
      const permissionState = await getPermissionState();
      const devices = await getDevices();
      setReport({
        ...base,
        permissionState,
        devices,
        recorderTypes: supportedTypes.filter((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)),
        result: "Microphone failed before recording started.",
        errorName: error instanceof DOMException ? error.name : error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown microphone error"
      });
    }
  }

  async function startSampleRecording() {
    setPreviewUrl("");
    chunksRef.current = [];
    setReport((current) => ({ ...current, result: "Starting sample recording..." }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = supportedTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || type || "audio/webm" });
        setPreviewUrl(URL.createObjectURL(blob));
        setRecording(false);
        setReport((current) => ({ ...current, result: blob.size ? "Sample recording captured." : "No audio data was captured." }));
      };
      recorder.start(250);
      setRecording(true);
      setReport((current) => ({ ...current, result: "Recording sample. Speak, then stop." }));
    } catch (error) {
      setRecording(false);
      setReport((current) => ({
        ...current,
        result: "Sample recording could not start.",
        errorName: error instanceof DOMException ? error.name : error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown microphone error"
      }));
    }
  }

  function stopSampleRecording() {
    recorderRef.current?.requestData();
    recorderRef.current?.stop();
  }

  function useNativeRecording(file: File | null) {
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setReport((current) => ({
      ...current,
      result: `Native recorder file captured: ${file.name || "audio file"}`,
      errorName: undefined,
      errorMessage: undefined
    }));
  }

  return (
    <main className="micTestPage">
      <section className="micTestPanel">
        <p className="eyebrow">Sema AI microphone diagnostic</p>
        <h1>Microphone test</h1>
        <p>This page tests the same browser recording API used in the contributor portal.</p>
        <div className="micTestActions">
          <button className="primaryButton" type="button" onClick={testMicrophone}>Test microphone access</button>
          <button className="recordButton" type="button" onClick={recording ? stopSampleRecording : startSampleRecording}>
            {recording ? "Stop sample" : "Record sample"}
          </button>
          <button className="ghostButton" type="button" onClick={() => {
            if (fileInputRef.current) fileInputRef.current.value = "";
            fileInputRef.current?.click();
          }}>Open phone recorder</button>
        </div>
        <input ref={fileInputRef} hidden type="file" accept="audio/*" capture onChange={(event) => useNativeRecording(event.target.files?.[0] ?? null)} />
        {previewUrl && <audio controls src={previewUrl} />}
        <pre>{JSON.stringify(report, null, 2)}</pre>
      </section>
    </main>
  );
}
