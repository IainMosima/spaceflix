"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { useSettings } from "@/hooks/use-settings";
import { DataDirPicker } from "@/components/data-dir-picker";
import { RuntimeCard } from "@/components/runtime-card";
import { StoragePanel } from "@/components/storage-panel";

export default function SettingsPage() {
  const { settings, isLoading, updateSettings, resetSettings } = useSettings();

  const [maxConnections, setMaxConnections] = useState(10);
  const [downloadLimit, setDownloadLimit] = useState(-1);
  const [uploadLimit, setUploadLimit] = useState(0);
  const [parallelDownloads, setParallelDownloads] = useState(3);
  const [bgLimitKB, setBgLimitKB] = useState(300); // KB/s, -1 = none
  const [cleanupDelay, setCleanupDelay] = useState(30);
  const [subtitleLanguage, setSubtitleLanguage] = useState("");
  const [rolling, setRolling] = useState(true);
  const [keepBehindGB, setKeepBehindGB] = useState(4);
  const [aheadGB, setAheadGB] = useState(2);
  const [preloadPct, setPreloadPct] = useState(25);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Load settings into form
  useEffect(() => {
    if (settings) {
      setMaxConnections(settings.maxConnections);
      setDownloadLimit(settings.downloadLimit);
      setUploadLimit(settings.uploadLimit);
      setParallelDownloads(settings.parallelDownloads ?? 3);
      const bg = settings.backgroundDownloadLimit ?? 307200;
      setBgLimitKB(bg < 0 ? -1 : Math.round(bg / 1024));
      setCleanupDelay(settings.cleanupDelaySeconds);
      setSubtitleLanguage(settings.subtitleLanguage ?? "");
      setRolling(settings.rollingStream !== false);
      setKeepBehindGB(settings.rollingKeepBehindGB ?? 4);
      setAheadGB(settings.rollingAheadGB ?? 2);
      setPreloadPct(settings.preloadPercent ?? 25);
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        maxConnections,
        downloadLimit,
        uploadLimit,
        parallelDownloads,
        backgroundDownloadLimit: bgLimitKB < 0 ? -1 : Math.round(bgLimitKB * 1024),
        cleanupDelaySeconds: cleanupDelay,
        subtitleLanguage: subtitleLanguage.trim(),
        rollingStream: rolling,
        rollingKeepBehindGB: Math.min(50, Math.max(0.5, keepBehindGB || 4)),
        rollingAheadGB: Math.min(20, Math.max(0.5, aheadGB || 2)),
        preloadPercent: Math.round(Math.min(100, Math.max(5, preloadPct || 25))),
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await resetSettings();
      toast.success("Settings reset to defaults");
    } catch (err) {
      toast.error("Failed to reset settings");
    } finally {
      setIsResetting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen pt-14">
        <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pt-14">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        {/* Settings form */}
        <div className="space-y-6">
          {/* Data directory */}
          <RuntimeCard />
          <DataDirPicker />

          {/* Connection settings */}
          <Card className="p-6 bg-zinc-900/50 border-zinc-800">
            <h2 className="font-semibold mb-4">Connection</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">
                  Subtitles on by default
                </label>
                <Input
                  value={subtitleLanguage}
                  onChange={(e) => setSubtitleLanguage(e.target.value)}
                  placeholder="Off"
                  className="bg-zinc-800 border-zinc-700 w-40"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  A language, like English. Turned on when the video has it. Leave empty for off.
                </p>
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-2 block">
                  Max Connections
                </label>
                <Input
                  type="number"
                  value={maxConnections}
                  onChange={(e) => setMaxConnections(Number(e.target.value))}
                  min={1}
                  max={200}
                  className="bg-zinc-800 border-zinc-700 w-32"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  Per torrent. Fewer is gentler on your router; 10 is plenty.
                </p>
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-2 block">
                  Downloads at the same time
                </label>
                <Input
                  type="number"
                  value={parallelDownloads}
                  onChange={(e) => setParallelDownloads(Number(e.target.value))}
                  min={1}
                  max={10}
                  className="bg-zinc-800 border-zinc-700 w-32"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  The rest wait their turn. All pause while you watch, so playback stays smooth.
                </p>
              </div>

              <div>
                <label className="text-sm text-zinc-400 mb-2 block">
                  Background download limit (KB/s)
                </label>
                <Input
                  type="number"
                  value={bgLimitKB}
                  onChange={(e) => setBgLimitKB(Number(e.target.value))}
                  min={-1}
                  className="bg-zinc-800 border-zinc-700 w-32"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  Only while nothing is playing, so the house keeps some internet. Watching always gets full speed. -1 = no limit.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">
                    Download Limit (bytes/s)
                  </label>
                  <Input
                    type="number"
                    value={downloadLimit}
                    onChange={(e) => setDownloadLimit(Number(e.target.value))}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <p className="text-xs text-zinc-600 mt-1">
                    -1 for unlimited
                  </p>
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">
                    Upload Limit (bytes/s)
                  </label>
                  <Input
                    type="number"
                    value={uploadLimit}
                    onChange={(e) => setUploadLimit(Number(e.target.value))}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <p className="text-xs text-zinc-600 mt-1">
                    0 = never upload (best on slow internet), -1 unlimited
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Cleanup settings */}
          <Card className="p-6 bg-zinc-900/50 border-zinc-800">
            <h2 className="font-semibold mb-4">Auto-Cleanup</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">
                  Cleanup Delay (minutes)
                </label>
                <Input
                  type="number"
                  value={Math.round(cleanupDelay / 60)}
                  onChange={(e) => setCleanupDelay(Number(e.target.value) * 60)}
                  min={0}
                  max={60}
                  className="bg-zinc-800 border-zinc-700 w-32"
                />
                <p className="text-xs text-zinc-600 mt-1">
                  How long to wait after the last viewer disconnects before
                  deleting torrent cache (0-60 minutes)
                </p>
              </div>
            </div>
          </Card>

          {/* Storage optimization: rolling stream */}
          <Card className="p-6 bg-zinc-900/50 border-zinc-800">
            <h2 className="font-semibold mb-4">Storage Optimization</h2>
            <button
              type="button"
              onClick={() => setRolling(!rolling)}
              role="switch"
              aria-checked={rolling}
              className="w-full flex items-center justify-between gap-3 py-2 px-2.5 -mx-0.5 rounded-lg hover:bg-zinc-800/40 transition-colors text-left"
            >
              <span className="min-w-0">
                <span className="block text-sm text-zinc-300">
                  Delete what I&apos;ve already watched while streaming
                </span>
                <span className="block text-xs text-zinc-500 mt-0.5">
                  {rolling
                    ? `A 28 GB 4K movie needs about ${Math.round(keepBehindGB + aheadGB)} GB free instead of 28 GB`
                    : "Whole movies are kept on disk while you watch"}
                </span>
              </span>
              <span
                className={`shrink-0 h-6 w-10 rounded-full p-0.5 transition-colors ${
                  rolling ? "bg-purple-600" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                    rolling ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
            {rolling && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label htmlFor="keep-behind" className="text-sm text-zinc-400 mb-2 block">
                    Keep behind (GB)
                  </label>
                  <Input
                    id="keep-behind"
                    type="number"
                    value={keepBehindGB}
                    onChange={(e) => setKeepBehindGB(Number(e.target.value))}
                    min={0.5}
                    max={50}
                    step={0.5}
                    className="bg-zinc-800 border-zinc-700 w-32"
                  />
                  <p className="text-xs text-zinc-600 mt-1">
                    Seeking back further than this re-downloads
                  </p>
                </div>
                <div>
                  <label htmlFor="buffer-ahead" className="text-sm text-zinc-400 mb-2 block">
                    Buffer ahead (GB)
                  </label>
                  <Input
                    id="buffer-ahead"
                    type="number"
                    value={aheadGB}
                    onChange={(e) => setAheadGB(Number(e.target.value))}
                    min={0.5}
                    max={20}
                    step={0.5}
                    className="bg-zinc-800 border-zinc-700 w-32"
                  />
                  <p className="text-xs text-zinc-600 mt-1">
                    Downloaded ahead of where you are
                  </p>
                </div>
              </div>
            )}
            <div className="mt-4">
              <label htmlFor="preload-pct" className="text-sm text-zinc-400 mb-2 block">
                Preload when I press Download (%)
              </label>
              <Input
                id="preload-pct"
                type="number"
                value={preloadPct}
                onChange={(e) => setPreloadPct(Number(e.target.value))}
                min={5}
                max={100}
                step={5}
                className="bg-zinc-800 border-zinc-700 w-32"
              />
              <p className="text-xs text-zinc-600 mt-1">
                Downloads this much of a movie ahead of time, never into the 8 GB
                reserve. The rest streams when you watch. 100 = the whole movie.
              </p>
            </div>
            <p className="text-xs text-zinc-600 mt-3">
              Applies to titles you add from now on. Titles already on disk stay
              whole. The next episode gets only its first {aheadGB} GB ahead of time.
            </p>
          </Card>

          <div id="storage" className="scroll-mt-20">
            <StoragePanel />
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isResetting || isSaving}
              className="border-zinc-700"
            >
              {isResetting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Reset to Defaults
            </Button>

            <Button onClick={handleSave} disabled={isSaving || isResetting}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Settings
            </Button>
          </div>
        </div>

      </div>
    </main>
  );
}
