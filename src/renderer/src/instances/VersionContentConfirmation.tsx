import { useEffect, useRef } from 'react';
import { tr } from '../../../shared/i18n';
import type { VersionContentPlan } from '../../../shared/version-content';
import { useApp } from '../state';
import { Check, Notice, Tag } from '../ui';
export function VersionContentConfirmation({
  plan,
  accepted,
  onAccept,
}: {
  plan: VersionContentPlan;
  accepted: boolean;
  onAccept: (value: boolean) => void;
}) {
  const a = useApp();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.scrollIntoView({ block: 'start' });
  }, []);
  return (
    <div className="stack">
      <h3 ref={heading}>{tr('versionContent.confirm')}</h3>
      <p>
        Minecraft {plan.target.version} · {plan.target.loader} {plan.target.loaderVersion}
      </p>
      <Notice>{tr('versionContent.confirmHint')}</Notice>
      {plan.files.length ? (
        <ul className="version-content-review">
          {plan.files.map((file) => (
            <li key={`${file.source}:${file.projectId}`}>
              <div className="version-content-copy">
                <strong>{file.name}</strong>
                <span>
                  {file.version} ·{' '}
                  {a.providers.find((provider) => provider.id === file.source)?.name || file.source}
                </span>
                <span className="micro mono">{file.fileName}</span>
                {!file.enabled && <Tag>{tr('versionChange.disabled')}</Tag>}
                {file.dependency && <Tag>{tr('versionContent.dependency')}</Tag>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>{tr('versionContent.noDownloads')}</p>
      )}
      {plan.disabled.length > 0 && (
        <Notice>
          {tr('versionContent.disableSummary', {
            names: plan.disabled.map((entry) => entry.name).join(', '),
          })}
        </Notice>
      )}
      {plan.retainedRisks.length > 0 && (
        <Notice tone="warning">
          {tr('versionContent.keepRisks', {
            names: plan.retainedRisks.map((entry) => entry.name).join(', '),
          })}
        </Notice>
      )}
      {plan.minecraftChanged && <Notice tone="warning">{tr('versionChange.worldWarning')}</Notice>}
      {(plan.retainedRisks.length > 0 || plan.minecraftChanged) && (
        <Check label={tr('versionContent.accept')} value={accepted} onChange={onAccept} />
      )}
    </div>
  );
}
