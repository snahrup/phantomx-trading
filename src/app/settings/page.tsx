'use client';

import AppLayout from '@/components/AppLayout';
import { PageTransition, StaggerList, StaggerItem } from '@/components/motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useTradingStore } from '@/store/trading-store';
import { Moon, Sun, Wifi, WifiOff, Key, Shield } from 'lucide-react';
import DaemonStatus from '@/components/autopilot/DaemonStatus';

export default function SettingsPage() {
  const theme = useTradingStore(s => s.theme);
  const toggleTheme = useTradingStore(s => s.toggleTheme);
  const isConnected = useTradingStore(s => s.isConnected);
  const isTestnet = useTradingStore(s => s.isTestnet);
  const riskParameters = useTradingStore(s => s.riskParameters);

  return (
    <AppLayout
      title="Settings"
      subtitle="Configuration and preferences"
    >
      <PageTransition>
        <StaggerList className="space-y-6 max-w-2xl">
          {/* Theme */}
          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Appearance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? <Moon className="w-4 h-4 text-muted-foreground" /> : <Sun className="w-4 h-4 text-muted-foreground" />}
                    <div>
                      <p className="text-sm font-medium">Dark Mode</p>
                      <p className="text-xs text-muted-foreground">Toggle between light and dark themes</p>
                    </div>
                  </div>
                  <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* Connection */}
          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Phemex Connection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isConnected ? <Wifi className="w-4 h-4 text-claude-green" /> : <WifiOff className="w-4 h-4 text-destructive" />}
                    <div>
                      <p className="text-sm font-medium">Status</p>
                      <p className="text-xs text-muted-foreground">{isConnected ? 'Connected' : 'Disconnected'}</p>
                    </div>
                  </div>
                  <Badge variant={isConnected ? 'default' : 'destructive'}>
                    {isConnected ? (isTestnet ? 'Testnet' : 'Mainnet') : 'Offline'}
                  </Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Key className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">API Configuration</p>
                      <p className="text-xs text-muted-foreground">Manage API keys and connection settings</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                    // Trigger ConnectionSetup modal from PersistentPanels
                    document.dispatchEvent(new CustomEvent('open-connection-setup'));
                  }}>
                    Configure
                  </Button>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* Risk */}
          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Risk Parameters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Risk Level</span>
                    <Badge variant="outline">{riskParameters.level}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Max Position</span>
                    <span>{riskParameters.maxPositionSizePercent}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Stop Loss</span>
                    <span>{riskParameters.stopLossPercent}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Take Profit</span>
                    <span>{riskParameters.takeProfitPercent}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Max Drawdown</span>
                    <span>{riskParameters.maxDrawdownPercent}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Max Positions</span>
                    <span>{riskParameters.maxOpenPositions}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
          {/* Axon Daemon */}
          <StaggerItem>
            <DaemonStatus />
          </StaggerItem>
        </StaggerList>
      </PageTransition>
    </AppLayout>
  );
}
