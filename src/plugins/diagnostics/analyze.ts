import type { DiagnosticCode, DiagnosticFinding, DiagnosticSource } from '../../shared/diagnostics';
import { type MessageKey, tr } from '../../shared/i18n';

function javaMessage(key: MessageKey) {
  return ['en-US', 'zh-CN']
    .map((lng) =>
      tr(key, { lng, value1: 'JAVA_MAJOR', value2: 'JAVA_MAJOR' })
        .split('JAVA_MAJOR')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\d+'),
    )
    .join('|');
}

// These are signatures emitted by Java/loaders, not guesses based on exit codes.
const rules: { code: DiagnosticCode; pattern: RegExp }[] = [
  {
    code: 'memory',
    pattern:
      /OutOfMemoryError|Could not reserve enough space|Native memory allocation .* failed|insufficient memory for the Java Runtime/i,
  },
  {
    code: 'java-missing',
    pattern: new RegExp(
      /spawn .*java(?:w)?(?:\.exe)?.*ENOENT|(?:java|javaw)(?:\.exe)?['"]? (?:is not recognized|not found)|No Java runtime present|Unable to locate a Java Runtime/
        .source +
        '|' +
        javaMessage('game.thisVersionRequiresJavaValueChooseA'),
      'i',
    ),
  },
  {
    code: 'java-version',
    pattern: new RegExp(
      /UnsupportedClassVersionError|class file version [\d.]+.*(?:only recognizes|up to)|Unsupported major\.minor version/
        .source +
        '|' +
        javaMessage('game.thisVersionRequiresJavaValueJavaValue'),
      'i',
    ),
  },
  {
    code: 'dependencies',
    pattern:
      /Incompatible mods found|ModResolutionException|Mod resolution encountered an incompatible mod set|Missing mandatory dependencies|Missing or unsupported mandatory dependencies|Mod .* requires .* (?:missing|wrong version)|requires .*,? which is missing|net\.minecraftforge\.fml\.LoadingFailedException/i,
  },
  {
    code: 'mixin',
    pattern:
      /MixinApplyError|MixinTransformerError|InvalidMixinException|Mixin apply .* failed|Critical injection failure/i,
  },
  {
    code: 'native',
    pattern:
      /A fatal error has been detected by the Java Runtime|EXCEPTION_ACCESS_VIOLATION|SIGSEGV.*(?:pc=|\()/i,
  },
];

export function analyzeDiagnostics(sources: DiagnosticSource[], files: string[]) {
  const findings: DiagnosticFinding[] = [];
  for (const rule of rules) {
    const evidence: DiagnosticFinding['evidence'] = [];
    for (const source of sources) {
      const lines = source.text.split('\n');
      for (let index = 0; index < lines.length && evidence.length < 8; index++) {
        if (rule.pattern.test(lines[index] ?? ''))
          evidence.push({
            source: source.name,
            line: index + 1,
            text: lines.slice(index, index + 4).join('\n'),
          });
      }
    }
    if (evidence.length)
      findings.push({
        code: rule.code,
        evidence,
        relatedFiles: files.filter((file) =>
          evidence.some((entry) => entry.text.includes(file.replace(/\.disabled$/, ''))),
        ),
      });
  }
  return findings;
}
