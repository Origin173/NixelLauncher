import type { Resource, ResourceVersionDetails } from '../../../shared/contracts';
import { label, tr } from '../../../shared/i18n';
import { Action, Notice, Tag } from '../ui';
import { ResourceDocument, webUrl } from './ResourceDocument';
import { useCatalogRequest } from './useCatalogRequest';

export function VersionDetails({
  resource,
  versionId,
  baseUrl,
  hideOptional = false,
}: {
  resource: Resource;
  versionId: string;
  baseUrl?: string;
  hideOptional?: boolean;
}) {
  const { data, loading, error, retry } = useCatalogRequest<ResourceVersionDetails>(
    'resources.versionDetails',
    {
      projectId: resource.id,
      source: resource.source,
      versionId,
    },
  );
  if (loading)
    return (
      <p role="status" className="muted">
        {tr('resourceDetails.loadingVersion')}
      </p>
    );
  if (error)
    return (
      <Notice tone="danger">
        <div className="stack-tight">
          {error}
          <Action size="sm" variant="secondary" onPress={retry}>
            {tr('resourceDetails.retry')}
          </Action>
        </div>
      </Notice>
    );
  if (!data) return <p className="muted">{tr('resourceDetails.unsupportedVersion')}</p>;
  const dependencies = data.dependencies.filter(
    (entry) => !hideOptional || entry.type !== 'optional',
  );
  return (
    <div className="resource-version-details stack">
      {(!hideOptional || dependencies.length > 0) && (
        <section>
          <h3>{tr('resourceDetails.dependencies')}</h3>
          {dependencies.length ? (
            <>
              <p className="micro">{tr('resourceDetails.dependenciesHint')}</p>
              <ul className="resource-dependencies">
                {dependencies.map((dependency) => (
                  <li
                    key={`${dependency.projectId}:${dependency.versionId}:${dependency.type}:${dependency.name}`}
                  >
                    <span className="flex-1">{dependency.name}</span>
                    <Tag color={dependency.type === 'incompatible' ? 'danger' : 'default'}>
                      {label(`dependency-${dependency.type}`)}
                    </Tag>
                    {dependency.url && webUrl(dependency.url) && (
                      <Action
                        size="sm"
                        variant="ghost"
                        icon="external"
                        onPress={() => void window.nixel.openExternal(dependency.url as string)}
                      >
                        {tr('overlays.viewProject')}
                      </Action>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">{tr('resourceDetails.noDependencies')}</p>
          )}
        </section>
      )}
      <section>
        <h3>{tr('resourceDetails.changelog')}</h3>
        {data.changelog.content.trim() ? (
          <ResourceDocument document={data.changelog} baseUrl={baseUrl} />
        ) : (
          <p className="muted">{tr('resourceDetails.noChangelog')}</p>
        )}
      </section>
    </div>
  );
}
