export interface AppsPlatformInfo {
  name: string;
  environment: string;
  dataDir: string;
  appCount: number;
  supportedRuntimes: string[];
}

export interface AppsAppSummary {
  name: string;
  enabled: boolean;
  accessible: boolean;
  deploymentCount: number;
}

export interface AppsDeploymentRecord {
  id: string;
  version: string;
  deployedAt: string;
}

export declare class AppsClient {
  constructor(options?: { baseUrl?: string; headers?: Record<string, string> });
  platform(): Promise<AppsPlatformInfo>;
  apps(): Promise<AppsAppSummary[]>;
  events(params?: Record<string, string | number>): Promise<any[]>;
  deployments(name: string): Promise<AppsDeploymentRecord[]>;
  metrics(name: string): Promise<any>;
  deploy(name: string, sourcePath: string): Promise<any>;
  rollback(name: string, releaseId?: string): Promise<any>;
}
