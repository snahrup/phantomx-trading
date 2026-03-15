'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTradingStore } from '@/store/trading-store';
import TradingChart from '@/components/chart/TradingChart';
import ConciergeChatPanel from '@/components/concierge/ConciergeChatPanel';
import AgentNetworkPanel from '@/components/agents/AgentNetworkPanel';
import AxonJournalPanel from '@/components/axon/AxonJournalPanel';
import ControlPanel from '@/components/trading/ControlPanel';
import ConnectionSetup from '@/components/trading/ConnectionSetup';
import SymbolSelector from '@/components/trading/SymbolSelector';
import AxonScannerPanel from '@/components/axon/AxonScannerPanel';
import PortfolioBar from '@/components/trading/PortfolioBar';
import AutopilotActivityBar from '@/components/trading/AutopilotActivityBar';
import TradeAnalytics from '@/components/trading/TradeAnalytics';
import AgentConsensusView from '@/components/axon/AgentConsensusView';
import TradeRecommendationPanel from '@/components/axon/TradeRecommendationPanel';
import AgentTeamPanel from '@/components/agents/AgentTeamPanel';
import PineScriptModal from '@/components/trading/PineScriptModal';
import StrategyPlaybook from '@/components/axon/StrategyPlaybook';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Zap, Activity, LayoutDashboard, Lightbulb,
  ExternalLink, PanelRight, Minus, ChevronsUp,
  Moon, Sun,
} from 'lucide-react';

