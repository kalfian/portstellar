export type Status = "running" | "stopped" | "reserved" | "unknown";
export type Protocol = "tcp" | "udp";

export interface Host {
  id: string;
  name: string;
  ip: string;
  note?: string;
}

export interface Category {
  id: string;
  label: string;
  color: string;
}

export interface Service {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol?: Protocol;
  category?: string;
  url?: string;
  description?: string;
  tags?: string[];
  status?: Status;
}

export interface PortsConfig {
  name: string;
  pingIntervalMs: number;
  hosts: Host[];
  categories: Category[];
  services: Service[];
}

// Raw JSON shape (services nested inside hosts)
export interface RawService {
  id: string;
  name: string;
  port: number;
  protocol?: Protocol;
  category?: string;
  url?: string;
  description?: string;
  tags?: string[];
  status?: Status;
}

export interface RawHost extends Host {
  services?: RawService[];
}

export interface RawConfig {
  name?: string;
  pingIntervalMs?: number;
  hosts: RawHost[];
  categories: Category[];
}
