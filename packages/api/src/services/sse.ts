import { Response } from "express";

type SSEClient = {
  id: string;
  res: Response;
};

const clients = new Map<string, SSEClient>();

export function addClient(id: string, res: Response): void {
  clients.set(id, { id, res });
}

export function removeClient(id: string): void {
  clients.delete(id);
}

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients.values()) {
    try {
      client.res.write(payload);
    } catch {
      clients.delete(client.id);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
