import { tr } from '../../../shared/i18n';
import { ResourceBrowser } from '../ResourceBrowser';
import { useApp } from '../state';
import { Heading, Segments } from '../ui';
import { Workspace } from '../workspace';

export function ResourcesPage() {
  const a = useApp();
  return (
    <Workspace title={tr('App.resources')}>
      <Heading
        title={tr('App.resources')}
        sub={tr('Resources.findResourcesAndModpacksForYourInstances')}
      />
      <div className="workspace-tabs">
        <Segments
          value={a.resourceCategory}
          options={['mods', 'resourcepacks', 'shaders', 'modpacks']}
          onChange={a.setResourceCategory}
        />
      </div>
      <ResourceBrowser category={a.resourceCategory} />
    </Workspace>
  );
}
