import {
    MarkdownRenderer,
    Plugin
} from 'obsidian';

import { TierListSettings } from 'settings';
import { text } from 'stream/consumers';

export async function renderSlot(plugin: Plugin, settings: TierListSettings, slot: HTMLElement): Promise<HTMLElement> {
    const app = plugin.app;
    slot.addClass("tier-list-slot");
    // Check for internal-embed span and replace with img
    const link = slot.find('a.internal-link');
    if (link && !link.getAttribute('href')?.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
        const filePath = link.getAttribute('href');
        if (filePath) {
            const file = app.metadataCache.getFirstLinkpathDest(filePath, '');
            if (file) {
                const fileCache = app.metadataCache.getFileCache(file);
                const parent = link.parentElement;
                if (fileCache && fileCache.frontmatter && fileCache.frontmatter[settings.image] && parent) {
                    let imageSrc = fileCache.frontmatter[settings.image];
                    if (imageSrc.match('http'))
                        imageSrc = `[](${imageSrc})`
                    parent.textContent = '';
                    await MarkdownRenderer.render(app, `!${imageSrc}`, parent, '', plugin);
                    slot.setAttr('href', filePath);
                }
            }
        }
    }

    // Wait for the Exacalidraw render
    setTimeout(() => {
        slot.findAll(".excalidraw-embedded-img").forEach(excalidrawEl => {
            const newElement = excalidrawEl.cloneNode(true);
            excalidrawEl.parentElement?.replaceChild(newElement, excalidrawEl);
        })
    }, 50);

    const child = slot.find('[style*="background"]')
    if (child) {
        slot.style.backgroundColor = child.style.backgroundColor;
    }

    const fileEmbed = slot.find('.internal-embed.file-embed.mod-generic.is-loaded')
    if (fileEmbed) {
        const textNode = findTextNodeRecursive(fileEmbed);
        if (textNode) {
            textNode.nodeValue = fileEmbed.getAttr('alt');
        }
    }

    return slot;
}

function findTextNodeRecursive(element: HTMLElement): Text | null {
    const childNodesArray: ChildNode[] = Array.from(element.childNodes);

    for (const node of childNodesArray) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node as Text;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            const found = findTextNodeRecursive(node as HTMLElement);
            if (found) return found;
        }
    }
    return null;
}

