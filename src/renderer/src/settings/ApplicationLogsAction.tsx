import { toast } from '@heroui/react';
import { tr } from '../../../shared/i18n';
import { Action } from '../ui';

export function ApplicationLogsAction() {
  return (
    <Action
      icon="folder"
      variant="secondary"
      size="sm"
      onPress={async () => {
        try {
          await window.nixel.openApplicationLogs();
        } catch (error) {
          toast.danger(tr('state.operationFailed'), {
            description: error instanceof Error ? error.message : String(error),
          });
        }
      }}
    >
      {tr('applicationLogs.open')}
    </Action>
  );
}
