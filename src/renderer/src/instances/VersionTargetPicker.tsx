import { useEffect, useState } from 'react';
import type {
  Instance,
  InstanceVersionTarget,
  Loader,
  VersionEntry,
} from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import { tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Check, Choice, Notice, Search, SettingRow } from '../ui';

export function VersionTargetPicker({
  instance,
  onReview,
}: {
  instance: Instance;
  onReview: (target: InstanceVersionTarget) => void;
}) {
  const a = useApp();
  const [target, setTarget] = useState<InstanceVersionTarget>({
    version: instance.version,
    loader: instance.loader,
    loaderVersion: instance.loaderVersion,
  });
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loaders, setLoaders] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaderLoading, setLoaderLoading] = useState(false);
  const [versionError, setVersionError] = useState('');
  const [loaderError, setLoaderError] = useState('');
  const [query, setQuery] = useState('');
  const [snapshots, setSnapshots] = useState(false);
  useEffect(() => {
    let active = true;
    window.nixel
      .invoke<VersionEntry[]>('game.versions', { instanceId: instance.id })
      .then((items) => {
        if (active) setVersions(items);
      })
      .catch((error) => {
        if (active) setVersionError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [instance.id]);
  useEffect(() => {
    setLoaderError('');
    if (target.loader === 'Vanilla') {
      setLoaders([]);
      setLoaderLoading(false);
      return;
    }
    let active = true;
    setLoaderLoading(true);
    window.nixel
      .invoke<VersionEntry[]>('game.loaders', {
        instanceId: instance.id,
        version: target.version,
        loader: target.loader,
      })
      .then((items) => {
        if (!active) return;
        setLoaders(items);
        setTarget((current) => ({
          ...current,
          loaderVersion: items.some((item) => item.id === current.loaderVersion)
            ? current.loaderVersion
            : items[0]?.id,
        }));
      })
      .catch((error) => {
        if (active) setLoaderError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoaderLoading(false);
      });
    return () => {
      active = false;
    };
  }, [instance.id, target.version, target.loader]);
  const capabilities =
    a.providers.find(
      (provider) => provider.kind === 'game' && provider.id === instance.providers.game,
    )?.capabilities ?? [];
  const choices = versions.filter(
    (version) =>
      (snapshots || version.type === 'release' || version.id === target.version) &&
      (version.id.includes(query) || version.id === target.version),
  );
  const same =
    target.version === instance.version &&
    target.loader === instance.loader &&
    target.loaderVersion === instance.loaderVersion;
  return (
    <div className="stack version-target-picker">
      <div className="row version-target-filter">
        <Search
          value={query}
          onChange={setQuery}
          placeholder={tr('overlays.findMinecraftVersions')}
        />
        <Check label={tr('overlays.showSnapshots')} value={snapshots} onChange={setSnapshots} />
      </div>
      <SettingRow title="Minecraft">
        <Choice
          label={tr('overlays.gameVersion')}
          value={target.version}
          isDisabled={loading}
          options={choices.map((version) => ({ id: version.id, name: version.id }))}
          onChange={(version) => {
            setLoaders([]);
            setTarget({ ...target, version, loaderVersion: undefined });
          }}
        />
      </SettingRow>
      <SettingRow title={tr('overlays.loader')}>
        <Choice
          label={tr('overlays.loader')}
          value={target.loader}
          options={capabilities.map((id) => ({ id, name: id }))}
          onChange={(loader) => {
            setLoaders([]);
            setTarget({ ...target, loader: loader as Loader, loaderVersion: undefined });
          }}
        />
      </SettingRow>
      {target.loader !== 'Vanilla' && (
        <SettingRow title={tr('versionChange.loaderVersion')}>
          <Choice
            label={tr('versionChange.loaderVersion')}
            value={target.loaderVersion ?? ''}
            isDisabled={loaderLoading || !loaders.length}
            options={loaders.map((version) => ({ id: version.id, name: version.id }))}
            onChange={(loaderVersion) => setTarget({ ...target, loaderVersion })}
          />
        </SettingRow>
      )}
      {(loading || loaderLoading) && (
        <p role="status" className="muted">
          {tr('versionChange.loadingVersions')}
        </p>
      )}
      {(versionError || loaderError) && (
        <Notice tone="danger">{versionError || loaderError}</Notice>
      )}
      {!loaderLoading && !loaderError && target.loader !== 'Vanilla' && !loaders.length && (
        <Notice tone="warning">{tr('game.noCompatibleLoaderVersionFound')}</Notice>
      )}
      <div className="row">
        <Action
          icon="arrow"
          isDisabled={
            loading ||
            loaderLoading ||
            Boolean(versionError || loaderError) ||
            same ||
            !versions.some((version) => version.id === target.version) ||
            (target.loader !== 'Vanilla' && !target.loaderVersion)
          }
          onPress={() => onReview(target)}
        >
          {tr('versionChange.review')}
        </Action>
      </div>
    </div>
  );
}
