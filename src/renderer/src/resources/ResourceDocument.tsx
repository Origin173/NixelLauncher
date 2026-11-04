import { toast } from '@heroui/react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useRef } from 'react';
import type { ResourceDocument as DocumentContent } from '../../../shared/contracts';
import { errorMessage } from '../../../shared/error-message';
import { tr } from '../../../shared/i18n';

export function webUrl(value: string, base?: string) {
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function ResourceDocument({
  document,
  baseUrl,
}: {
  document: DocumentContent;
  baseUrl?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    const html =
      document.format === 'markdown'
        ? marked.parse(document.content, { async: false })
        : document.content;
    const fragment = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'br',
        'hr',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'strong',
        'b',
        'em',
        'i',
        's',
        'del',
        'ul',
        'ol',
        'li',
        'a',
        'img',
        'blockquote',
        'pre',
        'code',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'details',
        'summary',
        'div',
        'span',
        'sup',
        'sub',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan'],
      ALLOW_DATA_ATTR: false,
      RETURN_DOM_FRAGMENT: true,
    });
    for (const link of fragment.querySelectorAll('a')) {
      const href = link.getAttribute('href');
      const url = href ? webUrl(href, baseUrl) : undefined;
      if (url) link.setAttribute('href', url);
      else link.removeAttribute('href');
    }
    for (const image of fragment.querySelectorAll('img')) {
      const src = image.getAttribute('src');
      const url = src ? webUrl(src, baseUrl) : undefined;
      if (url?.startsWith('https:')) {
        image.src = url;
        image.referrerPolicy = 'no-referrer';
        image.loading = 'lazy';
      } else image.remove();
    }
    container.replaceChildren(fragment);
    // Delegate native anchor clicks, including keyboard activation, without navigating Electron.
    const openLink = (event: MouseEvent) => {
      if (event.button !== 0 && event.button !== 1) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link) return;
      event.preventDefault();
      const url = link.getAttribute('href');
      if (url)
        void window.nixel
          .openExternal(url)
          .catch((error) =>
            toast.danger(tr('state.operationFailed'), { description: errorMessage(error) }),
          );
    };
    container.addEventListener('click', openLink);
    container.addEventListener('auxclick', openLink);
    return () => {
      container.removeEventListener('click', openLink);
      container.removeEventListener('auxclick', openLink);
    };
  }, [document.content, document.format, baseUrl]);
  return <div ref={root} className="resource-document" />;
}
