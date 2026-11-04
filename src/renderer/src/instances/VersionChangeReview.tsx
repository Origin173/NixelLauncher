import type { InstanceVersionPlan } from '../../../shared/contracts';
import { label, tr } from '../../../shared/i18n';
import { Check, Notice, Tag } from '../ui';
import { AssetIcon } from '../workspace';
import './versions.css';

export function VersionChangeReview({
  plan,
  accepted,
  onAccept,
  minecraftChanged,
}: {
  plan: InstanceVersionPlan;
  accepted: boolean;
  onAccept: (accepted: boolean) => void;
  minecraftChanged: boolean;
}) {
  const risks = plan.content.filter((entry) => entry.enabled && entry.status !== 'compatible');
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
        <p className="micro">{tr('versionChange.contentHint')}</p>
        {entries.length ? (
          <ul className="version-content-review">
            {entries.map((entry) => (
              <li key={entry.id}>
                <AssetIcon src={entry.icon} kind={entry.category} />
                <div className="version-content-copy">
                  <strong>{entry.name}</strong>
                  <span className="micro">
                    {entry.fileName}
                    {!entry.enabled && ` · ${tr('versionChange.disabled')}`}
                  </span>
                  {entry.reason && <span className="micro">{entry.reason}</span>}
                </div>
                <Tag
                  color={
                    !entry.enabled
                      ? 'default'
                      : entry.status === 'compatible'
                        ? 'success'
                        : 'warning'
                  }
                >
                  {label(`compatibility-${entry.status}`)}
                </Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">{tr('versionChange.noContent')}</p>
        )}
      </section>
      {risks.length > 0 && (
        <Check label={tr('versionChange.acceptRisks')} value={accepted} onChange={onAccept} />
      )}
    </div>
  );
}
