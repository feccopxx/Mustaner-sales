export interface AgentConfigurationDraft {
  id: string;
  persona: string;
}

export interface AgentConfigurationRepository<T extends { id: string; version: number; persona: string }> {
  latestVersion(): Promise<number>;
  publish(input: { version: number; persona: string; sourceDraftId: string }): Promise<T>;
}

export async function publishAgentConfiguration<T extends { id: string; version: number; persona: string }>(draft: AgentConfigurationDraft, repository: AgentConfigurationRepository<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const version = (await repository.latestVersion()) + 1;
    try { return await repository.publish({ version, persona: draft.persona, sourceDraftId: draft.id }); }
    catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (!['P2002', 'P2034'].includes(String(code)) || attempt === 2) throw error;
    }
  }
  throw new Error('Could not publish agent configuration');
}
