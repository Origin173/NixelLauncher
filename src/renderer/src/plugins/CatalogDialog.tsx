import { useState } from 'react';
import { errorMessage } from '../../../shared/error-message';
import { tr } from '../../../shared/i18n';
import type { PluginCatalog, PluginInstallPreview } from '../../../shared/plugin-distribution';
import { useApp } from '../state';
import { Action, Choice, Dialog, Field, Notice, Tag } from '../ui';
import { ConfigForm } from './ConfigForm';

export function CatalogDialog({ onClose }: { onClose(): void }) {
  const a = useApp();
  const initial = a.plugins.find((item) => item.id === 'nixel.plugin-distribution')?.config
    .catalogUrl;
  const [url, setUrl] = useState(typeof initial === 'string' ? initial : '');
  const [catalog, setCatalog] = useState<PluginCatalog & { source: string }>();
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PluginInstallPreview>();
  const [config, setConfig] = useState('{}');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open
      wide
      title={tr('pluginDist.title')}
      onClose={onClose}
      footer={
        <Action variant="secondary" onPress={onClose}>
          {tr('pluginDist.close')}
        </Action>
      }
    >
      <div className="stack">
        <Field label={tr('pluginDist.source')} value={url} onChange={setUrl} type="url" />
        <Action
          isPending={pending}
          onPress={() =>
            void run(async () => {
              setPreview(undefined);
              setCatalog(undefined);
              await window.nixel.invoke('pluginCatalog.configure', { url });
              setCatalog(await window.nixel.invoke('pluginCatalog.list'));
            })
          }
        >
          {tr('pluginDist.load')}
        </Action>
        {error && <Notice tone="danger">{error}</Notice>}
        {!catalog && <p className="muted">{tr('pluginDist.empty')}</p>}
        {catalog && !catalog.packages.length && <p>{tr('pluginDist.noPackages')}</p>}
        {catalog &&
          [...new Set(catalog.packages.map((item) => item.manifest.id))].map((id) => {
            const releases = catalog.packages.filter((item) => item.manifest.id === id);
            const first = releases[0];
            if (!first) return null;
            const version = versions[id] ?? first.manifest.version;
            const item = releases.find((item) => item.manifest.version === version) ?? first;
            const installed = a.plugins.find((item) => item.id === id);
            return (
              <div className="stack" key={id}>
                <div className="row spread">
                  <strong>{item.manifest.name}</strong>
                  {installed && <Tag>{installed.version}</Tag>}
                </div>
                <p className="micro muted">{item.manifest.description}</p>
                <div className="row">
                  <Choice
                    label={item.manifest.name}
                    value={version}
                    options={releases.map((item) => ({
                      id: item.manifest.version,
                      name: item.manifest.version,
                    }))}
                    onChange={(version) => {
                      setVersions((current) => ({ ...current, [id]: version }));
                      setPreview(undefined);
                    }}
                  />
                  <Action
                    isDisabled={pending}
                    variant="secondary"
                    onPress={() =>
                      void run(async () => {
                        const next = await window.nixel.invoke<PluginInstallPreview>(
                          'pluginCatalog.preview',
                          { id, version },
                        );
                        setPreview(next);
                        setConfig(JSON.stringify(next.config, null, 2));
                      })
                    }
                  >
                    {tr('pluginDist.preview')}
                  </Action>
                </div>
              </div>
            );
          })}
        {preview && (
          <div className="stack">
            <Notice>{tr('pluginDist.trust')}</Notice>
            <strong>{preview.package.manifest.name}</strong>
            <p>
              {tr('pluginDist.version', {
                current: preview.installedVersion ?? tr('pluginDist.new'),
                target: preview.package.manifest.version,
              })}
            </p>
            <p className="micro">{tr('pluginDist.sourceLabel', { source: preview.source })}</p>
            <p className="micro" style={{ overflowWrap: 'anywhere' }}>
              {preview.package.url}
              <br />
              SHA-256 {preview.package.sha256}
            </p>
            {preview.problems.map((problem) => (
              <Notice key={problem} tone="danger">
                {problem}
              </Notice>
            ))}
            {preview.package.manifest.configSchema && (
              <ConfigForm
                schema={preview.package.manifest.configSchema}
                value={config}
                onChange={setConfig}
              />
            )}
            <Action
              isDisabled={pending || preview.problems.length > 0}
              onPress={() =>
                void run(async () => {
                  await window.nixel.invoke('pluginCatalog.install', {
                    preview: { ...preview, config: JSON.parse(config) },
                  });
                  onClose();
                  a.setTaskOpen(true);
                })
              }
            >
              {tr('pluginDist.install')}
            </Action>
          </div>
        )}
      </div>
    </Dialog>
  );
}
