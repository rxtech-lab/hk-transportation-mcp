import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #09090b 0%, #18181b 50%, #09090b 100%)",
          position: "relative",
        }}
      >
        {/* Ambient glow */}
        <div
          style={{
            position: "absolute",
            top: -100,
            left: -100,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "rgba(59, 130, 246, 0.12)",
            filter: "blur(100px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -100,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "rgba(79, 70, 229, 0.1)",
            filter: "blur(100px)",
          }}
        />

        {/* Icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 88,
            height: 88,
            borderRadius: 22,
            background: "linear-gradient(180deg, #3b82f6 0%, #4f46e5 100%)",
            marginBottom: 32,
            boxShadow: "0 8px 32px rgba(59, 130, 246, 0.3)",
          }}
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 17h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2z" />
            <path d="M6 17l-2 2" />
            <path d="M18 17l2 2" />
            <circle cx="9" cy="13" r="1" fill="white" />
            <circle cx="15" cy="13" r="1" fill="white" />
            <path d="M8 7v4" />
            <path d="M16 7v4" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: "white",
            letterSpacing: "-0.03em",
            marginBottom: 16,
          }}
        >
          HK Transportation
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 24,
            color: "rgba(161, 161, 170, 1)",
            maxWidth: 600,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          AI-powered bus routes, stops, and real-time arrivals for Hong Kong
        </div>
      </div>
    ),
    { ...size }
  );
}
