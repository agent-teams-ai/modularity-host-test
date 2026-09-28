import type { Read, Write } from '../graph.ts';
export function create(deps: Record<string, never>, owner: { reserve(): (resource: { dispose(): void }) => void; effect(value: string): void; read<T>(read: () => T): T }): Promise<{ instance: { resourceId: string }; capabilities: { 'test/resource/read': Read; 'test/resource/write': Write } }>;
