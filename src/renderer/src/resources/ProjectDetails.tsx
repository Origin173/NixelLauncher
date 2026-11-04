import type { ResourceDetails } from '../../../shared/contracts';
import { tr } from '../../../shared/i18n';
import { Empty } from '../ui';
import { ResourceDocument, webUrl } from './ResourceDocument';

export function ProjectDetails({
  details,
  gallery,
}: {
  details: ResourceDetails | null;
  gallery: boolean;
}) {
  if (!details)
    return (
      <Empty
        title={tr('resourceDetails.unsupported')}
        detail={tr('resourceDetails.useProjectPage')}
      />
    );
  if (!gallery)
    return details.description.content.trim() ? (
      <ResourceDocument document={details.description} baseUrl={details.url} />
    ) : (
      <Empty title={tr('resourceDetails.noDescription')} />
    );
  const images = details.gallery.filter((image) => webUrl(image.url)?.startsWith('https:'));
  return images.length ? (
    <div className="resource-gallery">
      {images.map((image, index) => (
        <figure key={image.url}>
          <img
            src={image.url}
            alt={image.title || tr('resourceDetails.screenshot', { number: index + 1 })}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          {(image.title || image.description) && (
            <figcaption>
              {image.title}
              {image.title && image.description ? ' · ' : ''}
              {image.description}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  ) : (
    <Empty title={tr('resourceDetails.noScreenshots')} />
  );
}
