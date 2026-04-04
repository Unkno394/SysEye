// components/auth-shell.tsx
import type { ReactNode } from "react";
import { AppBrand } from "@/components/app-brand";
import FaultyTerminal from "@/components/faulty-terminal";

const terminalBackgroundProps = {
  tint: "#5cffb5",
  gridMul: [2.2, 1.4] as [number, number],
  digitSize: 1.35,
  timeScale: 0.28,
  noiseAmp: 0.85,
  scanlineIntensity: 0.35,
  glitchAmount: 1.08,
  flickerAmount: 0.65,
  curvature: 0.16,
  dither: 0.5,
  brightness: 0.9,
};

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050c12]">
      <div className="absolute inset-0 opacity-70">
        <FaultyTerminal {...terminalBackgroundProps} />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,255,179,0.16),transparent_35%),linear-gradient(180deg,rgba(3,8,12,0.18),rgba(3,8,12,0.85))]" />

      <div className="relative z-10 flex min-h-screen items-start justify-center px-4 py-6 sm:px-6 sm:py-10 lg:items-center">
        <div className="w-full max-w-xl rounded-[1.7rem] border border-line bg-black/20 p-4 backdrop-blur-sm sm:rounded-[2rem] sm:p-8">
          <div className="mb-8">
            <AppBrand className="mb-6" />
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
            <p className="mt-2 text-sm text-white/60">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