export default function Dashboard() {
  const router = useRouter();
  const {
    isConnected, isTestnet,
    sidePanel, setSidePanel,
    sidebarMode, setSidebarMode, sidebarWidth, setSidebarWidth,
    isExecuting, isPaused, isKilled,
    agentStatuses,
    selectedSymbol, selectedTimeframe,
  } = useTradingStore();

  // --- Drag-to-resize sidebar ---
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(380);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = useTradingStore.getState().sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX.current - ev.clientX;
      setSidebarWidth(startWidth.current + delta);
    };
    const handleUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [setSidebarWidth]);

  // --- Floating panel drag ---
  const [floatPos, setFloatPos] = useState({ x: 0, y: 0 });
  const [floatSize, setFloatSize] = useState({ w: 420, h: 500 });
  const floatInitialized = useRef(false);

  useEffect(() => {
    if (sidebarMode === 'floating' && !floatInitialized.current && typeof window !== 'undefined') {
      setFloatPos({ x: window.innerWidth - 440, y: 80 });
      floatInitialized.current = true;
    }
    if (sidebarMode === 'docked') {
      floatInitialized.current = false;
    }
  }, [sidebarMode]);

  const handleFloatDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const offsetX = e.clientX - floatPos.x;
    const offsetY = e.clientY - floatPos.y;
    const handleMove = (ev: MouseEvent) => {
      setFloatPos({
        x: Math.max(0, Math.min(window.innerWidth - 200, ev.clientX - offsetX)),
        y: Math.max(0, Math.min(window.innerHeight - 100, ev.clientY - offsetY)),
      });
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [floatPos]);

  const handleFloatResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const sw = floatSize.w;
    const sh = floatSize.h;
    const handleMove = (ev: MouseEvent) => {
      setFloatSize({
        w: Math.max(320, sw + (ev.clientX - sx)),
        h: Math.max(300, sh + (ev.clientY - sy)),
      });
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [floatSize]);

  // Migrate away from removed 'autopilot' tab
  useEffect(() => {
    if ((sidePanel as string) === 'autopilot') setSidePanel('ai');
  }, [sidePanel, setSidePanel]);

  return (
    <>
      <ConnectionSetup />
      <PineScriptModal />

      <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
        {/* Header */}
        <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold text-foreground">PhantomX</span>
            </div>

            {/* View Mode Toggle */}
            {isConnected && (
              <div className="flex items-center rounded-lg border border-border overflow-hidden">
                <ViewModeButton active={true} onClick={() => {}} icon={<Activity className="w-3 h-3" />} label="Trading" />
                <Separator orientation="vertical" className="h-5" />
                <ViewModeButton active={false} onClick={() => router.push('/trading')} icon={<LayoutDashboard className="w-3 h-3" />} label="Dashboard" />
                <Separator orientation="vertical" className="h-5" />
                <ViewModeButton active={false} onClick={() => router.push('/pipeline')} icon={<Lightbulb className="w-3 h-3" />} label="Autopilot" />
              </div>
            )}
            {isConnected && <SymbolSelector />}
          </div>

          <div className="flex items-center gap-3">
            {/* Trading status */}
            {isConnected && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted border border-border">
                <span className={`status-dot ${isKilled ? 'killed' : isExecuting ? (isPaused ? 'paused' : 'live') : 'disconnected'}`} />
                <span className="text-[11px] text-muted-foreground">
                  {isKilled ? 'KILLED' : isExecuting ? (isPaused ? 'PAUSED' : 'AUTO-TRADING') : 'MANUAL'}
                </span>
              </div>
            )}

            {/* Agent status dots */}
            {agentStatuses.length > 0 && (
              <button
                onClick={() => setSidePanel('agents')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted border border-border hover:border-primary/20 transition-colors"
                title="Agent Intelligence — click to view"
              >
                {agentStatuses.map(a => (
                  <span key={a.id} className="w-2 h-2 rounded-full" style={{
                    backgroundColor: a.state === 'running' ? '#2D8547' :
                      a.state === 'error' ? '#D4183D' :
                      a.state === 'idle' ? '#B8860B' : 'hsl(var(--muted-foreground))',
                  }} title={`${a.name}: ${a.state}`} />
                ))}
                <span className="text-[9px] text-muted-foreground ml-0.5">AGENTS</span>
              </button>
            )}

            {/* Research Consensus (compact) */}
            <ErrorBoundary fallback="research"><AgentConsensusView compact /></ErrorBoundary>

            {/* Network badge */}
            <Badge
              variant="outline"
              className={`text-[10px] ${
                isConnected
                  ? isTestnet
                    ? 'border-[#2D8547]/20 text-[#2D8547] bg-[#2D8547]/8'
                    : 'border-destructive/20 text-destructive bg-destructive/8'
                  : 'text-muted-foreground'
              }`}
            >
              {isConnected ? (isTestnet ? 'TESTNET' : 'MAINNET') : 'DISCONNECTED'}
            </Badge>
          </div>
        </header>

        <PortfolioBar />
        <AutopilotActivityBar />

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chart (trading terminal) */}
          <div className="flex-1 flex flex-col min-w-0">
            <>
              <div className="flex-1 relative">
                {isConnected ? (
                  <ErrorBoundary fallback="chart"><TradingChart /></ErrorBoundary>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center opacity-30">
                      <Activity className="w-16 h-16 text-primary mx-auto mb-4" strokeWidth={1} />
                      <p className="text-sm text-muted-foreground">Connect to Phemex to start trading</p>
                    </div>
                  </div>
                )}
              </div>
              {isConnected && (
                <div className="h-8 flex items-center px-4 border-t border-border text-[10px] text-muted-foreground gap-4 flex-shrink-0 bg-card">
                  <span>Phemex Perpetual</span>
                  <span className="text-muted-foreground/60">{selectedSymbol}</span>
                  <span>{selectedTimeframe}</span>
                  <div className="flex-1" />
                  <span>Webhook: {isExecuting ? 'Active' : 'Inactive'}</span>
                  <Separator orientation="vertical" className="h-3" />
                  <span>Auto-trade: {isExecuting ? (isPaused ? 'Paused' : 'Running') : 'Off'}</span>
                </div>
              )}
              {isConnected && (
                <ErrorBoundary fallback="chart"><TradeAnalytics /></ErrorBoundary>
              )}
            </>
          </div>

          {/* Right: Sidebar — Docked mode */}
          {sidebarMode === 'docked' && (
            <div className="relative flex flex-col border-l border-border flex-shrink-0 bg-card" style={{ width: sidebarWidth }}>
              {/* Drag resize handle */}
              <div
                onMouseDown={handleResizeStart}
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary active:bg-primary transition-colors z-10"
              />
              <SidebarTabs sidePanel={sidePanel} setSidePanel={setSidePanel} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />
              <SidebarContent sidePanel={sidePanel} />
            </div>
          )}
        </div>

        {/* Floating panel */}
        {sidebarMode === 'floating' && (
          <div
            className="fixed z-50 flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
            style={{ left: floatPos.x, top: floatPos.y, width: floatSize.w, height: floatSize.h }}
          >
            <div
              onMouseDown={handleFloatDragStart}
              className="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border cursor-move select-none flex-shrink-0"
            >
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">PhantomX Panel</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSidebarMode('minimized')}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted/80 text-muted-foreground hover:text-[#B8860B] transition-colors"
                  title="Minimize"
                >
                  <Minus className="w-2.5 h-2.5" />
                </button>
                <button
                  onClick={() => setSidebarMode('docked')}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted/80 text-muted-foreground hover:text-primary transition-colors"
                  title="Dock to side"
                >
                  <PanelRight className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
            <SidebarTabs sidePanel={sidePanel} setSidePanel={setSidePanel} sidebarMode={sidebarMode} setSidebarMode={setSidebarMode} />
            <SidebarContent sidePanel={sidePanel} />
            <div
              onMouseDown={handleFloatResizeStart}
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-30"
              style={{ background: 'linear-gradient(135deg, transparent 50%, currentColor 50%, currentColor 60%, transparent 60%, transparent 70%, currentColor 70%, currentColor 80%, transparent 80%)' }}
            />
          </div>
        )}

        {/* Minimized tab — bottom right */}
        {sidebarMode === 'minimized' && (
          <button
            onClick={() => setSidebarMode('floating')}
            className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border shadow-lg hover:border-primary/20 hover:shadow-xl transition-all cursor-pointer group"
            title="Expand panel"
          >
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">Panel</span>
            <ChevronsUp className="w-2.5 h-2.5 text-muted-foreground" />
          </button>
        )}
      </div>
    </>
  );
}

