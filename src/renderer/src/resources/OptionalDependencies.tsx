import { useState } from 'react';
import type {
  ResourceDependencySelection,
  ResourceOptionalDependency,
} from '../../../shared/contracts';
import { label, tr } from '../../../shared/i18n';
import { resourceSource } from '../data';
import { useApp } from '../state';
import { Action, Check, Notice, Tag } from '../ui';
import { AssetIcon } from '../workspace';
import { useCatalogRequest } from './useCatalogRequest';

export function useOptionalDependencies(
  projectId: string,
  versionId: string,
  source: string,
  instanceId?: string,
) {
  const key = JSON.stringify([projectId, versionId, source, instanceId]);
  const request = useCatalogRequest<ResourceOptionalDependency[]>(
    'resources.optionalDependencies',
    instanceId && versionId ? { projectId, versionId, source, instanceId } : null,
  );
  const [state, setState] = useState<{ key: string; selected: ResourceDependencySelection[] }>({
    key: '',
    selected: [],
  });
  const selected =
    state.key === key
      ? state.selected.filter((selection) =>
          request.data?.some(
            (entry) =>
              !entry.reason &&
              entry.projectId === selection.projectId &&
              entry.versionId === selection.versionId,
          ),
        )
      : [];
  return {
    ...request,
    selected,
    setSelected: (selected: ResourceDependencySelection[]) => setState({ key, selected }),
    retry: () => {
      setState({ key, selected: [] });
      request.retry();
    },
  };
}

export function OptionalDependencies({
  request,
  instanceId,
  source,
  busy,
}: {
  request: ReturnType<typeof useOptionalDependencies>;
  instanceId: string;
  source: string;
  busy: boolean;
}) {
  const a = useApp();
  if (request.loading)
    return (
      <p role="status" className="muted">
        {tr('optionalDependencies.loading')}
      </p>
    );
  if (request.error)
    return (
      <Notice tone="warning">
        <div className="stack-tight">
          {request.error}
          <Action size="sm" variant="secondary" onPress={request.retry}>
            {tr('resourceDetails.retry')}
          </Action>
        </div>
      </Notice>
    );
  if (!request.data?.length) return null;
  return (
    <section className="optional-dependencies">
      <h3>{tr('optionalDependencies.title')}</h3>
      <p className="micro">{tr('optionalDependencies.hint')}</p>
      <ul className="resource-dependencies">
        {request.data.map((entry) => {
          const installed = a.content.find(
            (content) =>
              content.instance === instanceId &&
              resourceSource(content.source) === resourceSource(source) &&
              content.projectId === entry.projectId,
          );
          const current = installed?.versionId === entry.versionId;
          const disabled = installed?.enabled === false;
          const checked = request.selected.some(
            (item) => item.projectId === entry.projectId && item.versionId === entry.versionId,
          );
          return (
            <li key={`${entry.projectId}:${entry.versionId}:${entry.name}`}>
              <AssetIcon src={entry.icon} kind="mods" />
              <div className="flex-1 stack-tight">
                <Check
                  label={entry.name}
                  value={checked}
                  isDisabled={
                    busy ||
                    Boolean(entry.reason) ||
                    !entry.projectId ||
                    !entry.versionId ||
                    current ||
                    disabled
                  }
                  onChange={(value) =>
                    request.setSelected(
                      value
                        ? [
                            ...request.selected,
                            {
                              projectId: entry.projectId as string,
                              versionId: entry.versionId as string,
                            },
                          ]
                        : request.selected.filter(
                            (item) =>
                              !(
                                item.projectId === entry.projectId &&
                                item.versionId === entry.versionId
                              ),
                          ),
                    )
                  }
                />
                <span className="micro">
                  {entry.reason ||
                    (disabled ? tr('optionalDependencies.enableFirst') : entry.version)}
                </span>
              </div>
              {installed && (
                <Tag>
                  {disabled
                    ? label('disabled')
                    : current
                      ? label('installed')
                      : tr('optionalDependencies.update')}
                </Tag>
              )}
            </li>
          );
        })}
      </ul>
      {request.data.some((entry) => entry.reason) && (
        <Action size="sm" variant="ghost" onPress={request.retry}>
          {tr('resourceDetails.retry')}
        </Action>
      )}
    </section>
  );
}
