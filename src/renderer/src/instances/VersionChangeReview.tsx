import type { InstanceVersionPlan } from '../../../shared/contracts';
import { label, tr } from '../../../shared/i18n';
import type { VersionContentChoice } from '../../../shared/version-content';
import { Choice, Notice, Tag } from '../ui';
import { AssetIcon } from '../workspace';
import './versions.css';
export function VersionChangeReview({
  plan,
  choices,
  onChange,
  minecraftChanged,
  pending,
}: {
  plan: InstanceVersionPlan;
  choices: Record<string, VersionContentChoice>;
  onChange: (id: string, choice: VersionContentChoice | undefined) => void;
  minecraftChanged: boolean;
  pending: boolean;
}) {
  const entries = [...plan.content].sort(
    (a, b) =>
      Number(b.enabled && b.status !== 'compatible') -
      Number(a.enabled && a.status !== 'compatible'),
  );
  return (
    <div className="stack">
      <p className="version-target-summary">
        Minecraft {plan.target.version}
        <span className="muted">
          {plan.target.loader} {plan.target.loaderVersion}
        </span>
      </p>
      <p>{tr('versionChange.backupHint')}</p>
      {minecraftChanged && <Notice tone="warning">{tr('versionChange.worldWarning')}</Notice>}
      <section>
        <h3>{tr('versionChange.contentTitle')}</h3>
        <p className="micro">{tr('versionContent.selectHint')}</p>
        {entries.length ? (
          <ul className="version-content-review">
            {entries.map((entry) => {
              const choice = choices[entry.id];
              return (
                <li key={entry.id}>
                  <AssetIcon src={entry.icon} kind={entry.category} />
                  <div className="version-content-copy">
                    <strong>{entry.name}</strong>
                    <span className="micro">
                      {entry.fileName}
                      {!entry.enabled && ` · ${tr('versionChange.disabled')}`}
                    </span>
                    {entry.reason && <span className="micro">{entry.reason}</span>}
                    <Tag color={entry.status === 'compatible' ? 'success' : 'warning'}>
                      {label(`compatibility-${entry.status}`)}
                    </Tag>
                    <Choice
                      label={entry.name}
                      value={choice?.action || ''}
                      isDisabled={pending}
                      options={[
                        { id: '', name: tr('versionContent.choose') },
                        { id: 'keep', name: tr('versionContent.keep') },
                        ...(entry.enabled
                          ? [{ id: 'disable', name: tr('versionContent.disable') }]
                          : []),
                        ...(entry.candidates.length
                          ? [{ id: 'update', name: tr('versionContent.update') }]
                          : []),
                      ]}
                      onChange={(action) => {
                        if (action === 'keep' || action === 'disable')
                          onChange(entry.id, { action });
                        else if (action === 'update')
                          onChange(entry.id, { action, versionId: entry.candidates[0]?.id || '' });
                        else onChange(entry.id, undefined);
                      }}
                    />
                    {choice?.action === 'update' && (
                      <Choice
                        label={tr('versionContent.version')}
                        value={choice.versionId}
                        isDisabled={pending}
                        options={entry.candidates}
                        onChange={(versionId) =>
                          onChange(entry.id, { action: 'update', versionId })
                        }
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">{tr('versionChange.noContent')}</p>
        )}
      </section>
    </div>
  );
}