// --- View mode button ---
function ViewModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-[11px] font-medium transition-colors flex items-center gap-1 ${
        active
          ? 'bg-primary/3 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// --- Sidebar sub-components ---

type SidebarTabsProps = {
  sidePanel: string;
  setSidePanel: (panel: 'ai' | 'strategy' | 'risk' | 'settings' | 'journal' | 'agents' | 'signals') => void;
  sidebarMode: 'docked' | 'floating' | 'minimized';
  setSidebarMode: (mode: 'docked' | 'floating' | 'minimized') => void;
};

function SidebarTabs({ sidePanel, setSidePanel, sidebarMode, setSidebarMode }: SidebarTabsProps) {
  const tabs = [
    { key: 'ai' as const, label: 'AI Chat' },
    { key: 'agents' as const, label: 'Intel' },
    { key: 'signals' as const, label: 'Signals' },
    { key: 'journal' as const, label: 'Journal' },
    { key: 'strategy' as const, label: 'Strategy' },
    { key: 'risk' as const, label: 'Controls' },
    { key: 'settings' as const, label: 'Settings' },
  ] as const;

  return (
    <div className="flex border-b border-border flex-shrink-0">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => setSidePanel(tab.key)}
          className={`flex-1 py-2.5 text-[11px] font-medium transition-colors duration-200 ${
            sidePanel === tab.key
              ? 'text-primary border-b-2 border-primary bg-primary/3'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {tab.label}
        </button>
      ))}
      <button
        onClick={() => setSidebarMode(sidebarMode === 'docked' ? 'floating' : 'docked')}
        className="px-2 py-2.5 text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
        title={sidebarMode === 'docked' ? 'Pop out panel' : 'Dock panel'}
      >
        {sidebarMode === 'docked' ? (
          <ExternalLink className="w-3 h-3" />
        ) : (
          <PanelRight className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}

function SidebarContent({ sidePanel }: { sidePanel: string }) {
  return (
    <div className="flex-1 overflow-hidden">
      {/* ConciergeChatPanel — Axon concierge streaming chat */}
      <div style={{ display: sidePanel === 'ai' ? undefined : 'none' }} className="h-full">
        <ErrorBoundary fallback="chat"><ConciergeChatPanel /></ErrorBoundary>
      </div>
      {sidePanel === 'agents' && <ErrorBoundary fallback="chat"><AgentTeamPanel /></ErrorBoundary>}
      {sidePanel === 'signals' && <ErrorBoundary fallback="chat"><TradeRecommendationPanel /></ErrorBoundary>}
      {sidePanel === 'journal' && <ErrorBoundary fallback="chat"><AxonJournalPanel /></ErrorBoundary>}
      {sidePanel === 'risk' && <ErrorBoundary fallback="chat"><ControlPanel /></ErrorBoundary>}
      {sidePanel === 'strategy' && <ErrorBoundary fallback="chat"><StrategyPanel /></ErrorBoundary>}
      {sidePanel === 'settings' && <ErrorBoundary fallback="chat"><SettingsPanel /></ErrorBoundary>}
    </div>
  );
}

function StrategyPanel() {
  const { strategies, generatedPineScript, setShowPineScriptModal } = useTradingStore();
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Strategy Manager</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <AxonScannerPanel />
        <div className="flex items-center gap-2 py-1">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[9px] text-muted-foreground uppercase tracking-widest">PineScript</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        <button onClick={() => setShowPineScriptModal(true)} className="w-full py-3 rounded-lg bg-primary/5 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/10 transition-colors flex items-center justify-center gap-2">
          <Zap className="w-4 h-4" />
          New PineScript Strategy
        </button>
        {generatedPineScript && (
          <Card className="py-0 gap-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-primary">Latest Generated Strategy</span>
                <button onClick={() => navigator.clipboard.writeText(generatedPineScript)} className="text-[10px] text-muted-foreground hover:text-foreground">Copy</button>
              </div>
              <pre className="text-[10px] font-mono text-muted-foreground max-h-40 overflow-y-auto whitespace-pre">{generatedPineScript.slice(0, 500)}...</pre>
            </CardContent>
          </Card>
        )}
        {strategies.length === 0 && !generatedPineScript && (
          <div className="flex flex-col items-center justify-center py-8 text-center opacity-40">
            <Activity className="w-8 h-8 text-muted-foreground" strokeWidth={1} />
            <p className="text-xs text-muted-foreground mt-2">No strategies yet</p>
          </div>
        )}

        {/* Active Playbook from Paperclip Knowledge */}
        <div className="flex items-center gap-2 py-1">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[9px] text-muted-foreground uppercase tracking-widest">Playbook</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        <StrategyPlaybook className="max-h-[300px]" />
      </div>
    </div>
  );
}

function SettingsPanel() {
  const { isConnected, isTestnet, theme, toggleTheme, setConnected } = useTradingStore();
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border">
        <span className="text-xs font-semibold text-foreground">Settings</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <Card className="py-0 gap-0">
          <CardContent className="p-3">
            <h3 className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Theme</h3>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-muted border border-border hover:bg-muted/80 transition-colors"
            >
              <div className="flex items-center gap-2">
                {theme === 'light' ? <Sun className="w-4 h-4 text-[#B8860B]" /> : <Moon className="w-4 h-4 text-[#1C6BBB]" />}
                <span className="text-xs text-foreground">{theme === 'light' ? 'Light' : 'Dark'} Theme</span>
              </div>
              <span className="text-[10px] text-muted-foreground">Click to toggle</span>
            </button>
          </CardContent>
        </Card>
        <Card className="py-0 gap-0">
          <CardContent className="p-3">
            <h3 className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Connection</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className={isConnected ? 'text-[#2D8547]' : 'text-destructive'}>{isConnected ? 'Connected' : 'Disconnected'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Network</span><span className={isTestnet ? 'text-[#2D8547]' : 'text-destructive'}>{isTestnet ? 'Testnet' : 'Mainnet'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Credentials</span><span className="text-muted-foreground font-mono text-[10px]">{isConnected ? 'ENV (.env.local)' : 'Not connected'}</span></div>
            </div>
            {isConnected && (
              <button onClick={() => setConnected(false)} className="mt-3 w-full py-1.5 rounded-lg text-xs bg-destructive/8 border border-destructive/20 text-destructive hover:bg-destructive/12 transition-colors">Disconnect</button>
            )}
          </CardContent>
        </Card>
        <Card className="py-0 gap-0">
          <CardContent className="p-3">
            <h3 className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">Webhook</h3>
            <div className="space-y-2 text-xs">
              <div><span className="text-muted-foreground block mb-1">Webhook URL</span><code className="block p-2 rounded-lg bg-muted text-[10px] font-mono text-primary border border-border">{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/webhook</code></div>
              <p className="text-[10px] text-muted-foreground">Set this URL in TradingView alert webhooks to auto-execute trades.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0 gap-0">
          <CardContent className="p-3">
            <h3 className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">AI Model</h3>
            <div className="text-xs text-muted-foreground"><p>Claude Opus 4.6 with Extended Thinking</p><p className="text-[10px] text-muted-foreground mt-1">Most powerful model — vision-capable, adaptive reasoning</p></div>
          </CardContent>
        </Card>
        <Card className="py-0 gap-0">
          <CardContent className="p-3">
            <h3 className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2">About</h3>
            <div className="text-xs text-muted-foreground space-y-1"><p><span className="text-foreground">PhantomX</span> v1.0.0</p><p>AI-Powered Phemex Trading Platform</p><p>Built with Next.js, CCXT, Claude Agent SDK</p></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
