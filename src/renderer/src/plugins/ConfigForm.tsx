import { useState } from 'react';
import { tr } from '../../../shared/i18n';
import type { PluginConfigSchema } from '../../../shared/plugin-distribution';
import { Choice, Field, IconButton, Notice, Toggle } from '../ui';

function scalar(schema: Record<string, unknown>) {
  return (
    ['string', 'number', 'integer', 'boolean'].includes(String(schema.type)) &&
    !['$ref', 'oneOf', 'anyOf', 'allOf', 'if'].some((key) => key in schema)
  );
}
export function ConfigForm({
  schema,
  value,
  onChange,
}: {
  schema?: PluginConfigSchema;
  value: string;
  onChange(value: string): void;
}) {
  const [json, setJson] = useState(false);
  let config: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed;
  } catch {
    /* Keep invalid JSON editable until the user saves. */
  }
  const properties = schema?.properties as Record<string, Record<string, unknown>> | undefined;
  const simple = Boolean(
    properties &&
      Object.values(properties).every((item) => item && scalar(item)) &&
      !['$ref', 'oneOf', 'anyOf', 'allOf', 'if', 'patternProperties'].some(
        (key) => key in (schema ?? {}),
      ),
  );
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const update = (key: string, next: unknown) => {
    const result = { ...config };
    if (next === undefined) delete result[key];
    else
      Object.defineProperty(result, key, {
        value: next,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    onChange(JSON.stringify(result, null, 2));
  };
  return (
    <div className="stack">
      {simple && (
        <div className="row spread">
          <span>{tr('pluginDist.configJson')}</span>
          <Toggle label={tr('pluginDist.configJson')} value={json} onChange={setJson} />
        </div>
      )}
      {!simple || json || !config ? (
        <>
          {schema && !simple && <Notice>{tr('pluginDist.complex')}</Notice>}
          <label htmlFor="plugin-config-json">{tr('pluginDist.configJson')}</label>
          <textarea
            id="plugin-config-json"
            className="json-editor"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </>
      ) : (
        Object.entries(properties ?? {}).map(([key, item]) => {
          const title = typeof item.title === 'string' ? item.title : key;
          const label = required.includes(key) ? tr('pluginDist.required', { name: title }) : title;
          const description = typeof item.description === 'string' ? item.description : undefined;
          const current = config?.[key];
          return (
            <div key={key} className="row">
              <div className="flex-1 stack-tight">
                {Array.isArray(item.enum) ? (
                  <Choice
                    label={label}
                    value={current === undefined ? '' : JSON.stringify(current)}
                    onChange={(next) => update(key, next === '' ? undefined : JSON.parse(next))}
                    options={[
                      { id: '', name: tr('pluginDist.unset') },
                      ...item.enum.map((entry) => ({
                        id: JSON.stringify(entry),
                        name: String(entry),
                      })),
                    ]}
                    description={description}
                  />
                ) : item.type === 'boolean' && current === undefined ? (
                  <Choice
                    label={label}
                    value=""
                    onChange={(next) => update(key, next === '' ? undefined : next === 'true')}
                    options={[
                      { id: '', name: tr('pluginDist.unset') },
                      { id: 'false', name: tr('pluginDist.false') },
                      { id: 'true', name: tr('pluginDist.true') },
                    ]}
                    description={description}
                  />
                ) : item.type === 'boolean' ? (
                  <div className="row spread">
                    <span>{label}</span>
                    <Toggle
                      label={label}
                      value={current === true}
                      onChange={(next) => update(key, next)}
                    />
                  </div>
                ) : (
                  <Field
                    label={label}
                    value={current === undefined ? '' : String(current)}
                    description={description}
                    type={item.type === 'string' ? 'text' : 'number'}
                    onChange={(next) =>
                      update(
                        key,
                        item.type === 'string' ? next : next === '' ? undefined : Number(next),
                      )
                    }
                  />
                )}
              </div>
              {current !== undefined && !required.includes(key) && (
                <IconButton
                  icon="close"
                  label={tr('pluginDist.unset')}
                  onPress={() => update(key, undefined)}
                />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
