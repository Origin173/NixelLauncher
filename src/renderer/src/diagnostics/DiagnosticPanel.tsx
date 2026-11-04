import { useState } from 'react';
import type { DiagnosticReport } from '../../../shared/diagnostics';
import { i18n, tr } from '../../../shared/i18n';
import { useApp } from '../state';
import { Action, Dialog, Notice } from '../ui';

export function DiagnosticPanel({ id }: { id: string }) {
  const a = useApp();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<DiagnosticReport>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!a.plugins.some((plugin) => plugin.id === 'nixel.diagnostics' && plugin.status === 'active'))
    return null;
  async function analyze() {
    setOpen(true);
    setBusy(true);
    setReport(undefined);
    setError('');
    try {
      setReport(await window.nixel.invoke<DiagnosticReport>('diagnostics.analyze', { id }));
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  async function exportReport() {
    const path = await window.nixel.selectPath({
      kind: 'save',
      title: tr('diagnostics.export'),
      defaultPath: 'nixel-diagnostics.zip',
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (path && (await a.command('diagnostics.export', { id, path }))) a.setTaskOpen(true);
  }
  return (
    <>
      <div className="row">
        <Action
          size="sm"
          variant="secondary"
          icon="info"
          isDisabled={busy}
          onPress={() => void analyze()}
        >
          {tr('diagnostics.analyze')}
        </Action>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={tr('diagnostics.title')}
        description={tr('diagnostics.scope')}
        footer={
          <Action size="sm" icon="download" isDisabled={busy} onPress={() => void exportReport()}>
            {tr('diagnostics.export')}
          </Action>
        }
      >
        <div className="stack">
          <p className="micro">{tr('diagnostics.privacy')}</p>
          {busy && <p role="status">{tr('diagnostics.collecting')}</p>}
          {error && <Notice tone="danger">{error}</Notice>}
          {report && (
            <>
              {!report.sources.length && <Notice>{tr('diagnostics.noSources')}</Notice>}
              {!!report.sources.length && !report.findings.length && (
                <Notice>{tr('diagnostics.empty')}</Notice>
              )}
              {report.warnings.map((warning) => (
                <Notice key={warning} tone="danger">
                  {warning}
                </Notice>
              ))}
              {report.findings.map((finding) => (
                <section key={finding.code} className="stack">
                  <h3>{tr(`diagnostics.${finding.code}.title`)}</h3>
                  <p className="micro">{tr(`diagnostics.${finding.code}.help`)}</p>
                  {finding.evidence.map((entry) => (
                    <details key={`${entry.source}:${entry.line}`}>
                      <summary>
                        {tr('diagnostics.evidence', { source: entry.source, line: entry.line })}
                      </summary>
                      <pre className="game-log">{entry.text}</pre>
                    </details>
                  ))}
                  {!!finding.relatedFiles.length && (
                    <p className="micro">
                      {tr('diagnostics.related', { files: finding.relatedFiles.join(', ') })}
                    </p>
                  )}
                </section>
              ))}
              <h3>{tr('diagnostics.sources')}</h3>
              {report.sources.map((source) => (
                <details key={source.name}>
                  <summary>
                    {tr('diagnostics.source', {
                      name: source.name,
                      date: new Date(source.modifiedAt).toLocaleString(i18n.language),
                    })}
                  </summary>
                  {source.truncated && <p className="micro">{tr('diagnostics.truncated')}</p>}
                  <pre className="game-log">{source.text}</pre>
                </details>
              ))}
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
