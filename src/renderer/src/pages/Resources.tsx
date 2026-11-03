import { ResourceBrowser } from '../ResourceBrowser';
import { useApp } from '../state';
import { Heading, Segments } from '../ui';
import { Workspace } from '../workspace';

export function ResourcesPage() {
  const a = useApp();
  return (
    <Workspace title="资源">
      <Heading title="资源" sub="浏览资源与整合包，安装到独立实例。" />
      <div className="workspace-tabs">
        <Segments
          value={a.resourceCategory}
          options={['模组', '资源包', '光影', '整合包']}
          onChange={a.setResourceCategory}
        />
      </div>
      <ResourceBrowser category={a.resourceCategory} />
    </Workspace>
  );
}
